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
        .select("id")
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
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .or("upload_post_status.is.null,upload_post_status.eq.failed");
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rows = data ?? [];
    }

    let invoked = 0;
    for (const row of rows) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/upload-post-submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ content_id: row.id }),
        });
        if (resp.ok) invoked++;
        else console.warn(`Submit invoke failed for ${row.id}:`, resp.status, await resp.text());
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
