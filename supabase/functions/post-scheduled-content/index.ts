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
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Find all scheduled content whose scheduled_at has passed
    const { data: rows, error: fetchError } = await supabase
      .from("social_content")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ posted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let posted = 0;

    for (const row of rows) {
      const now = new Date().toISOString();

      // Copy to posted_content
      const { id: _id, ...rest } = row;
      const { error: insertError } = await supabase
        .from("posted_content")
        .insert({
          ...rest,
          status: "posted",
          posted_at: now,
        });

      if (insertError) {
        console.error(`Insert error for ${row.id}:`, insertError);
        continue;
      }

      // Update social_content status
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
