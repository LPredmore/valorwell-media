import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UPLOAD_POST_BASE = "https://api.upload-post.com";

type EnsureResult =
  | { ok: true; alreadyExisted: boolean }
  | { ok: false; status: number; errorCode: string | null; message: string; limitReached: boolean };

async function ensureUpstreamProfile(
  apiKey: string,
  username: string,
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<EnsureResult> {
  // 1. Check if upstream profile exists.
  const headRes = await fetch(
    `${UPLOAD_POST_BASE}/api/uploadposts/users/${encodeURIComponent(username)}`,
    { headers: { "Authorization": `Apikey ${apiKey}` } },
  );

  if (headRes.ok) {
    return { ok: true, alreadyExisted: true };
  }

  if (headRes.status !== 404) {
    const txt = await headRes.text();
    console.error(`[generate-link] unexpected GET user status=${headRes.status} body=${txt.slice(0, 500)}`);
    // Fall through and try to create anyway — most other errors are transient or auth-shape issues.
  } else {
    console.log(`[generate-link] profile ${username} missing upstream (404), self-healing…`);
  }

  // 2. Create upstream profile.
  const createRes = await fetch(`${UPLOAD_POST_BASE}/api/uploadposts/users`, {
    method: "POST",
    headers: {
      "Authorization": `Apikey ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });

  const text = await createRes.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }

  if (createRes.ok || createRes.status === 409) {
    await admin
      .from("upload_post_profiles")
      .update({
        provisioning_status: "ready",
        provisioning_error: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { ok: true, alreadyExisted: createRes.status === 409 };
  }

  const errorCode: string | null = data?.error_code ?? null;
  const message = data?.message ?? data?.error ?? text ?? `HTTP ${createRes.status}`;
  const limitReached =
    createRes.status === 403 ||
    errorCode === "PROFILE_LIMIT_REACHED" ||
    /limit/i.test(String(message));

  await admin
    .from("upload_post_profiles")
    .update({
      provisioning_status: limitReached ? "limit_reached" : "error",
      provisioning_error: `[${createRes.status}${errorCode ? "/" + errorCode : ""}] ${message}`,
    })
    .eq("user_id", userId);

  console.error(
    `[generate-link] self-heal failed for ${userId}/${username}: status=${createRes.status} code=${errorCode} msg=${message}`,
  );

  return { ok: false, status: createRes.status, errorCode, message, limitReached };
}

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
    const platformSingle: string | undefined = body?.platform;
    const platformList = platforms ?? (platformSingle ? [platformSingle] : undefined);
    const redirectUrl: string = body?.redirect_url ?? `${new URL(req.url).origin}`;
    const logoImage: string | undefined = body?.logo_image;

    // Look up the user's profile row (created at signup).
    const { data: profileRow, error: profileErr } = await admin
      .from("upload_post_profiles")
      .select("username, provisioning_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr || !profileRow) {
      return new Response(
        JSON.stringify({ error: "No publishing profile reserved for this user." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Self-heal: verify upstream existence and (re)create if missing.
    const ensure = await ensureUpstreamProfile(apiKey, profileRow.username, admin, userId);
    if (!ensure.ok) {
      if (ensure.limitReached) {
        return new Response(
          JSON.stringify({
            error: "Our publishing service is at capacity. Please contact support.",
            error_code: "PROFILE_LIMIT_REACHED",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: ensure.message, error_code: ensure.errorCode }),
        { status: ensure.status || 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload: Record<string, unknown> = {
      username: profileRow.username,
      redirect_url: redirectUrl,
      connect_title: "Connect your social accounts to Flurra",
      connect_description: "Link the platforms you'd like Flurra to publish to.",
      show_calendar: false,
    };
    if (platformList && platformList.length) payload.platforms = platformList;
    if (logoImage) payload.logo_image = logoImage;

    console.log("[upload-post-generate-link] request payload:", JSON.stringify(payload));

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

    console.log(
      "[upload-post-generate-link] response status:", resp.status,
      "body:", text.slice(0, 2000),
    );

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: data?.message ?? text ?? `HTTP ${resp.status}` }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        access_url: data?.access_url,
        duration: data?.duration,
        username: profileRow.username,
        request_payload: payload,
        provider_response: data,
      }),
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
