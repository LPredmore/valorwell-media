import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat-v3-0324";

// ── AI call helper ──────────────────────────────────────────────────

async function callAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  toolProperties: Record<string, unknown>,
  requiredFields: string[],
): Promise<Record<string, string>> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: toolDescription,
            parameters: {
              type: "object",
              properties: toolProperties,
              required: requiredFields,
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`OpenRouter error (${toolName}):`, response.status, errText);
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function.name !== toolName) {
    console.error(`Unexpected response for ${toolName}:`, JSON.stringify(result));
    throw new Error(`AI did not return expected format for ${toolName}`);
  }

  return JSON.parse(toolCall.function.arguments);
}

// ── Step generators ─────────────────────────────────────────────────

async function generateLongScript(
  apiKey: string,
  topic: string,
  instructions: Record<string, string>,
): Promise<string> {
  const systemPrompt = instructions["global"] || "You are a professional video scriptwriter.";
  let userPrompt = `Topic: ${topic}`;
  if (instructions["script_long"]) {
    userPrompt += `\n\n## Script rules:\n${instructions["script_long"]}`;
  }

  const result = await callAI(
    apiKey,
    systemPrompt,
    userPrompt,
    "save_long_script",
    "Save the generated long-form video script.",
    { script_long: { type: "string", description: "Full long-form video script for YouTube" } },
    ["script_long"],
  );

  return result.script_long;
}

async function generateShortScript(
  apiKey: string,
  topic: string,
  longScript: string | null,
  instructions: Record<string, string>,
): Promise<string> {
  const systemPrompt = instructions["global"] || "You are a professional video scriptwriter.";
  let userPrompt = `Topic: ${topic}`;

  if (longScript) {
    userPrompt += `\n\n## Long-form script (extract the most compelling segment for a short-form version):\n${longScript}`;
  }

  if (instructions["script_short"]) {
    userPrompt += `\n\n## Short-form script rules:\n${instructions["script_short"]}`;
  }

  const result = await callAI(
    apiKey,
    systemPrompt,
    userPrompt,
    "save_short_script",
    "Save the generated short-form video script.",
    { script_short: { type: "string", description: "Short-form video script for Reels/TikTok/Shorts" } },
    ["script_short"],
  );

  return result.script_short;
}

async function generateSocialCopy(
  apiKey: string,
  topic: string,
  scriptLong: string | null,
  scriptShort: string | null,
  instructions: Record<string, string>,
): Promise<Record<string, string>> {
  const systemPrompt = instructions["global"] || "You are a social media content generation assistant.";

  let userPrompt = `Topic: ${topic}`;

  if (scriptLong) {
    userPrompt += `\n\n## Long-form script:\n${scriptLong}`;
  }
  if (scriptShort) {
    userPrompt += `\n\n## Short-form script:\n${scriptShort}`;
  }

  const fieldScopes = ["post_title", "youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc", "hashtags", "youtube_comment"];
  for (const scope of fieldScopes) {
    if (instructions[scope]) {
      userPrompt += `\n\n## ${scope} rules:\n${instructions[scope]}`;
    }
  }

  return await callAI(
    apiKey,
    systemPrompt,
    userPrompt,
    "save_content",
    "Save the generated social media content for all platforms.",
    {
      post_title: { type: "string", description: "Content title, max 60 characters, creates tension and curiosity with a core keyword" },
      youtube_title: { type: "string", description: "YouTube video title, 55-75 characters" },
      youtube_desc: { type: "string", description: "YouTube description, 1800-2500 characters with hashtags" },
      facebook_desc: { type: "string", description: "Facebook caption, 600-1200 characters with hashtags" },
      linkedin_desc: { type: "string", description: "LinkedIn post, 900-1600 characters with hashtags" },
      ig_tiktok_desc: { type: "string", description: "Instagram + TikTok caption, 200-300 characters plus hashtags" },
      youtube_comment: { type: "string", description: "YouTube first comment, under 300 chars, no hashtags" },
    },
    ["post_title", "youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc", "youtube_comment"],
  );
}

// ── Main handler ────────────────────────────────────────────────────

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
    const { data: instructionRows } = await adminClient
      .from("content_instructions")
      .select("scope, instruction")
      .eq("is_active", true);

    const instructions: Record<string, string> = {};
    for (const row of instructionRows || []) {
      instructions[row.scope] = row.instruction;
    }

    const topic = content.topic;
    const postLength = content.post_length; // "Long", "Short", or null

    let scriptLong: string | null = null;
    let scriptShort: string | null = null;

    // ── Step 1: Long script (only for "Long") ──
    if (postLength === "Long") {
      try {
        console.log(`[generate-content] Step 1: Generating long script for "${topic}"`);
        scriptLong = await generateLongScript(OPENROUTER_API_KEY, topic, instructions);

        await adminClient
          .from("social_content")
          .update({ script_long: scriptLong })
          .eq("id", contentId);

        console.log("[generate-content] Step 1 complete: long script saved");
      } catch (e) {
        console.error("[generate-content] Step 1 failed:", e);
        await adminClient
          .from("social_content")
          .update({ status: "error", error: `Failed at step 1 (long script): ${e instanceof Error ? e.message : "Unknown error"}` })
          .eq("id", contentId);
        return new Response(JSON.stringify({ error: "Long script generation failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Step 2: Short script (for both "Long" and "Short") ──
    if (postLength === "Long" || postLength === "Short") {
      try {
        console.log(`[generate-content] Step 2: Generating short script for "${topic}"`);
        scriptShort = await generateShortScript(OPENROUTER_API_KEY, topic, scriptLong, instructions);

        await adminClient
          .from("social_content")
          .update({ script_short: scriptShort })
          .eq("id", contentId);

        console.log("[generate-content] Step 2 complete: short script saved");
      } catch (e) {
        console.error("[generate-content] Step 2 failed:", e);
        await adminClient
          .from("social_content")
          .update({ status: "error", error: `Failed at step 2 (short script): ${e instanceof Error ? e.message : "Unknown error"}` })
          .eq("id", contentId);
        return new Response(JSON.stringify({ error: "Short script generation failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Step 3: Social copy ──
    try {
      console.log(`[generate-content] Step 3: Generating social copy for "${topic}"`);
      const generated = await generateSocialCopy(OPENROUTER_API_KEY, topic, scriptLong, scriptShort, instructions);

      // Re-fetch to see current media state
      const { data: current } = await adminClient
        .from("social_content")
        .select("image, video_storage_path")
        .eq("id", contentId)
        .single();

      const isShort = content.post_length === "Short";
      const hasAllMedia = isShort
        ? !!current?.video_storage_path
        : !!current?.image && !!current?.video_storage_path;
      const newStatus = hasAllMedia ? "unscheduled" : "incomplete";

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
          status: newStatus,
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

      console.log("[generate-content] Step 3 complete: social copy saved, status:", newStatus);
    } catch (e) {
      console.error("[generate-content] Step 3 failed:", e);
      await adminClient
        .from("social_content")
        .update({ status: "error", error: `Failed at step 3 (social copy): ${e instanceof Error ? e.message : "Unknown error"}` })
        .eq("id", contentId);
      return new Response(JSON.stringify({ error: "Social copy generation failed" }), {
        status: 502,
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
