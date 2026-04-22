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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "UPLOAD_POST_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: rows, error } = await admin
      .from("social_content")
      .select("*")
      .eq("upload_post_status", "uploading")
      .not("upload_post_request_id", "is", null)
      .limit(50);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;

    for (const row of rows ?? []) {
      try {
        const url = `${UPLOAD_POST_BASE}/api/uploadposts/status?request_id=${encodeURIComponent(row.upload_post_request_id)}`;
        const resp = await fetch(url, {
          headers: { "Authorization": `Apikey ${apiKey}` },
        });
        const text = await resp.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* ignore */ }

        if (!resp.ok) {
          console.warn(`[poll] ${row.id} status fetch failed:`, resp.status, text);
          continue;
        }

        // Determine completion
        const status = data?.status ?? data?.state;
        const results = data?.results ?? data?.platforms ?? null;
        const isComplete = status && ["completed", "complete", "done", "finished", "success", "failed", "error"].includes(String(status).toLowerCase());

        if (!isComplete && !results) continue;

        let allSuccess = true;
        let anySuccess = false;
        if (results && typeof results === "object") {
          for (const r of Object.values(results) as any[]) {
            if (r?.success === true) anySuccess = true;
            else allSuccess = false;
          }
        } else {
          allSuccess = false;
        }

        const finalStatus = allSuccess ? "success" : anySuccess ? "partial" : "failed";

        await admin
          .from("social_content")
          .update({
            upload_post_status: finalStatus,
            upload_post_results: results ?? data,
            status: finalStatus === "success" || finalStatus === "partial" ? "posted" : "scheduled",
            posted_at: finalStatus === "success" || finalStatus === "partial" ? new Date().toISOString() : null,
          })
          .eq("id", row.id);

        // Archive to posted_content on success/partial
        if (finalStatus === "success" || finalStatus === "partial") {
          // Strip social_content-only / forbidden columns
          const {
            id: _id, video_size_bytes: _vs, script: _sc,
            youtube_status: _ys, youtube_uploaded_at: _yu, youtube_error_detail: _ye,
            youtube_video_id: _yvid, upload_at: _ua,
            youtube_comment: _yc, youtube_comment_status: _ycs, youtube_comment_id: _ycid,
            youtube_comment_posted_at: _ycp, youtube_comment_error_detail: _yce,
            ...rest
          } = row;

          await admin.from("posted_content").insert({
            ...rest,
            source_content_id: row.id,
            status: "posted",
            posted_at: new Date().toISOString(),
            upload_post_request_id: row.upload_post_request_id,
            upload_post_status: finalStatus,
            upload_post_results: results ?? data,
          });
        }

        updated++;
      } catch (innerErr) {
        console.error(`[poll] ${row.id} error:`, innerErr);
      }
    }

    return new Response(JSON.stringify({ checked: rows?.length ?? 0, updated }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("upload-post-status-poll error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
