import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const count = Math.min(25, Math.max(5, Number(body.count) || 10));
    const theme = typeof body.theme === "string" ? body.theme.trim().slice(0, 200) : "";

    // Load instruction context
    const { data: instructions } = await supabase
      .from("user_content_instructions")
      .select("scope, instruction, is_active")
      .eq("user_id", userId)
      .in("scope", ["channel_brief", "global"]);

    const channelBrief = instructions?.find((i) => i.scope === "channel_brief")?.instruction || "";
    const globalInstr = instructions?.find((i) => i.scope === "global" && i.is_active)?.instruction || "";

    // Recent topics to avoid
    const [{ data: recentIdeas }, { data: recentContent }] = await Promise.all([
      supabase.from("content_ideas").select("topic").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
      supabase.from("social_content").select("topic").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);

    const recentTopics = [
      ...(recentIdeas?.map((r) => r.topic).filter(Boolean) || []),
      ...(recentContent?.map((r) => r.topic).filter(Boolean) || []),
    ].slice(0, 60);

    const systemPrompt = `You are a world-class viral short-form video strategist (TikTok, Instagram Reels, YouTube Shorts) for a specific creator.

CREATOR'S CHANNEL BRIEF:
${channelBrief || "(no channel brief provided — infer from context)"}

${globalInstr ? `CREATOR'S VOICE / STYLE RULES:\n${globalInstr}\n` : ""}

Your job: invent ${count} short-form video ideas that would scroll-stop, hook hard in the first 2 seconds, and feel native to vertical short-form platforms. Each idea should be specific, punchy, and clearly tied to this creator's niche and audience. Avoid generic clickbait.

${recentTopics.length > 0 ? `AVOID these recent topics (don't repeat or rephrase them):\n${recentTopics.map((t) => `- ${t}`).join("\n")}\n` : ""}

${theme ? `THEME / ANGLE FOR THIS BATCH: ${theme}\n` : ""}

Return ${count} ideas via the create_viral_ideas tool. Each topic should read like a video title or hook (8-15 words), not a description.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate ${count} viral short-form video ideas now.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_viral_ideas",
              description: "Return the generated viral short-form video ideas.",
              parameters: {
                type: "object",
                properties: {
                  ideas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        topic: { type: "string", description: "Punchy video title / hook, 8-15 words" },
                        category: { type: "string", description: "Short category label (1-3 words)" },
                        avatar: { type: "string", description: "Target audience persona, 1-4 words" },
                        hook_reason: { type: "string", description: "One sentence on why this hooks" },
                      },
                      required: ["topic", "category", "avatar", "hook_reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["ideas"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_viral_ideas" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit hit — try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call returned:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI did not return ideas" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const ideas = (parsed.ideas || []) as Array<{ topic: string; category?: string; avatar?: string }>;

    if (ideas.length === 0) {
      return new Response(JSON.stringify({ error: "No ideas generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inserts = ideas.map((i) => ({
      user_id: userId,
      topic: i.topic.slice(0, 500),
      category: i.category?.slice(0, 100) || null,
      avatar: i.avatar?.slice(0, 100) || null,
      length: "Short" as const,
    }));

    const { error: insertErr } = await supabase.from("content_ideas").insert(inserts);
    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ count: inserts.length, ideas: inserts }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-viral-shorts-ideas error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
