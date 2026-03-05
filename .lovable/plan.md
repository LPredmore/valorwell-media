

# Plan: Unified Script Column + Length-Specific Field Generation

## What's happening now

The database already has a single `script` column (the old `script_long` and `script_short` columns were dropped). But the entire codebase — the edge function, the frontend, and the TypeScript types — still references the deleted columns. The edge function writes to `script_long` / `script_short` (which silently fails since those columns no longer exist). The social copy step generates ALL platform fields for every video regardless of length.

## What needs to change

### 1. Edge Function (`supabase/functions/generate-content/index.ts`)

**Script saving:** Both `generateLongScript` and `generateShortScript` stay as-is (they produce the right content). The change is in how the result is saved — write to the `script` column instead of `script_long` / `script_short` (lines 256, 281).

**Length-specific social copy:** Split `generateSocialCopy` into length-aware generation. Rather than requesting all 6 fields every time, the tool call should only request the fields relevant to the post length:

- **All videos:** `post_title`, `youtube_title`, `facebook_desc`, `youtube_comment`
- **Long only:** `youtube_desc`, `linkedin_desc`
- **Short only:** `ig_tiktok_desc`

This is the right approach because it prevents the AI from wasting tokens generating fields that will never be used, and it keeps the data model clean — a Short video won't have a `youtube_desc` sitting in the database that nobody ever looks at. The function will accept `postLength` as a parameter to `generateSocialCopy` and dynamically build the tool properties and required fields.

**DB update in Step 3:** Only write the fields that were generated. Build the update object conditionally based on `postLength`.

### 2. Frontend: `src/pages/ContentDetail.tsx`

- Replace all `script_long` / `script_short` references with the unified `script` column
- The Scripts section should show a single `ContentFieldCard` for `script` with a label derived from `content.post_length` ("Long-Form Script" or "Short-Form Script")
- Show generated content fields conditionally based on `post_length`:
  - Always show: `post_title`, `youtube_title`, `facebook_desc`, `youtube_comment`
  - Long only: `youtube_desc`, `linkedin_desc`
  - Short only: `ig_tiktok_desc`

### 3. Frontend: `src/lib/platforms.ts`

- Remove `SCRIPT_FIELDS` entirely (no longer needed as a map — the detail page handles it inline)
- Split `CONTENT_FIELDS` into three groups:

```ts
export const COMMON_FIELDS = {
  post_title: "Post Title",
  youtube_title: "YouTube Title",
  facebook_desc: "Facebook Caption",
} as const;

export const LONG_FIELDS = {
  youtube_desc: "YouTube Description",
  linkedin_desc: "LinkedIn Post",
} as const;

export const SHORT_FIELDS = {
  ig_tiktok_desc: "Instagram + TikTok Caption",
} as const;
```

This is better than a single flat map with runtime filtering because it makes the length-specific structure explicit and prevents accidental rendering of irrelevant fields.

### 4. Frontend: `src/hooks/useContents.ts`

- Replace `script_long` / `script_short` in the `SocialContent` type with `script: string | null`

### 5. Frontend: `src/pages/Instructions.tsx`

- Update `SCOPE_LABELS`: replace `script_long` / `script_short` with a single `script: "Script"` entry. The instruction scopes in the database still use `script_long` and `script_short` as keys — those rows should remain as-is since they control the AI prompt per length. No DB migration needed for instructions.

### 6. Database trigger: `enforce_youtube_schedule_requirements`

Currently requires `youtube_desc` to be non-empty for scheduling. For Short videos, `youtube_desc` will be null. The trigger already skips image checks for Shorts — it needs the same treatment for `youtube_desc`: only require it when `post_length != 'Short'`.

### 7. `CHAR_TARGETS` in ContentDetail

Remove targets for fields not shown for a given length. The existing `CHAR_TARGETS` map is fine as-is since it's keyed by field name and only applies when the field is rendered.

## Files changed (summary)

| File | Change |
|------|--------|
| `supabase/functions/generate-content/index.ts` | Save to `script` column; make social copy length-aware |
| `src/lib/platforms.ts` | Split fields into COMMON/LONG/SHORT; remove SCRIPT_FIELDS |
| `src/pages/ContentDetail.tsx` | Use `script`; render fields by length |
| `src/hooks/useContents.ts` | Update SocialContent type |
| `src/pages/Instructions.tsx` | Update SCOPE_LABELS |
| DB migration | Update `enforce_youtube_schedule_requirements` trigger |

