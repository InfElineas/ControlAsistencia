import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  department_id: string;
  role: 'employee' | 'department_head' | 'global_manager' | 'superadmin';
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create a Supabase client with the user's token to check their role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the current user
    const { data: { user: currentUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !currentUser) {
      throw new Error("Unauthorized");
    }

    // Check if user is global_manager
    const { data: roleRows, error: roleError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .in('role', ['global_manager', 'superadmin']);

    if (roleError) {
      throw roleError;
    }

    const currentRoles = (roleRows ?? []).map((item) => item.role);
    const isAllowedCreator = currentRoles.includes('global_manager') || currentRoles.includes('superadmin');
    if (!isAllowedCreator) {
      throw new Error("Only global managers or superadmins can create users");
    }

    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    // Parse request body
    const { email, password, full_name, department_id, role }: CreateUserRequest = await req.json();

    if (role === 'superadmin' && !currentRoles.includes('superadmin')) {
      throw new Error('Solo un superadmin puede crear otro superadmin');
    }

    // Validate required fields
    if (!email || !password || !full_name || !department_id || !role) {
      throw new Error("Missing required fields");
    }

    // Use service role client to create user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Create the auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name,
        department_id,
      },
    });

    if (createError) {
      throw createError;
    }

    // The profile and default role will be created by the database trigger
    // But we need to update the role if it's not 'employee'
    if (role !== 'employee' && newUser.user) {
      // First delete the default role
      await adminClient
        .from('user_roles')
        .delete()
        .eq('user_id', newUser.user.id);

      // Then insert the correct role
      const { error: roleInsertError } = await adminClient
        .from('user_roles')
        .insert({ user_id: newUser.user.id, role });

      if (roleInsertError) {
        console.error("Error setting role:", roleInsertError);
      }
    }

    // Log the action
    await adminClient.from('audit_log').insert({
      user_id: currentUser.id,
      action: 'user_created',
      description: `Usuario creado: ${email}`,
      source_ip: sourceIp,
      metadata: { actor_role: currentRoles.includes('superadmin') ? 'superadmin' : 'global_manager' },
      table_name: 'auth.users',
      record_id: newUser.user?.id,
      new_data: { email, full_name, department_id, role },
    });

    return new Response(
      JSON.stringify({ success: true, user: { id: newUser.user?.id, email } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error creating user:", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: message === "Unauthorized" ? 401 : 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
