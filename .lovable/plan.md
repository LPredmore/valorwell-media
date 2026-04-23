

## Plan: About tab in Settings + AI viral-shorts idea generator

Two related features. Both leverage the existing `channel_brief` instruction (the "what is this channel/app about" text) — the About tab edits it with a roomier UI, and the new generator uses it as context to invent viral Shorts topics.

### Part 1 — About tab in Settings

**Storage:** No new table. The `channel_brief` scope already exists in `user_content_instructions` and `content_instruction_defaults` and is seeded for every user. The About tab is just a focused, larger editor for that one row — same Save / Restore default behavior as the Instructions tab.

**Why reuse `channel_brief`:** The AI generation pipeline already pulls this into every prompt (script, titles, descriptions, hashtags). If we made a separate "about" table, we'd have to wire it into every prompt all over again. One source of truth.

**UI changes:**
- Add an `About` tab to `src/pages/Settings.tsx` (between Profile and Instructions)
- New `src/components/settings/AboutView.tsx`:
  - Large textarea (16 rows, monospace-friendly), generous max-width
  - Header: "About your channel / application"
  - Helper copy: "Tell me everything — who you are, what you make, your audience, your tone, your rules. I use this on every piece of content I write for you."
  - Save button + Restore default button (same mutations as `InstructionsView`)
  - Character count
- In `InstructionsView`, hide the `channel_brief` row from the field list (it now lives in About) — keep it accessible to admins in the System defaults tab

**Settings tab order:** Profile · About · Instructions · Connections · Billing

### Part 2 — Generate viral Shorts ideas

A button on the Ideas tab (`/schedule?tab=ideas`) that calls AI to invent N viral Shorts topics tailored to the user's channel, then inserts them as new rows in `content_ideas` (length = "Short").

**UI:**
- New button in `IdeasView` header next to "Add Idea" / "CSV": **"Generate Ideas"** (Sparkles icon)
- Opens a small dialog:
  - Slider / number input: "How many ideas?" (default 10, range 5–25)
  - Optional text input: "Theme or angle (optional)" — e.g. "holiday season", "beginner tips"
  - Generate button
- On submit: shows progress, then closes and the new ideas appear in the table (existing query invalidation)

**New edge function: `generate-viral-shorts-ideas`**
- Auth: verify JWT, get user_id
- Reads from DB:
  - User's `channel_brief` from `user_content_instructions`
  - User's `global` instruction (tone/style)
  - Last 30 ideas + last 30 pieces of content (topic only) — to avoid repeats
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with structured tool-calling output:
  ```
  ideas: [{ topic, category, avatar, hook_reason }]
  ```
  System prompt explains: "You are a viral Shorts strategist for this creator. Use their channel brief to invent N short-form video ideas with strong hooks, scroll-stopping angles, and platform-native framing (TikTok/Reels/Shorts). Avoid these recent topics: [...]."
- Inserts the returned ideas into `content_ideas` server-side (length = `Short`, `user_id` = caller, `category`/`avatar` from AI suggestion if provided)
- Returns `{ count, ideas }`
- Handles 429 (rate limit) and 402 (credits) cleanly with friendly error messages

**Frontend hook:** Add `useGenerateViralShortsIdeas` mutation in `src/hooks/useIdeas.ts` that invokes the edge function and invalidates `["content_ideas"]` on success.

### Files to create / modify

**New:**
- `src/components/settings/AboutView.tsx`
- `src/components/ideas/GenerateIdeasDialog.tsx`
- `supabase/functions/generate-viral-shorts-ideas/index.ts`

**Modified:**
- `src/pages/Settings.tsx` — add About tab, route, and `VALID_TABS` entry
- `src/components/settings/InstructionsView.tsx` — exclude `channel_brief` from the user field list (it now lives on the About tab)
- `src/components/ideas/IdeasView.tsx` — add "Generate Ideas" button + dialog wiring
- `src/hooks/useIdeas.ts` — add `useGenerateViralShortsIdeas` mutation

**No DB migration needed** — `channel_brief` already exists and is seeded.

### Behavior summary

- User opens **Settings → About** → sees their seeded channel brief in a roomy textarea → edits and saves → it's now used in every AI generation
- User clicks **Restore default** → reverts to the system default
- Admins editing the system default in Instructions still works as before
- User clicks **Generate Ideas** on the Ideas tab → picks count (default 10) → AI invents Shorts ideas tailored to their channel brief → ideas drop into the table → user selects + clicks Generate Content as usual

### Out of scope

- Generating Long-form ideas (this button is specifically Shorts; Long-form can be a future toggle)
- Auto-running script generation on the AI-generated ideas (user reviews them first, then clicks Generate Content)
- LinkedIn/Reddit native connections — still paused awaiting credentials

