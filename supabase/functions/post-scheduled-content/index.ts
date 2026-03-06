import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PUBLER_BASE = "https://app.publer.com/api/v1";

async function generateSignedUrl(
  client: AwsClient,
  endpoint: string,
  bucket: string,
  storagePath: string,
): Promise<string> {
  const url = `${endpoint}/${bucket}/${storagePath}`;
  const expiresIn = 3600;
  const signed = await client.sign(
    new Request(`${url}?X-Amz-Expires=${expiresIn}`, { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return signed.url.toString();
}

async function publishToPubler(
  videoUrl: string,
  caption: string,
  apiKey: string,
  workspaceId: string,
  tiktokAccountId: string,
): Promise<{ success: boolean; error?: string }> {
  const headers = {
    "Authorization": `Bearer-API ${apiKey}`,
    "Publer-Workspace-Id": workspaceId,
    "Content-Type": "application/json",
  };

  // Step 1: Upload video from signed R2 URL
  const uploadResp = await fetch(`${PUBLER_BASE}/media/from-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({ media: [{ url: videoUrl, name: "video.mp4" }], type: "video" }),
  });

  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    return { success: false, error: `Publer media upload failed [${uploadResp.status}]: ${err}` };
  }

  const uploadData = await uploadResp.json();
  const jobId = uploadData.job_id ?? uploadData.id;

  if (!jobId) {
    return { success: false, error: `Publer media upload returned no job_id: ${JSON.stringify(uploadData)}` };
  }

  // Step 2: Poll job status until completed (max 40 attempts, 2s apart = 80s, fits within edge function timeout)
  let mediaId: string | null = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const statusResp = await fetch(`${PUBLER_BASE}/job_status/${jobId}`, {
      headers: { "Authorization": `Bearer-API ${apiKey}` },
    });

    if (!statusResp.ok) continue;

    const statusData = await statusResp.json();
    console.log(`Publer job ${jobId} poll ${i}: status=${statusData.status}`);

    if (statusData.status === "error" || statusData.status === "failed") {
      return { success: false, error: `Publer media processing failed: ${JSON.stringify(statusData)}` };
    }

    if (statusData.status === "completed" || statusData.status === "complete") {
      // Media ID can be in payload or directly in response
      mediaId = statusData.payload?.id ?? statusData.id ?? statusData.payload?.[0]?.id;
      break;
    }
  }

  if (!mediaId) {
    return { success: false, error: "Publer media processing timed out after 80 seconds" };
  }

  // Step 3: Publish immediately to TikTok
  const postPayload = {
    bulk: {
      state: "scheduled",
      posts: [
        {
          accounts: [{ id: tiktokAccountId }],
          networks: {
            tiktok: {
              type: "video",
              text: caption,
              media: [{ id: mediaId }],
            },
          },
        },
      ],
    },
  };

  const postResp = await fetch(`${PUBLER_BASE}/posts/schedule/publish`, {
    method: "POST",
    headers,
    body: JSON.stringify(postPayload),
  });

  if (!postResp.ok) {
    const err = await postResp.text();
    return { success: false, error: `Publer post publish failed [${postResp.status}]: ${err}` };
  }

  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // R2 credentials for signed URL generation
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
    let contentId: string | null = null;
    let retryTiktok = false;
    let retrySourceContentId: string | null = null;
    try {
      const body = await req.json();
      contentId = body?.contentId ?? null;
      retryTiktok = body?.retryTiktok === true;
      retrySourceContentId = body?.sourceContentId ?? null;
    } catch {
      // No body or invalid JSON — fall through to cron behavior
    }

    // --- TikTok retry path: re-run Publer for already-posted content ---
    if (retryTiktok && retrySourceContentId) {
      const publerApiKey = Deno.env.get("PUBLER_API_KEY");
      const publerWorkspaceId = Deno.env.get("PUBLER_WORKSPACE_ID");
      const publerTiktokAccountId = Deno.env.get("PUBLER_TIKTOK_ACCOUNT_ID");

      if (!publerApiKey || !publerWorkspaceId || !publerTiktokAccountId) {
        return new Response(JSON.stringify({ error: "Publer credentials not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: postedRows, error: fetchErr } = await supabase
        .from("posted_content")
        .select("*")
        .eq("source_content_id", retrySourceContentId)
        .order("posted_at", { ascending: false })
        .limit(1);

      const posted = postedRows?.[0] ?? null;

      if (fetchErr || !posted) {
        return new Response(JSON.stringify({ error: fetchErr?.message ?? "Posted content not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate fresh signed video URL
      let videoUrl: string | null = posted.video_url;
      if (r2Client && R2_ENDPOINT && R2_BUCKET_NAME && posted.video_storage_path) {
        try {
          videoUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, posted.video_storage_path);
        } catch (e) {
          console.error("Failed to generate signed URL for retry:", e);
        }
      }

      if (!videoUrl) {
        return new Response(JSON.stringify({ error: "No video URL available for retry" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const caption = posted.ig_tiktok_desc || posted.post_title || posted.topic || "";
      let tiktokStatus = "failed";
      let tiktokError: string | null = null;

      try {
        const result = await publishToPubler(videoUrl, caption, publerApiKey, publerWorkspaceId, publerTiktokAccountId);
        if (result.success) {
          tiktokStatus = "posted";
          console.log(`TikTok retry succeeded for ${retrySourceContentId}`);
        } else {
          tiktokError = result.error ?? "Unknown Publer error";
          console.error(`TikTok retry failed for ${retrySourceContentId}:`, tiktokError);
        }
      } catch (err) {
        tiktokError = err instanceof Error ? err.message : String(err);
        console.error(`TikTok retry error for ${retrySourceContentId}:`, tiktokError);
      }

      await supabase
        .from("posted_content")
        .update({ tiktok_status: tiktokStatus, tiktok_error: tiktokError })
        .eq("source_content_id", retrySourceContentId);

      return new Response(JSON.stringify({ retried: retrySourceContentId, tiktok_status: tiktokStatus, tiktok_error: tiktokError }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rows: any[] = [];

    if (contentId) {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("id", contentId)
        .single();

      if (error) {
        console.error("Fetch error for contentId:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = [data];
    } else {
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString());

      if (error) {
        console.error("Fetch error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = data ?? [];
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ posted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let posted = 0;

    for (const row of rows) {
      const now = new Date().toISOString();

      // Generate signed R2 URLs for video and image
      let videoUrl: string | null = null;
      let imageUrl: string | null = null;

      if (r2Client && R2_ENDPOINT && R2_BUCKET_NAME) {
        try {
          if (row.video_storage_path) {
            videoUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.video_storage_path);
          }
          if (row.image) {
            imageUrl = await generateSignedUrl(r2Client, R2_ENDPOINT, R2_BUCKET_NAME, row.image);
          }
        } catch (signErr) {
          console.error(`Signed URL generation failed for ${row.id}:`, signErr);
          // Continue with null URLs rather than failing the entire post
        }
      } else {
        console.warn("R2 credentials not configured — video_url and image_url will be null");
      }

      // Copy to posted_content — strip social_content-only fields
      const { id: _id, upload_at: _ua, youtube_status: _ys,
              youtube_error_detail: _ye, youtube_uploaded_at: _yu, video_size_bytes: _vs,
              script: _sc,
              ...rest } = row;
      const { error: insertError } = await supabase
        .from("posted_content")
        .insert({
          ...rest,
          source_content_id: row.id,
          status: "posted",
          posted_at: now,
          video_url: videoUrl,
          image_url: imageUrl,
          youtube_title: rest.post_title ?? null,
        });

      if (insertError) {
        console.error(`Insert error for ${row.id}:`, insertError);
        continue;
      }

      // Notify Make.com webhook with posted content data
      const makeWebhookUrl = Deno.env.get("MAKE_WEBHOOK_URL");
      if (makeWebhookUrl) {
        try {
          const webhookPayload = {
            source_content_id: row.id,
            topic: row.topic,
            post_title: row.post_title,
            post_length: row.post_length,
            video_url: videoUrl,
            image_url: imageUrl,
            ig_tiktok_desc: row.ig_tiktok_desc,
            facebook_desc: row.facebook_desc,
            linkedin_desc: row.linkedin_desc,
            youtube_desc: row.youtube_desc,
            youtube_video_id: row.youtube_video_id,
            scheduled_platforms: row.scheduled_platforms,
            posted_at: now,
          };

          const makeResp = await fetch(makeWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });

          if (!makeResp.ok) {
            console.error(`Make.com webhook failed for ${row.id}: ${makeResp.status}`);
          }
        } catch (makeErr) {
          console.error(`Make.com webhook error for ${row.id}:`, makeErr);
        }
      }

      // Publish Shorts to TikTok via Publer
      const publerApiKey = Deno.env.get("PUBLER_API_KEY");
      const publerWorkspaceId = Deno.env.get("PUBLER_WORKSPACE_ID");
      const publerTiktokAccountId = Deno.env.get("PUBLER_TIKTOK_ACCOUNT_ID");

      if (
        publerApiKey && publerWorkspaceId && publerTiktokAccountId &&
        row.post_length === "Short" && videoUrl
      ) {
        let tiktokStatus: string | null = null;
        let tiktokError: string | null = null;

        try {
          const caption = row.ig_tiktok_desc || row.post_title || row.topic || "";
          const publerResult = await publishToPubler(
            videoUrl,
            caption,
            publerApiKey,
            publerWorkspaceId,
            publerTiktokAccountId,
          );

          if (!publerResult.success) {
            console.error(`Publer TikTok publish failed for ${row.id}:`, publerResult.error);
            tiktokStatus = "failed";
            tiktokError = publerResult.error ?? "Unknown Publer error";
          } else {
            console.log(`Publer TikTok publish succeeded for ${row.id}`);
            tiktokStatus = "posted";
          }
        } catch (publerErr) {
          console.error(`Publer TikTok error for ${row.id}:`, publerErr);
          tiktokStatus = "failed";
          tiktokError = publerErr instanceof Error ? publerErr.message : String(publerErr);
        }

        // Persist TikTok result to posted_content
        if (tiktokStatus) {
          const { error: ttUpdateErr } = await supabase
            .from("posted_content")
            .update({ tiktok_status: tiktokStatus, tiktok_error: tiktokError })
            .eq("source_content_id", row.id);

          if (ttUpdateErr) {
            console.error(`Failed to update tiktok_status for ${row.id}:`, ttUpdateErr);
          }
        }
      }

      const { error: updateError } = await supabase
        .from("social_content")
        .update({ status: "posted", posted_at: now })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Update error for ${row.id}:`, updateError);
        continue;
      }

      posted++;
    }

    return new Response(JSON.stringify({ posted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("post-scheduled-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
