import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { contentId } = await req.json();
    if (!contentId) {
      return new Response(JSON.stringify({ error: "contentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the content row (RLS ensures ownership)
    const { data: content, error: fetchError } = await userClient
      .from("social_content")
      .select("*")
      .eq("id", contentId)
      .single();

    if (fetchError || !content) {
      return new Response(JSON.stringify({ error: "Content not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set status to generating
    await adminClient
      .from("social_content")
      .update({ status: "generating", error: null })
      .eq("id", contentId);

    // Fetch active content instructions
    const { data: instructions } = await adminClient
      .from("content_instructions")
      .select("scope, instruction")
      .eq("is_active", true);

    const instructionsByScope: Record<string, string> = {};
    for (const row of instructions || []) {
      instructionsByScope[row.scope] = row.instruction;
    }

    const systemPrompt = instructionsByScope["global"] || "You are a social media content generation assistant.";

    const fieldScopes = ["post_title", "youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc", "hashtags", "youtube_comment"];
    let fieldRules = "";
    for (const scope of fieldScopes) {
      if (instructionsByScope[scope]) {
        fieldRules += `\n\n## ${scope} rules:\n${instructionsByScope[scope]}`;
      }
    }

    const userPrompt = `Topic: ${content.topic}${fieldRules}`;

    // ── Step 1: Generate text (Claude Sonnet) ──
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_content",
              description: "Save the generated social media content for all platforms.",
              parameters: {
                type: "object",
                properties: {
                  post_title: { type: "string", description: "Content title, max 60 characters, creates tension and curiosity with a core keyword" },
                  youtube_title: { type: "string", description: "YouTube video title, 55-75 characters" },
                  youtube_desc: { type: "string", description: "YouTube description, 1800-2500 characters with hashtags" },
                  facebook_desc: { type: "string", description: "Facebook caption, 600-1200 characters with hashtags" },
                  linkedin_desc: { type: "string", description: "LinkedIn post, 900-1600 characters with hashtags" },
                  ig_tiktok_desc: { type: "string", description: "Instagram + TikTok caption, 200-300 characters plus hashtags" },
                  youtube_comment: { type: "string", description: "YouTube first comment, under 300 chars, no hashtags" },
                },
                required: ["post_title", "youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc", "youtube_comment"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_content" } },
      }),
    });

    if (!openRouterResponse.ok) {
      const errText = await openRouterResponse.text();
      console.error("OpenRouter text error:", openRouterResponse.status, errText);
      await adminClient
        .from("social_content")
        .update({ status: "error", error: `OpenRouter API error: ${openRouterResponse.status}` })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await openRouterResponse.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "save_content") {
      console.error("Unexpected response structure:", JSON.stringify(result));
      await adminClient
        .from("social_content")
        .update({ status: "error", error: "AI did not return structured content" })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: "AI did not return expected format" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const generated = JSON.parse(toolCall.function.arguments);

    // Save text fields and set status to complete
    const { error: updateError } = await adminClient
      .from("social_content")
      .update({
        post_title: generated.post_title,
        youtube_title: generated.youtube_title,
        youtube_desc: generated.youtube_desc,
        facebook_desc: generated.facebook_desc,
        linkedin_desc: generated.linkedin_desc,
        ig_tiktok_desc: generated.ig_tiktok_desc,
        youtube_comment: generated.youtube_comment,
        status: "unscheduled",
        error: null,
      })
      .eq("id", contentId);

    if (updateError) {
      console.error("DB update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save generated content" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
