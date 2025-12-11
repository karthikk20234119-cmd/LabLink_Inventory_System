import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "admin@lablink.com";
const ADMIN_PASSWORD = "Admin@12345";

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if admin already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAdmin = existingUsers?.users?.find(u => u.email === ADMIN_EMAIL);

    if (existingAdmin) {
      console.log("Default admin exists, ensuring correct configuration...");
      
      // Reset password to ensure it's correct
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAdmin.id,
        { 
          password: ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: "System Administrator",
            is_default_admin: true,
          }
        }
      );

      if (updateError) {
        console.error("Error updating admin password:", updateError);
        throw updateError;
      }

      console.log("Admin password reset successfully");

      // Update profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          is_default_admin: true,
          full_name: "System Administrator"
        })
        .eq("id", existingAdmin.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // Ensure admin role is set (upsert to handle both insert and update)
      const { error: deleteRoleError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", existingAdmin.id);
      
      if (deleteRoleError) {
        console.error("Error deleting old role:", deleteRoleError);
      }

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: existingAdmin.id, role: "admin" });

      if (roleError) {
        console.error("Error setting admin role:", roleError);
      }

      console.log("Admin configured successfully with role: admin");

      return new Response(
        JSON.stringify({ success: true, message: "Admin configured successfully" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create default admin user
    const { data: newAdmin, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: "System Administrator",
        is_default_admin: true,
      }
    });

    if (createError) {
      console.error("Error creating admin:", createError);
      throw createError;
    }

    console.log("Admin user created:", newAdmin.user?.id);

    // Update the profile to mark as default admin
    if (newAdmin.user) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({ 
          is_default_admin: true,
          full_name: "System Administrator"
        })
        .eq("id", newAdmin.user.id);

      if (profileError) {
        console.error("Error updating profile:", profileError);
      }

      // Delete any existing role and set admin role
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", newAdmin.user.id);

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newAdmin.user.id, role: "admin" });

      if (roleError) {
        console.error("Error setting admin role:", roleError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Default admin created successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in setup-admin:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
