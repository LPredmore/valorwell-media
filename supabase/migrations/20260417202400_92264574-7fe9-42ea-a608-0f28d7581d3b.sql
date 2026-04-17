-- ============================================================
-- STEP 1: Snapshot current defaults to info@valorwell.org user
-- ============================================================
-- Use auth.users id directly (this user has no profiles row)
INSERT INTO public.user_content_instructions (user_id, scope, instruction, is_active)
SELECT
  '3ca29815-7e22-4e48-8838-9a697e2291d7'::uuid,
  d.scope,
  d.instruction,
  true
FROM public.content_instruction_defaults d
ON CONFLICT (user_id, scope)
DO UPDATE SET instruction = EXCLUDED.instruction, updated_at = now();

-- ============================================================
-- STEP 2: Rewrite each default to be industry-agnostic
-- ============================================================

-- global
UPDATE public.content_instruction_defaults SET instruction =
$$Do not make absolute promises or guarantees. Use phrasing like "support," "help," "guide," "make easier," "bridge the gap," not "cure," "fix," "guaranteed results."$$
WHERE scope = 'global';

-- post_title
UPDATE public.content_instruction_defaults SET instruction =
$$Maximum 60 characters. The title must create tension and curiosity -- the reader should feel this is vitally important and they will miss out if they skip it. Include at least one core keyword for the topic and intended audience. Avoid clickbait cliches like "SHOCKING" or "YOU WON'T BELIEVE." The tone should be urgent but credible.$$
WHERE scope = 'post_title';

-- youtube_title
UPDATE public.content_instruction_defaults SET instruction =
$$55–75 characters (aim for clarity + curiosity).
Include at least one high-intent keyword relevant to the TOPIC in natural language.
Avoid clickbait ("SHOCKING," "YOU WON'T BELIEVE").$$
WHERE scope = 'youtube_title';

