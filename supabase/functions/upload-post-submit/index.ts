import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UPLOAD_POST_BASE = "https://api.upload-post.com";

async function generateSignedUrl(
  client: AwsClient,
  endpoint: string,
  bucket: string,
  storagePath: string,
): Promise<string> {
  const url = `${endpoint}/${bucket}/${storagePath}`;
  const expiresIn = 3600 * 6; // 6 hours so Upload-Post has time to fetch
  const signed = await client.sign(
    new Request(`${url}?X-Amz-Expires=${expiresIn}`, { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return signed.url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("UPLOAD_POST_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "UPLOAD_POST_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // R2
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");

  let r2Client: AwsClient | null = null;
  if (R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
    r2Client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const contentId: string | undefined = body?.content_id ?? body?.contentId;
    if (!contentId) {
      return new Response(JSON.stringify({ error: "content_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch content row
    const { data: row, error: rowErr } = await admin
      .from("social_content")
      .select("*")
      .eq("id", contentId)
      .maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: rowErr?.message ?? "Content not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's Upload-Post profile
    const { data: profile } = await admin
      .from("upload_post_profiles")
      .select("username, provisioning_status, connected_platforms")
      .eq("user_id", row.user_id)
      .maybeSingle();

    if (!profile || profile.provisioning_status !== "ready") {
      const errMsg = "User's Upload-Post profile is not ready";
      await admin
        .from("social_content")
        .update({ upload_post_status: "failed", error: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target platforms: intersect requested vs connected
    const requested: string[] = Array.isArray(row.scheduled_platforms) && row.scheduled_platforms.length
      ? row.scheduled_platforms
      : Object.keys(profile.connected_platforms ?? {});

    const connected = profile.connected_platforms ?? {};
    let platforms = requested.filter((p: string) => {
      const v = connected[p];
      return v && (typeof v === "object" || (typeof v === "string" && v.length > 0));
    });

    // If user opted into native YouTube for this content, don't double-post via Upload-Post
    if (row.youtube_via === "native") {
      platforms = platforms.filter((p) => p !== "youtube");
    }

    if (platforms.length === 0) {
      const errMsg = "No connected platforms to post to";
      await admin
        .from("social_content")
        .update({ upload_post_status: "failed", error: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a signed video URL
    if (!r2Client || !R2_ENDPOINT || !R2_BUCKET_NAME || !row.video_storage_path) {
      const errMsg = "Video is not available in storage";
      await admin
        .from("social_content")
        .update({ upload_post_status: "failed", error: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.video_storage_path);

    // Build multipart form
    const form = new FormData();
    form.append("user", profile.username);
    form.append("video", videoUrl);
    form.append("async_upload", "true");
    if (row.post_title) form.append("title", row.post_title);

    // Per-platform titles + descriptions
    if (row.post_title) {
      form.append("youtube_title", row.post_title);
      form.append("tiktok_title", row.ig_tiktok_desc || row.post_title);
      form.append("instagram_title", row.ig_tiktok_desc || row.post_title);
      form.append("facebook_title", row.facebook_desc || row.post_title);
      form.append("linkedin_title", row.linkedin_desc || row.post_title);
      form.append("x_title", row.ig_tiktok_desc || row.post_title);
      form.append("threads_title", row.ig_tiktok_desc || row.post_title);
      form.append("pinterest_title", row.post_title);
    }
    if (row.youtube_desc) form.append("youtube_description", row.youtube_desc);
    if (row.facebook_desc) form.append("facebook_description", row.facebook_desc);
    if (row.linkedin_desc) form.append("linkedin_description", row.linkedin_desc);
    form.append("description", row.youtube_desc || row.linkedin_desc || row.post_title || row.topic || "");

    // Optional thumbnail (R2 image path)
    if (row.image && r2Client) {
      try {
        const thumbUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.image);
        form.append("thumbnail_url", thumbUrl);
      } catch (e) {
        console.warn("Thumb sign failed:", e);
      }
    }

    // platform[] entries
    for (const p of platforms) {
      form.append("platform[]", p);
    }

    // Idempotency
    const idempotencyKey = `flurra-${contentId}-${Date.now()}`;

    // Optimistically mark as uploading
    await admin
      .from("social_content")
      .update({ upload_post_status: "uploading", error: null })
      .eq("id", contentId);

    const resp = await fetch(`${UPLOAD_POST_BASE}/api/upload`, {
      method: "POST",
      headers: {
        "Authorization": `Apikey ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: form,
    });

    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!resp.ok) {
      const errMsg = data?.message ?? data?.error ?? text ?? `HTTP ${resp.status}`;
      await admin
        .from("social_content")
        .update({ upload_post_status: "failed", error: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg, status: resp.status }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestId = data?.request_id ?? data?.job_id ?? null;

    // Sync result handling
    if (data?.results && typeof data.results === "object") {
      // Synchronous response
      const allSuccess = Object.values(data.results).every((r: any) => r?.success === true);
      const anySuccess = Object.values(data.results).some((r: any) => r?.success === true);
      const finalStatus = allSuccess ? "success" : anySuccess ? "partial" : "failed";

      await admin
        .from("social_content")
        .update({
          upload_post_request_id: requestId,
          upload_post_status: finalStatus,
          upload_post_results: data.results,
          posted_at: finalStatus === "success" || finalStatus === "partial" ? new Date().toISOString() : null,
          status: finalStatus === "success" || finalStatus === "partial" ? "posted" : "scheduled",
        })
        .eq("id", contentId);
    } else {
      // Async/scheduled — just save request_id for poller
      await admin
        .from("social_content")
        .update({
          upload_post_request_id: requestId,
          upload_post_status: "uploading",
        })
        .eq("id", contentId);
    }

    return new Response(
      JSON.stringify({ success: true, request_id: requestId, raw: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("upload-post-submit error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
