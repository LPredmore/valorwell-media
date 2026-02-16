

# Add YouTube Comment Instruction

## Summary

Add a new `youtube_comment` scope to the `content_instructions` table and surface it in the Instructions page UI. This is a two-part change: one database insert and one small UI update.

## Changes

### 1. Database: Insert new row into `content_instructions`

Insert a row with:
- `scope`: `youtube_comment`
- `instruction`: the provided comment instruction text
- `is_active`: `true`

### 2. `src/pages/Instructions.tsx` -- Add label for new scope

Add `youtube_comment: "YouTube Comment"` to the `SCOPE_LABELS` map so the Instructions page displays it with a readable name alongside the other field instructions.

### 3. `supabase/functions/generate-content/index.ts` -- Include youtube_comment in generation

Add `"youtube_comment"` to the `fieldScopes` array so the generate-content edge function pulls the instruction and passes it to the AI. Add `youtube_comment` to the tool's `parameters.properties` so the AI returns a generated comment. Include `youtube_comment` in the DB update after generation.

This means content generation will automatically produce a first comment alongside all the other fields, stored in `social_content.youtube_comment` (column already exists on the table).

## Technical Detail

```text
fieldScopes array update:
  ["post_title", "youtube_title", "youtube_desc", "facebook_desc",
   "linkedin_desc", "ig_tiktok_desc", "hashtags", "youtube_comment"]

Tool parameter addition:
  youtube_comment: { type: "string", description: "YouTube first comment, under 300 chars, no hashtags" }

DB update addition:
  youtube_comment: generated.youtube_comment
```

No schema migration needed -- `social_content.youtube_comment` column already exists.

