import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ReportScope = 'global' | 'department';

interface GenerateReportPayload {
  from: string;
  to: string;
  scope: ReportScope;
  department_id?: string | null;
  include_heads?: boolean;
  format?: 'csv';
}

interface RuleVersionRow {
  id: string;
  version: string;
  config: Record<string, unknown>;
}

const encoder = new TextEncoder();

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'date,employee_name,employee_email,department,status\n';

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const raw = value === null || value === undefined ? '' : String(value);
    const escaped = raw.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  }
  return lines.join('\n');
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, (i + 1) * 300));
    }
  }
  throw lastError;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: authData, error: authError } = await admin.auth.getUser(token);

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const payload = (await req.json()) as GenerateReportPayload;

    const from = payload.from;
    const to = payload.to;
    const scope = payload.scope || 'global';
    const departmentId = payload.department_id ?? null;
    const includeHeads = Boolean(payload.include_heads);

    if (!from || !to || !scope) {
      return new Response(JSON.stringify({ error: 'Parámetros inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startedAt = new Date().toISOString();
    const startEpoch = Date.now();
    let retriesUsed = 0;

    const { data: tzConfig } = await admin
      .from('app_config')
      .select('value')
      .eq('key', 'global_timezone')
      .maybeSingle();

    const { data: activeRuleVersion } = await admin
      .from('attendance_rule_versions')
      .select('id, version, config')
      .eq('is_active', true)
      .maybeSingle<RuleVersionRow>();

    const resolvedRuleVersion = activeRuleVersion?.version || 'v1.0.0';

    const rulesParams = {
      include_heads: includeHeads,
      global_timezone: tzConfig?.value ?? null,
      rule_config: activeRuleVersion?.config ?? {},
    };

    const { data: runData, error: runInsertError } = await admin
      .from('report_runs')
      .insert({
        requested_by: userId,
        scope,
        department_id: departmentId,
        filters: { include_heads: includeHeads },
        period_start: from,
        period_end: to,
        rules_version: resolvedRuleVersion,
        rule_version_id: activeRuleVersion?.id ?? null,
        rules_params: rulesParams,
        status: 'running',
        started_at: startedAt,
      })
      .select('id')
      .single();

    if (runInsertError || !runData?.id) throw runInsertError || new Error('No se pudo crear report_run');

    const runId = runData.id as string;

    try {
      const rpcData = await withRetry(async () => {
        const { data, error } = await admin.rpc('get_attendance_report_monthly', {
          _from: from,
          _to: to,
          _department_id: departmentId,
          _scope: scope,
          _include_heads: includeHeads,
        });

        if (error) {
          retriesUsed += 1;
          throw error;
        }
        return (data || []) as Record<string, unknown>[];
      });

      const csv = toCsv(rpcData);
      const checksum = await sha256(csv);
      const now = new Date();
      const artifactPath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${runId}.csv`;

      await withRetry(async () => {
        const { error } = await admin.storage
          .from('monthly-reports')
          .upload(artifactPath, new Blob([csv], { type: 'text/csv;charset=utf-8' }), {
            contentType: 'text/csv;charset=utf-8',
            upsert: true,
          });

        if (error) {
          retriesUsed += 1;
          throw error;
        }
      });

      const finishedAt = new Date().toISOString();

      const { error: updateError } = await admin
        .from('report_runs')
        .update({
          status: 'completed',
          row_count: rpcData.length,
          checksum,
          artifact_bucket: 'monthly-reports',
          artifact_path: artifactPath,
          duration_ms: Date.now() - startEpoch,
          finished_at: finishedAt,
          retry_count: retriesUsed,
          error: null,
        })
        .eq('id', runId);

      if (updateError) throw updateError;

      await admin.from('audit_log').insert({
        user_id: userId,
        action: 'MONTHLY_REPORT_GENERATED',
        table_name: 'report_runs',
        record_id: runId,
        new_data: {
          scope,
          from,
          to,
          department_id: departmentId,
          include_heads: includeHeads,
          row_count: rpcData.length,
          artifact_path: artifactPath,
          rules_version: resolvedRuleVersion,
          duration_ms: Date.now() - new Date(startedAt).getTime(),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          run_id: runId,
          row_count: rpcData.length,
          artifact_path: artifactPath,
          checksum,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al generar reporte';
      await admin
        .from('report_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startEpoch,
          error: message,
          retry_count: retriesUsed,
        })
        .eq('id', runId);

      await admin.from('audit_log').insert({
        user_id: userId,
        action: 'MONTHLY_REPORT_FAILED',
        table_name: 'report_runs',
        record_id: runId,
        new_data: {
          scope,
          from,
          to,
          department_id: departmentId,
          include_heads: includeHeads,
          rules_version: resolvedRuleVersion,
          error: message,
        },
      });

      return new Response(JSON.stringify({ error: message, run_id: runId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
