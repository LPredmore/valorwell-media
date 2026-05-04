import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    let contentId: string | null = null;
    try {
      const body = await req.json();
      contentId = body?.contentId ?? body?.content_id ?? null;
    } catch { /* cron call has no body */ }

    let rows: any[] = [];
    if (contentId) {
      const { data, error } = await admin
        .from("social_content")
        .select("id, scheduled_platforms, youtube_via")
        .eq("id", contentId)
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = [data];
    } else {
      const { data, error } = await admin
        .from("social_content")
        .select("id, scheduled_platforms, youtube_via, upload_post_status, youtube_native_status")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString());
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = data ?? [];
    }

    const invokeFn = async (fn: string, contentId: string) => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ content_id: contentId }),
      });
      if (!resp.ok) {
        console.warn(`${fn} invoke failed for ${contentId}:`, resp.status, await resp.text());
        return false;
      }
      return true;
    };

    let invoked = 0;
    for (const row of rows) {
      try {
        const platforms: string[] = Array.isArray(row.scheduled_platforms) ? row.scheduled_platforms : [];
        const wantsYoutube = platforms.includes("youtube");
        const useNativeYoutube = row.youtube_via === "native" && wantsYoutube;
        const otherPlatforms = platforms.filter((p) => p !== "youtube");

        const ytStatus = (row as any).youtube_native_status;
        const ytAlreadyHandled = ytStatus === "uploading" || ytStatus === "success" || ytStatus === "failed";

        const upStatus = (row as any).upload_post_status;
        const upAlreadyHandled = upStatus === "uploading" || upStatus === "success" || upStatus === "partial" || upStatus === "failed";

        if (useNativeYoutube) {
          if (!ytAlreadyHandled) {
            if (await invokeFn("youtube-native-submit", row.id)) invoked++;
          }
          if (otherPlatforms.length > 0 && !upAlreadyHandled) {
            if (await invokeFn("upload-post-submit", row.id)) invoked++;
          }
        } else {
          if (!upAlreadyHandled) {
            if (await invokeFn("upload-post-submit", row.id)) invoked++;
          }
        }
      } catch (e) {
        console.error(`Submit invoke error for ${row.id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ found: rows.length, invoked }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("post-scheduled-content error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
