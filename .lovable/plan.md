

# Script Generation Pipeline

## What exists today

The `generate-content` edge function makes **one** API call to Claude via OpenRouter. It sends the topic plus all active `content_instructions` and gets back social media copy (titles, descriptions, captions, comment) in a single tool-call response. It knows nothing about `post_length` -- it generates the same output whether the user picked "Short" or "Long."

The database now has `script_long` and `script_short` columns on `social_content`, but nothing writes to them. The `SocialContent` TypeScript type doesn't include them. The `CONTENT_FIELDS` map in `platforms.ts` doesn't reference them. The Instructions page has no scopes for script rules.

## The decision: Three sequential AI calls inside one edge function invocation

The `generate-content` function becomes a multi-step pipeline within a single HTTP request. Not three separate edge functions, not a queue system. Here's why:

- **Ordering is strict**: The short script depends on the long script's output. Social copy depends on the scripts existing. Sequential calls within one function are the simplest way to enforce this.
- **The caller doesn't change**: `CreateContent.tsx` and `ContentDetail.tsx` both call `supabase.functions.invoke("generate-content", { body: { contentId } })` and wait for it to finish. That contract stays identical.
- **Edge function timeout**: Supabase edge functions have a 150-second wall clock limit. Each Claude call takes 10-30 seconds. Three calls at ~25 seconds each = ~75 seconds. Well within budget.
- **Intermediate saves**: After each AI call, the result is written to the database immediately. If step 2 fails, the user still has the long script from step 1. The UI can show whatever was saved.

## Pipeline logic by `post_length`

**When `post_length = "Long"`** (3 AI calls):

```text
Step 1: Generate long-form script (script_long)
         -> save to DB immediately
Step 2: Generate short-form script (script_short) using script_long as input
         -> save to DB immediately  
Step 3: Generate social copy (titles, descriptions, captions, comment)
         using topic + script_long + script_short as context
         -> save to DB, set final status
```

**When `post_length = "Short"`** (2 AI calls):

```text
Step 1: Generate short-form script (script_short) from topic directly
         -> save to DB immediately
Step 2: Generate social copy using topic + script_short as context
         -> save to DB, set final status
```

**When `post_length` is null** (legacy/unset -- 1 AI call, current behavior):

```text
Step 1: Generate social copy from topic only (existing behavior unchanged)
```

This means the social copy generation (the final step) always has the scripts as context, so the titles, descriptions, and captions are derived from what the video actually covers rather than just a topic string. This is a quality improvement, not just a feature addition.

## What gets built

### 1. Edge function: `supabase/functions/generate-content/index.ts` (rewrite)

The function is restructured into a pipeline with helper functions:

- `generateLongScript(topic, instructions)` -- Calls Claude with the topic and the `script_long` instruction scope. Returns the full long-form script text. Uses a tool call to extract structured output (just `{ script_long: string }`).

- `generateShortScript(topic, longScript, instructions)` -- Calls Claude with the topic, the long script (if available), and the `script_short` instruction scope. When `post_length = "Long"`, it receives the long script and is told to extract the most compelling short-form segment. When `post_length = "Short"`, it receives only the topic. Uses a tool call returning `{ script_short: string }`.

- `generateSocialCopy(topic, scriptLong, scriptShort, instructions)` -- The existing social copy generation, but now with scripts included in the user prompt as context. The tool call schema stays the same (post_title, youtube_title, youtube_desc, etc.).

Each step writes its result to the database via `adminClient` immediately after success. If any step fails, the status is set to `"error"` with the specific step noted, and the function returns -- but previously saved steps are preserved.

### 2. New instruction scopes in `content_instructions` table (data insert)

Two new rows inserted:

| scope | instruction (initial) |
|---|---|
| `script_long` | "Write a long-form video script for YouTube. Include a hook, main content sections, and a call to action." |
| `script_short` | "Write a short-form video script for Reels/TikTok/Shorts. Under 60 seconds. Hook within the first 3 seconds." |

These are starting-point instructions. You'll refine them on the Instructions page just like you do for every other scope.

### 3. Instructions page: `src/pages/Instructions.tsx`

Add `script_long` and `script_short` to the `SCOPE_LABELS` map:

```text
script_long: "Long-Form Script"
script_short: "Short-Form Script"
```

The existing `ContentInstructionRow` component and query already render any row from `content_instructions` dynamically. Adding the labels is all that's needed -- the new rows will appear automatically in the "Field Instructions" section.

### 4. Content detail page: `src/pages/ContentDetail.tsx`

Add a new "Scripts" section above the existing "Generated Content" section. This section renders `ContentFieldCard` for:

- `script_long` (only shown when `content.post_length === "Long"`)
- `script_short` (always shown when either script exists)

These use the same `ContentFieldCard` component with autosave, copy button, and character count. No new components needed.

### 5. TypeScript type: `src/hooks/useContents.ts`

Add to the `SocialContent` type:

```typescript
script_long: string | null;
script_short: string | null;
```

### 6. Platforms config: `src/lib/platforms.ts`

The `CONTENT_FIELDS` map is used specifically for the social copy section in `ContentDetail.tsx`. Scripts are a separate section, so they do **not** go in `CONTENT_FIELDS`. Instead, a new `SCRIPT_FIELDS` map is added:

```typescript
export const SCRIPT_FIELDS = {
  script_long: "Long-Form Script",
  script_short: "Short-Form Script",
} as const;
```

This keeps the separation clean -- scripts are scripts, social copy is social copy.

### 7. No changes needed

- `CreateContent.tsx` -- already calls `generate-content` with `contentId`, and the edge function reads `post_length` from the DB row
- `supabase/config.toml` -- `generate-content` entry already exists
- Database schema -- columns already added by you
- YouTube upload pipeline -- reads `youtube_title`, `youtube_desc`, not scripts
- `ContentFieldCard.tsx` -- generic, works for any field
- RLS policies -- scripts are columns on `social_content`, already covered

## Files changed

| File | Action | What changes |
|------|--------|-------------|
| `supabase/functions/generate-content/index.ts` | Rewrite | Multi-step pipeline with post_length branching |
| `src/pages/Instructions.tsx` | Edit | Add script_long, script_short to SCOPE_LABELS |
| `src/pages/ContentDetail.tsx` | Edit | Add Scripts section above Generated Content |
| `src/hooks/useContents.ts` | Edit | Add script_long, script_short to SocialContent type |
| `src/lib/platforms.ts` | Edit | Add SCRIPT_FIELDS export |
| `content_instructions` table | Data insert | Two new rows for script_long and script_short scopes |

## Why not separate edge functions per step

Three separate functions (generate-long-script, generate-short-script, generate-social-copy) would require the caller to orchestrate the sequence, handle partial failures across HTTP boundaries, and triple the number of functions to maintain. The pipeline is internal to the generation process -- the caller's concern is "generate everything for this content," not managing individual steps. One function, one invocation, one responsibility.

## Why intermediate DB saves matter

If the long script generates successfully but the short script call fails (rate limit, timeout, whatever), the user still has the long script saved. They can read it, edit it, and hit "Regenerate" to retry. Without intermediate saves, a failure on step 3 would lose the work from steps 1 and 2. This is the correct pattern for multi-step AI pipelines.

