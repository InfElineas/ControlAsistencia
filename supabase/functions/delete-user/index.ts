import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteUserRequest {
  user_id: string;
}

interface AuthenticatedUser {
  id: string;
  email?: string | null;
}

async function cleanupUserReferences(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  const updateOperations = [
    adminClient.from("audit_log").update({ user_id: null }).eq("user_id", userId),
    adminClient
      .from("attendance_absence_reviews")
      .update({ reviewed_by: null })
      .eq("reviewed_by", userId),
    adminClient
      .from("user_department_responsibilities")
      .update({ created_by: null })
      .eq("created_by", userId),
    adminClient
      .from("attendance_incidents")
      .update({ reviewed_by: null })
      .eq("reviewed_by", userId),
    adminClient
      .from("vacation_requests")
      .update({ reviewed_by: null })
      .eq("reviewed_by", userId),
    adminClient
      .from("geofence_config")
      .update({ updated_by: null })
      .eq("updated_by", userId),
  ];

  for (const operation of updateOperations) {
    const { error } = await operation;
    if (error) throw error;
  }

  const deleteOperations = [
    adminClient.from("user_department_responsibilities").delete().eq("user_id", userId),
    adminClient.from("attendance_absence_reviews").delete().eq("user_id", userId),
    adminClient.from("attendance_incidents").delete().eq("user_id", userId),
    adminClient.from("attendance_marks").delete().eq("user_id", userId),
    adminClient.from("vacation_requests").delete().eq("user_id", userId),
    adminClient.from("notifications").delete().eq("user_id", userId),
    adminClient.from("rest_group_members").delete().eq("user_id", userId),
    adminClient.from("report_runs").delete().eq("requested_by", userId),
    adminClient.from("user_rest_schedule").delete().eq("user_id", userId),
    adminClient.from("user_roles").delete().eq("user_id", userId),
    adminClient.from("profiles").delete().eq("user_id", userId),
  ];

  for (const operation of deleteOperations) {
    const { error } = await operation;
    if (error) throw error;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Unauthorized");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      throw new Error("Unauthorized");
    }

    const apiKeyFromRequest =
      req.headers.get("apikey") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!apiKeyFromRequest) {
      throw new Error("Unauthorized");
    }

    const authUserResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: apiKeyFromRequest,
      },
    });

    if (!authUserResponse.ok) {
      throw new Error("Unauthorized");
    }

    const currentUser = (await authUserResponse.json()) as AuthenticatedUser;
    if (!currentUser?.id) {
      throw new Error("Unauthorized");
    }

    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .eq("role", "superadmin")
      .maybeSingle();

    const currentRole = roleData?.role;

    if (roleError || currentRole !== "superadmin") {
      throw new Error("Only superadmins can delete users");
    }

    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const { user_id }: DeleteUserRequest = await req.json();

    if (!user_id) {
      throw new Error("Missing required field: user_id");
    }

    if (user_id === currentUser.id) {
      throw new Error("No puedes eliminar tu propio usuario");
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", user_id)
      .maybeSingle();

    const { data: targetRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    const targetRoleList = (targetRoles ?? []).map((item) => item.role);
    const targetHasSuperadmin = targetRoleList.includes("superadmin");
    if (targetHasSuperadmin) {
      const { count, error: countError } = await adminClient
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "superadmin");

      if (countError) {
        throw countError;
      }

      if ((count || 0) <= 1) {
        throw new Error("No puedes eliminar al último superadmin");
      }
    }

    await cleanupUserReferences(adminClient, user_id);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);

    if (deleteError) {
      const normalizedDeleteMessage = String(deleteError.message || "").toLowerCase();
      if (
        normalizedDeleteMessage.includes("user not found") ||
        normalizedDeleteMessage.includes("not found")
      ) {
        await adminClient.from("audit_log").insert({
          user_id: currentUser.id,
          action: "user_deleted",
          description: `Se purgaron registros huérfanos para: ${targetProfile?.email || user_id}`,
          source_ip: sourceIp,
          metadata: {
            actor_role: "superadmin",
            target_user_id: user_id,
            auth_delete_skipped: true,
          },
          table_name: "auth.users",
          record_id: user_id,
          old_data: {
            email: targetProfile?.email || null,
            full_name: targetProfile?.full_name || null,
            roles: targetRoleList,
          },
        });

        return new Response(JSON.stringify({ success: true, auth_user_missing: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      throw new Error(`No se pudo eliminar el usuario desde Auth Admin: ${deleteError.message}`);
    }

    await adminClient.from("audit_log").insert({
      user_id: currentUser.id,
      action: "user_deleted",
      description: `Usuario eliminado: ${targetProfile?.email || user_id}`,
      source_ip: sourceIp,
      metadata: { actor_role: "superadmin", target_user_id: user_id },
      table_name: "auth.users",
      record_id: user_id,
      old_data: {
        email: targetProfile?.email || null,
        full_name: targetProfile?.full_name || null,
        roles: targetRoleList,
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
