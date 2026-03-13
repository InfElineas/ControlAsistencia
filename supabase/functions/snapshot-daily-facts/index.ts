import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SnapshotPayload {
  target_date?: string;
  from?: string;
  to?: string;
  user_id?: string | null;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const payload = (await req.json().catch(() => ({}))) as SnapshotPayload;

    const targetDate = payload.target_date || null;
    const from = payload.from || null;
    const to = payload.to || null;
    const userId = payload.user_id ?? null;
    const reason = payload.reason || 'scheduled_snapshot';

    let processedRows = 0;

    if (from && to) {
      const { data, error } = await admin.rpc('refresh_attendance_daily_facts_for_range', {
        _from: from,
        _to: to,
        _user_id: userId,
        _reason: reason,
      });

      if (error) throw error;
      processedRows = Number(data ?? 0);
    } else {
      const fallbackDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await admin.rpc('refresh_attendance_daily_facts', {
        _target_date: targetDate || fallbackDate,
        _user_id: userId,
        _reason: reason,
      });

      if (error) throw error;
      processedRows = Number(data ?? 0);
    }

    return new Response(
      JSON.stringify({ success: true, processed_rows: processedRows }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error ejecutando snapshot diario';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
