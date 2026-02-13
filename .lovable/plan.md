

# Reworking Content Generation: social_content + OpenRouter AI

## Overview

This plan replaces the old `content_jobs` / `platform_outputs` workflow with a streamlined system: the user enters a topic, uploads a video to R2, and an edge function calls OpenRouter to generate all platform-optimized content in one shot, saving results to the `social_content` table.

## 1. Database Changes

### 1a. Restructure `social_content` table

The current table is missing critical columns and has naming issues. Migration will:

- Rename `Title` to `youtube_title` (lowercase, consistent)
- Add `topic` (text, NOT NULL) -- the user input
- Add `user_id` (uuid, NOT NULL) -- ties to auth user
- Add `status` (text, NOT NULL, default `'new'`) -- workflow state: new, uploading, generating, complete, error
- Add `video_storage_path` (text) -- R2 object key
- Add `video_original_filename` (text)
- Add `video_mime_type` (text)
- Add `ig_tiktok_desc` (text) -- the combined Instagram+TikTok caption (rename from `instagram_desc`)
- Add `error` (text) -- store error messages
- Change `id` from `bigint` to `uuid` with `gen_random_uuid()` default (consistent with rest of app)
- Drop `type` column (no longer needed)
- Keep `image`, `video_url`, `facebook_desc`, `linkedin_desc`, `created_at`, `updated_at`

### 1b. RLS Policies on `social_content`

RLS is enabled but has zero policies, meaning nobody can read or write. Add:

- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id` (with check)
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`
- Admin overrides for all operations using `has_role(auth.uid(), 'admin')`

### 1c. New `content_instructions` table

To store the global instructions and per-field instructions that you provided, create a new table replacing `platform_instructions`:

```
content_instructions (
  id          bigint PK generated,
  scope       text NOT NULL,   -- 'global' | 'youtube_title' | 'youtube_desc' | 'facebook_desc' | 'linkedin_desc' | 'ig_tiktok_desc' | 'hashtags'
  instruction text NOT NULL,
  is_active   boolean DEFAULT true,
  version     integer DEFAULT 1,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
)
```

This is cleaner than the old `platform_instructions` table because the new workflow doesn't have separate "components" per platform -- each field maps directly to a column in `social_content`. The `scope` value tells the system which output field (or the global context) the instruction applies to.

Seed with the instructions you provided, broken into the appropriate scopes.

Admin-only RLS + authenticated SELECT (same pattern as existing `image_instructions`).

## 2. Edge Function: `generate-content`

A new Supabase Edge Function that:

1. Receives `{ contentId }` from the client
2. Validates the user via `getClaims()`
3. Reads the `social_content` row to get the `topic`
4. Reads all active `content_instructions` (global + per-field) and `image_instructions`
5. Constructs a system prompt from the global instructions, then a user prompt combining the topic with per-field rules
6. Calls **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`) with the assembled prompt
7. Uses **tool calling** (structured output) to extract the 5 fields (youtube_title, youtube_desc, facebook_desc, linkedin_desc, ig_tiktok_desc) as a clean JSON object -- no fragile text parsing
8. Updates the `social_content` row with the generated fields and sets `status = 'complete'`
9. On error, sets `status = 'error'` and stores the error message

### Why OpenRouter over Lovable AI

You specifically requested OpenRouter. OpenRouter gives you model choice (Claude, GPT-4o, Gemini, Llama, etc.) and a single API key across all providers. The edge function will default to a strong model (e.g., `anthropic/claude-sonnet-4` or `openai/gpt-4o`) but the model can be changed by updating a single constant.

### Why tool calling over raw text parsing

The prompt demands 5 distinct output sections with specific formatting. Asking the model to return free text and then regex-parsing it is fragile. Tool calling forces the model to return a validated JSON schema with exactly the fields we need. This eliminates parsing bugs entirely.

### Secret needed

`OPENROUTER_API_KEY` -- will be added as a Supabase secret.

## 3. Frontend Rework

### 3a. Routes

| Old | New |
|---|---|
| `/jobs` | `/content` -- list of social_content rows |
| `/jobs/new` | `/content/new` -- create form |
| `/jobs/:id` | `/content/:id` -- detail/edit view |
| `/instructions` | `/instructions` -- stays, but reworked |

### 3b. Create Page (`/content/new`)

Simplified form:
- **Topic** (required text input)
- **Video** (R2 upload, reusing existing `VideoUploader` + `uploadVideoToR2`)
- **Generate** button

Flow: Insert row into `social_content` with status `'new'` -> upload video to R2 -> update row with video path, set status `'ready'` -> call `generate-content` edge function -> navigate to detail page.

No more "format" selector (short/long). The prompt handles all platforms in one pass.

### 3c. Content List Page (`/content`)

Replace `JobsTable` with a `ContentTable` showing:
- Topic
- Status (with status badge)
- Created date
- Delete action

### 3d. Content Detail Page (`/content/:id`)

- Editable topic (with autosave, same pattern as current)
- Video section (display + replace)
- Generated content sections: each platform field displayed in its own card with:
  - Read-only or editable textarea
  - Copy button (reusing existing clipboard utility)
  - Character count (useful for IG/TikTok 200-300 char target)
- "Regenerate" button to re-call the edge function
- Image section (kept as-is for cover images)

### 3e. Instructions Page (`/instructions`)

Three sections:
1. **Global Instructions** -- single large textarea for the overarching system prompt (scope = `'global'`)
2. **Field Instructions** -- one card per field scope (youtube_title, youtube_desc, facebook_desc, linkedin_desc, ig_tiktok_desc, hashtags), each with textarea + active toggle + save button
3. **Image Instructions** -- kept exactly as-is

## 4. Cleanup

### Files to delete or gut:
- `src/hooks/useJob.ts` -- replace with `useContent.ts`
- `src/hooks/useJobs.ts` -- replace with `useContents.ts`
- `src/components/jobs/PlatformOutputTab.tsx` -- no longer needed
- `src/components/jobs/PlatformOutputsEditor.tsx` -- no longer needed
- `src/components/jobs/JobStatusBadge.tsx` -- rename to `StatusBadge.tsx`
- `src/components/jobs/JobsTable.tsx` -- replace with `ContentTable.tsx`
- `src/lib/platforms.ts` -- simplify (remove FORMAT_PLATFORMS, HASHTAG_LIMITS, keep platform labels if needed)
- Old DB functions: `init_platform_outputs_for_job`, `owns_job`, `validate_content_job_status` -- drop via migration

### Files to keep:
- `src/components/jobs/VideoUploader.tsx` -- reuse as-is
- `src/components/jobs/VideoSection.tsx` -- adapt props
- `src/components/jobs/ImagesSection.tsx` -- adapt to social_content columns
- `src/lib/uploadVideo.ts` -- keep R2 upload logic
- `src/lib/clipboard.ts` -- keep
- `src/hooks/useAutosave.ts` -- keep
- `supabase/functions/r2-upload-url/index.ts` -- keep

## 5. Implementation Order

1. Add `OPENROUTER_API_KEY` secret
2. Run DB migration (restructure `social_content`, create `content_instructions`, seed instructions, drop old functions/triggers)
3. Create `generate-content` edge function
4. Build new hooks (`useContent.ts`, `useContents.ts`)
5. Build new pages (Content list, Create, Detail)
6. Rework Instructions page
7. Update `App.tsx` routes and `AppLayout.tsx` nav
8. Clean up old files

## Technical Details

### `generate-content` edge function structure

```text
POST /generate-content
Body: { contentId: string }
Auth: Bearer token (validated via getClaims)

1. Read social_content row (verify user owns it)
2. Set status = 'generating'
3. Fetch active content_instructions + image_instructions
4. Build system prompt from global instruction
5. Build user prompt: "Topic: {topic}" + per-field rules
6. Call OpenRouter with tool_choice to extract structured output
7. Update row with generated fields, status = 'complete'
8. On error: status = 'error', error = message
```

### Tool calling schema for OpenRouter

```json
{
  "name": "save_content",
  "parameters": {
    "type": "object",
    "properties": {
      "youtube_title": { "type": "string" },
      "youtube_desc": { "type": "string" },
      "facebook_desc": { "type": "string" },
      "linkedin_desc": { "type": "string" },
      "ig_tiktok_desc": { "type": "string" }
    },
    "required": ["youtube_title", "youtube_desc", "facebook_desc", "linkedin_desc", "ig_tiktok_desc"]
  }
}
```

### Status flow

```text
new -> uploading -> ready -> generating -> complete
                                       -> error
```