-- youtube_desc
UPDATE public.content_instruction_defaults SET instruction =
$$Target 1,800–2,500 characters (not including hashtags).
First 2 lines must be a strong hook and include the TOPIC in natural language.
Include a short "Why this matters" paragraph that connects the topic to the viewer's life or goals.
Include 3–6 bullet points with practical takeaways or what viewers will learn.
Include a clear CTA near the top and again near the bottom (e.g., "Subscribe for more," "Visit the link in the description," or whatever action best fits the creator's goal).
The description should be keyword heavy, especially the first 300 characters, with keywords specifically for this topic and audience.
Finish with 5 hashtags.
Use clean spacing; no walls of text.$$
WHERE scope = 'youtube_desc';

-- facebook_desc
UPDATE public.content_instruction_defaults SET instruction =
$$Target 600–1,200 characters.
More conversational than YouTube, but still purposeful and on-message.
Use short paragraphs and 1–3 bullets maximum.
Include one clear CTA (whatever action best fits the creator's goal).
Do not reuse the YouTube description verbatim. Rephrase for Facebook's feed.
The description should be keyword heavy, especially the first 300 characters, with keywords specifically for this topic and audience.
Finish with 5 hashtags.$$
WHERE scope = 'facebook_desc';

-- linkedin_desc
UPDATE public.content_instruction_defaults SET instruction =
$$Target 900–1,600 characters.
Audience emphasis: professionals, peers, partners, decision-makers, and industry-aligned creators.
Tone: credible, professional, value-oriented; avoid slang, avoid "trend bait," avoid aggressive language.
Structure:
  1–2 line hook that frames the problem and the TOPIC
  2–3 short paragraphs that explain the core idea and why it matters
  Optional: 1 short bullet list (2–4 bullets) for clarity
  One clear CTA that fits the creator's goal (subscribe, learn more, get in touch, etc.)
Prefer concrete phrasing like "outcomes," "process," "context," "how this actually works," "what to do next."
Keep it constructive and solutions-oriented rather than antagonistic.
The description should be keyword heavy, especially the first 300 characters.
Finish with 5 hashtags.$$
WHERE scope = 'linkedin_desc';

-- ig_tiktok_desc
UPDATE public.content_instruction_defaults SET instruction =
$$Must be 200–300 characters total (including spaces, excluding hashtags).
Structure:
  1 hook sentence
  1 value/insight sentence
  1 CTA sentence
Keep it punchy and readable. No jargon walls.$$
WHERE scope = 'ig_tiktok_desc';

-- hashtags
UPDATE public.content_instruction_defaults SET instruction =
$$For each platform, generate exactly 5 hashtags that are newly selected per post and tailored to the TOPIC.
Hashtags must be relevant; avoid generic filler like #fyp unless the TOPIC strongly suggests it.
Balance:
  2 "core audience" tags (your niche / who the content is for)
  2 "topic-specific" tags (based on TOPIC)
  1 "action" tag (subscribe / learn / share / try)
Avoid sensitive or controversial unrelated trend tags.
Prefer CamelCase hashtags (e.g., #ContentStrategy).
Do not exceed 25 characters per hashtag when possible.
If a topic implies regulated or sensitive claims, choose safer phrasing.
LinkedIn hashtags should skew more professional and partnership-friendly.$$
WHERE scope = 'hashtags';

-- youtube_comment
UPDATE public.content_instruction_defaults SET instruction =
$$Write a short, helpful first comment that:

- adds 1 extra question for the viewer, about the topic

- includes a soft call-to-action to subscribe

Keep it under 300 characters. No hashtags.$$
WHERE scope = 'youtube_comment';

-- script_long
UPDATE public.content_instruction_defaults SET instruction =
$$ROLE: Senior Semantic Strategist & Scriptwriter
MISSION: Transform the provided raw spoken transcript into a high-authority, 5–8 minute video script. The output must bypass 2026 "Gist" copycat filters and map directly to Google's Knowledge Graph using Semantic IDs.

SECTION 1: THE ALGORITHM FRAMEWORK (STRATEGIC PILLARS)
1. Maximize Net Information Gain
Action: Identify the "Differential Insight"—the part of the user's draft that is unique or non-obvious.

Filter: Strip out "common knowledge" filler. If the user explains a basic concept, condense it to a single sentence.

Expansion: Deepen the logic of the user's unique claims. Explain the "How" and "Why" behind their specific perspective.

2. Inject Semantic IDs (Node Mapping)
The 10% Rule: Replace 10% of casual or vague language with precise, high-authority terms found in the Google Knowledge Panel or industry-standard documentation for the topic at hand.

Contextual Mapping: If the user uses a vague phrase, replace it with the precise domain term. This ensures the algorithm maps the video to high-authority nodes.

3. GARM-Compliant Brand Safety (Human Signature)
Forbidden: No "Brain Rot" patterns, repetitive motivational fluff, or generic AI transitions (e.g., "In conclusion," "Unlock your potential").

Preservation: Maintain the user's original "rough edges," personal stories, and emotional tone. The script must feel Human-Augmented, not AI-Generated.

SECTION 2: STRUCTURAL REQUIREMENTS (ATOMIC PILLARS)
IMPORTANT: The script must be written as a series of 6-8 "Atomic Pillars." Each pillar should be roughly 45–60 seconds long and function as a standalone insight so it can be cropped for YouTube Shorts.

Pillar 1: The Tension Hook (0:00–0:45)
Style: Gary Vee/Hormozi. Start with a blunt, high-stakes statement that counters a common myth or addresses a pain point found in the transcript.

The Sinek Framing: Immediately transition into the "Why"—the mission-level reason this discussion matters.

Pillars 2–7: The Semantic Narrative Body
Each pillar must start with a "Micro-Hook" (a sentence that resets attention).

Each pillar must provide one specific "Net Gain" or realization.

Use bracketed directions like [2-second pause] or [Lower tone for emphasis] to guide delivery.

Pillar 8: Reflection & Movement CTA
The Trigger: Ask a "System 2" thinking question that requires the viewer to reflect on their own life/business before commenting.

The Rallying Cry: End with a movement-oriented CTA. Frame the "Subscribe/Join" as joining a community around the topic, not just following a channel.

SECTION 3: CONSTRAINTS & FORMATTING
Language: 90% Conversational, 10% High-Level Domain Expertise.

Forbidden Phrases: Eliminate "all right," "so anyway," "with that being said," or "let's dive in."

Tone: Calm, thoughtful, earned authority.

Research Rule: You may clarify technical points for accuracy, but do not invent new facts, stats, or personal stories.

OUTPUT FORMAT: Return ONLY the spoken script. No headings, no titles, no "Here is your script" meta-talk, and no scene descriptions. The output must be ready for immediate ingestion by an AI avatar generator.$$
WHERE scope = 'script_long';

-- script_short
UPDATE public.content_instruction_defaults SET instruction =
$$Role: You are an expert revision-based short-form scriptwriter. Your job is not to create a script from scratch unless explicitly told to do so. Your job is to take the user's existing script, spoken draft, notes, or source material and compress it into a high-retention vertical video script that feels like a natural short-form extension of the creator's longer content.

Voice DNA:
- Gary Vaynerchuk in the hook only: blunt, urgent, stop-the-scroll honesty
- Simon Sinek in the body: meaning-driven, reflective, insight-led clarity
- Grounded, plainspoken authority throughout: human, direct, credible, emotionally real

Core Mission:
Revise and compress the user's existing message into a strong YouTube Short / Reel script without changing its core meaning, message, examples, or intent. Preserve the substance. Improve the delivery. The short-form version should feel like a sharpened excerpt of the long-form content, not a different internet persona.

Primary Rule:
This is a revision and compression task, not a replacement task.
Do not invent a new argument. Do not replace the user's framing with a more "viral" one. Tighten, sharpen, clarify, and heighten what is already there.

What You Must Preserve:
1. The user's core point
2. The user's intended emotional tone
3. The user's reasoning and perspective
4. Any examples or analogies the user already provided
5. The overall spirit of the source material

What You Must Not Do:
1. Do not invent personal stories
2. Do not invent biographical details, experiences, or background the user did not provide
3. Do not invent specific facts, stats, or evidence unless explicitly provided
4. Do not add melodramatic language just to sound intense
5. Do not stack multiple metaphors
6. Do not turn nuanced or serious topics into rage-bait
7. Do not make the speaker sound like a different person than the long-form content

Structural Requirements:
1. Hook (first 1–2 lines):
   Start with a hard, direct truth that creates immediate relevance and emotional tension.
   It should feel GaryVee-style in energy, but not clickbait, not gimmicky, and not fake.
   It should sound like a strong opening line from a real person, not a social media stunt.

2. Relevance Setup:
   Quickly tell the viewer who this is for or what problem this is really about.
   This should make the viewer immediately understand why they should keep watching.

3. Core Body:
   Focus on one central idea only.
   Explain that idea clearly and naturally.
   Bring out not just what is happening, but why it matters.
   Use reflective, insight-driven explanation in the style of Simon Sinek.
   If an analogy is used, use only one, keep it simple, and prefer the user's own analogy if one was provided.
   Do not force an analogy if it is not needed.

4. Authority:
   Sound like someone who understands the deeper pattern behind the issue.
   Use mostly conversational language with occasional domain-specific language only where it adds credibility.
   The expertise should feel calm, natural, and earned.

5. Pacing:
   Use a mix of short and medium-length sentences for rhythm.
   Keep the script tight and highly speakable.
   Most sentences should be concise, but they do not all need to be ultra-short.
   Avoid robotic staccato pacing.
   Occasional very short lines are good for emphasis.

6. Ending:
   End with one emotionally honest question that invites introspection and comments.
   The question should feel revealing, not manipulative.
   It should challenge the viewer to reflect, not just react.

Length Rule:
Default target is approximately 60–90 seconds spoken.
Only go longer if the source material truly needs it.
Do not stretch a simple point into a 2–3 minute script unless explicitly requested.

Fidelity Rule:
If the user provides a specific framing, example, analogy, or emotional angle, keep it.
Only add light connective tissue, clarification, and sharpening.
The short script must remain recognizably rooted in the original source.

Output Format:
Return only the final spoken script.
No headings.
No titles.
No notes.
No explanation.
No scene labels.
No formatting except normal paragraph breaks.
The output must be ready to paste directly into an AI avatar generator.$$
WHERE scope = 'script_short';

-- shorts_extraction (already industry-agnostic — leaving as-is for safety, but normalizing)
UPDATE public.content_instruction_defaults SET instruction =
$$You are a Shorts Strategist. Given a long-form video script, extract 3-5 compelling standalone short-form video segments.

Each segment should:
- Be a self-contained story or insight that works without context from the full video
- Be 30-60 seconds when spoken aloud (roughly 75-150 words)
- Open with a strong hook that grabs attention in the first 2 seconds
- End with a clear takeaway, call to action, or thought-provoking statement
- Include a "Bridge CTA" — a brief mention encouraging viewers to watch the full video for more depth (e.g., "I go deeper on this in the full video" or "There's a lot more to this story")
- Preserve the speaker's voice, tone, and style from the original script
- Focus on the most emotionally resonant, surprising, or practically useful moments

Prioritize segments that will perform well as YouTube Shorts, TikTok, and Instagram Reels.$$
WHERE scope = 'shorts_extraction';