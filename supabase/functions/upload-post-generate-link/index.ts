import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UPLOAD_POST_BASE = "https://api.upload-post.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("UPLOAD_POST_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "UPLOAD_POST_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authenticate caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const platforms: string[] | undefined = body?.platforms;
    const redirectUrl: string = body?.redirect_url ?? `${new URL(req.url).origin}`;
    const logoImage: string | undefined = body?.logo_image;

    // Look up the user's profile
    const { data: profileRow, error: profileErr } = await admin
      .from("upload_post_profiles")
      .select("username, provisioning_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr || !profileRow) {
      return new Response(JSON.stringify({ error: "No Upload-Post profile yet. Please retry provisioning." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profileRow.provisioning_status !== "ready") {
      return new Response(JSON.stringify({ error: "Profile is not ready yet", status: profileRow.provisioning_status }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Record<string, unknown> = {
      username: profileRow.username,
      redirect_url: redirectUrl,
      connect_title: "Connect your social accounts to Flurra",
      connect_description: "Link the platforms you'd like Flurra to publish to.",
      show_calendar: false,
    };
    if (platforms && platforms.length) payload.platforms = platforms;
    if (logoImage) payload.logo_image = logoImage;

    const resp = await fetch(`${UPLOAD_POST_BASE}/api/uploadposts/users/generate-jwt`, {
      method: "POST",
      headers: {
        "Authorization": `Apikey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: data?.message ?? text ?? `HTTP ${resp.status}` }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ access_url: data?.access_url, duration: data?.duration }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("upload-post-generate-link error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
