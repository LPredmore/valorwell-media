

# Remove All Image Generation, Add Manual Cover Image Upload

## Overview

Strip every trace of AI image generation from the system -- edge functions, database table, admin UI, and content generation pipeline -- and replace it with a simple optional file upload on the Create Content page. The image gets stored in R2 (same infrastructure as videos) with only a path reference in the database.

## Why this architecture

The existing `uploadVideoToR2` helper is misnamed but functionally generic: it gets a presigned PUT URL from `r2-upload-url` and uploads any file via XHR with progress tracking. Reusing it for images means zero new backend code for the upload itself. The image path goes into the existing `image` column on `social_content`. No new tables, no new edge functions, no new columns.

The `image_prompt` column stays in the database for now -- dropping columns risks data loss on existing rows and requires a migration. It will simply go unused. If you want it removed later, that's a separate destructive migration with a data check.

---

## Removals

### 1. Delete `supabase/functions/regenerate-image/index.ts`
The entire edge function exists solely for AI image regeneration. Delete the file and remove the deployed function.

### 2. Remove `[functions.regenerate-image]` from `supabase/config.toml` (lines 18-19)

### 3. Strip image generation from `supabase/functions/generate-content/index.ts`
- Remove `import { AwsClient }` (line 2) -- only used for server-side R2 image upload
- Remove the entire "Step 2: Image generation" block (lines 180-310) -- prompt crafting, FLUX.2 Pro call, R2 upload, and `image_prompt` save
- Change the comment on line 159 from "status stays 'generating' while image is produced" to just saving text fields
- The function flow becomes: generate text with Claude -> save text fields -> set status to "complete"
- Redeploy `generate-content`

### 4. Remove Image Instructions from `src/pages/Instructions.tsx`
- Remove the `ImageInstruction` type (lines 22-30)
- Remove the `ImageRow` component (lines 83-116)
- Remove the `image-instructions` query (lines 134-145)
- Remove the "Image Instructions" section from JSX (lines 195-204)

### 5. Drop the `image_instructions` database table
This table only served AI image generation rules. With generation removed, the table is dead weight. A migration will `DROP TABLE image_instructions` -- the table has no foreign keys and no other code references it after the Instructions.tsx cleanup.

---

## Additions

### 6. Add optional cover image upload to `src/pages/CreateContent.tsx`

New state:
- `imageFile: File | null` -- selected image
- `imagePreview: string | null` -- object URL for thumbnail preview

New UI (between the Video uploader and the Submit button):
- Label: "Cover Image (Optional)"
- A drop zone accepting `image/*` with click-to-browse
- When an image is selected, show a thumbnail preview with a remove button
- Cleanup the object URL on unmount

Updated submit flow (after video upload succeeds):
1. If `imageFile` exists, compute `storagePath = content/{contentId}/cover.{ext}`
2. Call `uploadVideoToR2(storagePath, imageFile)` -- works for any file type
3. Update the `social_content` row: `{ image: storagePath }`
4. Then call `generate-content` as before

### 7. Update `src/components/content/ImageSection.tsx`
- Change "No image generated yet" to "No cover image"

---

## What stays untouched

- The `image` column on `social_content` and `posted_content` -- continues to store the R2 path string
- The `image_prompt` column -- left in place to avoid a destructive migration; simply unused
- `ImageSection` component logic -- already fetches and displays images from R2 via `r2-read-url`
- `ImageLightbox` component -- unchanged
- The "Regenerate" button on ContentDetail -- still calls `generate-content` for text regeneration, which will no longer touch images
- `r2-upload-url` and `r2-read-url` edge functions -- unchanged
- `uploadVideoToR2` helper -- reused as-is for image uploads

---

## Files changed

| File | Action |
|------|--------|
| `supabase/functions/regenerate-image/index.ts` | Delete |
| `supabase/config.toml` | Remove `regenerate-image` entry |
| `supabase/functions/generate-content/index.ts` | Remove image generation block and AwsClient import |
| `src/pages/Instructions.tsx` | Remove ImageRow, ImageInstruction type, image-instructions query, and Image Instructions section |
| `src/pages/CreateContent.tsx` | Add optional image file upload with preview |
| `src/components/content/ImageSection.tsx` | Update empty-state text |

## Database migration

```sql
DROP TABLE IF EXISTS public.image_instructions;
```

## Edge function operations

- Redeploy: `generate-content`
- Delete deployed: `regenerate-image`

