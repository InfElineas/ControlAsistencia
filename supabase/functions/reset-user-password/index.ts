import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetPasswordRequest {
  user_id: string;
  new_password: string;
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

    const { data: currentRoleRows, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .eq("role", "superadmin");

    if (roleError || (currentRoleRows ?? []).length === 0) {
      throw new Error("Only superadmins can reset user passwords");
    }

    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const { user_id, new_password }: ResetPasswordRequest = await req.json();

    if (!user_id || !new_password) {
      throw new Error("Missing required fields: user_id and new_password");
    }

    if (new_password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", user_id)
      .maybeSingle();

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password,
    });

    if (updateError) {
      throw updateError;
    }

    await adminClient.from("audit_log").insert({
      user_id: currentUser.id,
      action: "user_password_reset",
      description: `Reset de contraseña para ${targetProfile?.email || user_id}`,
      source_ip: sourceIp,
      metadata: { actor_role: "superadmin" },
      table_name: "auth.users",
      record_id: user_id,
      old_data: {
        email: targetProfile?.email || null,
        full_name: targetProfile?.full_name || null,
      },
      new_data: {
        reset_by: currentUser.id,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error resetting password:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Unauthorized" ? 401 : 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
