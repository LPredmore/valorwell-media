import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Archives social_content rows that were posted to YouTube via the native
 * (Fly.io) path into posted_content. The Upload-Post poller does the same job
 * for Upload-Post-managed posts; this one handles the native-YouTube case.
 *
 * A row is archived when:
 *   - youtube_native_status = 'success'
 *   - youtube_via = 'native'
 *   - either YouTube is the only scheduled platform, OR all other Upload-Post
 *     platforms have already finished (upload_post_status in 'success'/'partial'/'failed')
 *
 * In partial cases we leave the row alone — the Upload-Post poller will move
 * it once Upload-Post finishes. Status flips to 'posted' at that point.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: rows, error } = await admin
      .from("social_content")
      .select("*")
      .eq("youtube_native_status", "success")
      .eq("youtube_via", "native")
      .is("posted_at", null)
      .limit(50);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let archived = 0;

    for (const row of rows ?? []) {
      try {
        const platforms: string[] = Array.isArray((row as any).scheduled_platforms)
          ? (row as any).scheduled_platforms
          : [];
        const others = platforms.filter((p) => p !== "youtube");

        // If there are other platforms, only archive once Upload-Post has settled
        if (others.length > 0) {
          const upStatus = (row as any).upload_post_status;
          const settled = upStatus && ["success", "partial", "failed"].includes(upStatus);
          if (!settled) continue;
        }

        // Strip social_content-only / forbidden columns
        const {
          id: _id, video_size_bytes: _vs, script: _sc,
          ...rest
        } = row as any;

        const insertResult = await admin.from("posted_content").insert({
          ...rest,
          source_content_id: row.id,
          status: "posted",
          posted_at: new Date().toISOString(),
        });
        if (insertResult.error) {
          console.error(`[yt-archive] insert ${row.id} failed:`, insertResult.error);
          continue;
        }

        const delResult = await admin
          .from("social_content")
          .delete()
          .eq("id", row.id);
        if (delResult.error) {
          console.error(`[yt-archive] delete ${row.id} failed:`, delResult.error);
          continue;
        }

        archived++;
      } catch (innerErr) {
        console.error(`[yt-archive] ${row.id} error:`, innerErr);
      }
    }

    return new Response(JSON.stringify({ checked: rows?.length ?? 0, archived }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("youtube-native-archive-poll error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
