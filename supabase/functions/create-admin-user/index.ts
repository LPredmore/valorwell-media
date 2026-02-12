import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting admin user creation...");
    
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("CUSTOM_SERVICE_ROLE_KEY");
    
    console.log("URL:", url);
    console.log("Key length:", key?.length);
    console.log("Key prefix:", key?.substring(0, 20));
    const supabaseAdmin = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("Creating user...");

    const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: "info@valorwell.org",
      password: "$V@l0rw3ll",
      email_confirm: true,
    });

    if (createError) {
      console.log("Create error:", createError.message);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User created:", user.user.id);
    console.log("Inserting admin role...");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: user.user.id, role: "admin" });

    if (roleError) {
      console.log("Role error:", roleError.message);
      return new Response(JSON.stringify({ error: roleError.message, user_id: user.user.id }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Admin role assigned successfully");

    return new Response(
      JSON.stringify({ success: true, user_id: user.user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("Caught error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
