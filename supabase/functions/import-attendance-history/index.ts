import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImportRow = {
  email: string;
  date: string;
};

interface ImportRequest {
  rows: ImportRow[];
  source_file_name?: string;
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: currentUser },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !currentUser) {
      throw new Error("Unauthorized");
    }

    const { data: roleRows, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .eq("role", "superadmin");

    if (roleError || (roleRows ?? []).length === 0) {
      throw new Error("Only superadmins can import attendance history");
    }

    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const payload: ImportRequest = await req.json();
    const rows = payload.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("No rows provided");
    }

    if (rows.length > 20000) {
      throw new Error("El archivo excede el límite de 20,000 filas por importación");
    }

    const normalizedRows = rows
      .map((row) => ({
        email: String(row.email ?? "").trim().toLowerCase(),
        date: String(row.date ?? "").trim(),
      }))
      .filter((row) => row.email && row.date && isValidIsoDate(row.date));

    if (normalizedRows.length === 0) {
      throw new Error("No se encontraron filas válidas (se requiere email y fecha YYYY-MM-DD)");
    }

    const uniqueRowsMap = new Map<string, ImportRow>();
    for (const row of normalizedRows) {
      uniqueRowsMap.set(`${row.email}__${row.date}`, row);
    }
    const uniqueRows = [...uniqueRowsMap.values()];

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const uniqueEmails = [...new Set(uniqueRows.map((row) => row.email))];

    const { data: profiles, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, email")
      .in("email", uniqueEmails);

    if (profileError) {
      throw profileError;
    }

    const emailToUserId = new Map<string, string>();
    for (const profile of profiles ?? []) {
      if (profile.email) {
        emailToUserId.set(profile.email.toLowerCase(), profile.user_id);
      }
    }

    const missingEmails = new Set<string>();
    const attendancePayload = uniqueRows.flatMap((row) => {
      const userId = emailToUserId.get(row.email);
      if (!userId) {
        missingEmails.add(row.email);
        return [];
      }

      return [{
        user_id: userId,
        mark_type: "IN",
        timestamp: `${row.date}T12:00:00.000Z`,
        latitude: null,
        longitude: null,
        accuracy: null,
        distance_to_center: null,
        inside_geofence: true,
        blocked: false,
        block_reason: "imported_historical_data",
      }];
    });

    if (attendancePayload.length > 0) {
      const { error: insertError } = await adminClient
        .from("attendance_marks")
        .insert(attendancePayload);

      if (insertError) {
        throw insertError;
      }
    }

    await adminClient.from("audit_log").insert({
      user_id: currentUser.id,
      action: "attendance_history_imported",
      description: `Importación histórica desde Excel (${payload.source_file_name || "archivo"})`,
      source_ip: sourceIp,
      metadata: {
        actor_role: "superadmin",
        source_file_name: payload.source_file_name || null,
        total_rows_received: rows.length,
        valid_rows: normalizedRows.length,
        imported_marks: attendancePayload.length,
        missing_emails: [...missingEmails],
      },
      table_name: "attendance_marks",
      new_data: {
        imported_marks: attendancePayload.length,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      total_rows_received: rows.length,
      valid_rows: normalizedRows.length,
      imported_marks: attendancePayload.length,
      missing_emails: [...missingEmails],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error importing attendance history:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Unauthorized" ? 401 : 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
