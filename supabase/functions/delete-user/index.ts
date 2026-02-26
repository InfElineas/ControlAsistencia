import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteUserRequest {
  user_id: string;
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

    const { data: roleData, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .single();

    if (roleError || roleData?.role !== "global_manager") {
      throw new Error("Only global managers can delete users");
    }

    const { user_id }: DeleteUserRequest = await req.json();

    if (!user_id) {
      throw new Error("Missing required field: user_id");
    }

    if (user_id === currentUser.id) {
      throw new Error("No puedes eliminar tu propio usuario");
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", user_id)
      .maybeSingle();

    const { data: targetRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetRole?.role === "global_manager") {
      const { count, error: countError } = await adminClient
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "global_manager");

      if (countError) {
        throw countError;
      }

      if ((count || 0) <= 1) {
        throw new Error("No puedes eliminar al último gestor global");
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);

    if (deleteError) {
      throw deleteError;
    }

    await adminClient.from("audit_log").insert({
      user_id: currentUser.id,
      action: "user_deleted",
      table_name: "auth.users",
      record_id: user_id,
      old_data: {
        email: targetProfile?.email || null,
        full_name: targetProfile?.full_name || null,
        role: targetRole?.role || null,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error deleting user:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Unauthorized" ? 401 : 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
