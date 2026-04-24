import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function generateSignedUrl(
  client: AwsClient, endpoint: string, bucket: string, storagePath: string, expiresIn = 3600 * 6,
): Promise<string> {
  const url = `${endpoint}/${bucket}/${storagePath}`;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const flyUrl = Deno.env.get("FLY_WORKER_URL");
  const flyHmac = Deno.env.get("FLY_WORKER_HMAC_SECRET");

  if (!flyUrl || !flyHmac) {
    return new Response(JSON.stringify({ error: "Fly worker not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // R2
  const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");

  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return new Response(JSON.stringify({ error: "R2 not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const r2Client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });

  try {
    const body = await req.json().catch(() => ({}));
    const contentId: string | undefined = body?.content_id ?? body?.contentId;
    if (!contentId) {
      return new Response(JSON.stringify({ error: "content_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Confirm user has a native YouTube connection
    const { data: conn, error: connErr } = await admin
      .from("youtube_connections")
      .select("user_id, channel_id")
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (connErr || !conn) {
      const errMsg = "User has no native YouTube connection";
      await admin.from("social_content")
        .update({ youtube_native_status: "failed", youtube_native_error_detail: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!row.video_storage_path) {
      const errMsg = "Video is not available in storage";
      await admin.from("social_content")
        .update({ youtube_native_status: "failed", youtube_native_error_detail: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.video_storage_path);
    let thumbnailUrl: string | null = null;
    if (row.image) {
      try {
        thumbnailUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.image);
      } catch (e) { console.warn("thumb sign failed", e); }
    }

    const callbackUrl = `${supabaseUrl}/functions/v1/youtube-native-callback`;

    // Tags can come from a comma-separated text column if present
    let tags: string[] = [];
    const rawTags = (row as any).youtube_tags;
    if (Array.isArray(rawTags)) tags = rawTags.filter((t: unknown) => typeof t === "string");
    else if (typeof rawTags === "string" && rawTags.trim())
      tags = rawTags.split(",").map((t: string) => t.trim()).filter(Boolean);

    const job = {
      content_id: contentId,
      user_id: row.user_id,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      title: (row as any).youtube_title || row.post_title || row.topic || "Untitled",
      description: row.youtube_desc || row.post_title || "",
      tags,
      privacy: (row as any).youtube_privacy || "public",
      category_id: "22", // People & Blogs
      made_for_kids: false,
      callback_url: callbackUrl,
      issued_at: Date.now(),
    };
    const payload = JSON.stringify(job);
    const signature = await hmacSign(flyHmac, payload);

    // Mark uploading before dispatch
    await admin.from("social_content")
      .update({ youtube_native_status: "uploading", youtube_native_error_detail: null })
      .eq("id", contentId);

    const resp = await fetch(`${flyUrl.replace(/\/$/, "")}/upload-youtube`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Flurra-Signature": signature,
      },
      body: payload,
    });

    const text = await resp.text();
    if (!resp.ok) {
      const errMsg = `Fly worker rejected job: ${resp.status} ${text}`;
      console.error(errMsg);
      // Reset to null (not 'failed') so the cron retries on its next tick.
      // Real failure status only comes from the worker's own callback.
      await admin.from("social_content")
        .update({ youtube_native_status: null, youtube_native_error_detail: errMsg })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, dispatched: true, worker_response: text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("youtube-native-submit error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
