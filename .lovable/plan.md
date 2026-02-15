

# Add AI-Generated Post Title to Content Pipeline

## Overview

Add `post_title` as a new AI-generated field that fires alongside all other platform copy during content generation. It gets its own editable instruction row in the database (same pattern as `youtube_title`, `facebook_desc`, etc.) and appears in both the Instructions admin page and the Content Detail page.

## Why this approach

The `post_title` column already exists on `social_content` and `posted_content`. The instruction system is built around scope-keyed rows in `content_instructions` -- adding a new scope row is the established pattern. The AI tool call in `generate-content` already uses structured output with required fields. Adding `post_title` as another required property in the same tool call means it generates atomically with everything else -- no extra API call, no separate step, no race condition.

---

## Database

### Insert a new instruction row into `content_instructions`

```sql
INSERT INTO content_instructions (scope, instruction, is_active)
VALUES (
  'post_title',
  'Maximum 60 characters. The title must create tension and curiosity -- the reader should feel this is vitally important and they will miss out if they skip it. Include at least one core keyword for the topic and target demographic. Avoid clickbait cliches like "SHOCKING" or "YOU WON''T BELIEVE." The tone should be urgent but credible.',
  true
);
```

No schema changes needed -- the `post_title` column is already on both `social_content` and `posted_content`.

---

## Edge Function: `generate-content`

### Add `post_title` to the field scopes array (line 81)

Add `"post_title"` to the `fieldScopes` array so its instruction gets included in the prompt when active.

### Add `post_title` to the tool call schema (line 112)

Add a new property to the `save_content` function parameters:

```
post_title: { type: "string", description: "Content title, max 60 characters, creates tension and curiosity with a core keyword" }
```

Add `"post_title"` to the `required` array.

### Save `post_title` in the DB update (line 162)

Add `post_title: generated.post_title` to the update object.

---

## Frontend

### `src/lib/platforms.ts`

Add `post_title: "Post Title"` to `CONTENT_FIELDS` -- this makes it appear automatically in the ContentDetail generated fields loop.

### `src/pages/ContentDetail.tsx`

Add a character target for `post_title` in the `CHAR_TARGETS` map: `post_title: "≤60"`.

### `src/pages/Instructions.tsx`

Add `post_title: "Post Title"` to the `SCOPE_LABELS` map. No other changes needed -- the Instructions page already dynamically renders all rows from the `content_instructions` query.

### `src/hooks/useContents.ts`

Add `post_title: string | null` to the `SocialContent` type.

---

## Files changed

| File | Change |
|------|--------|
| `content_instructions` table | Insert new row with scope `post_title` |
| `supabase/functions/generate-content/index.ts` | Add `post_title` to fieldScopes, tool schema, and DB update |
| `src/lib/platforms.ts` | Add `post_title` to `CONTENT_FIELDS` |
| `src/pages/ContentDetail.tsx` | Add `post_title` char target |
| `src/pages/Instructions.tsx` | Add `post_title` to `SCOPE_LABELS` |
| `src/hooks/useContents.ts` | Add `post_title` to type |

## Edge function deployment

Redeploy: `generate-content`
