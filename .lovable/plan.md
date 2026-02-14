

# Replace AI Image Generation with Manual Cover Image Upload

## Overview
Remove all AI-powered image generation code and replace it with an optional cover image upload field on the Create Content page. The cover image will be uploaded to R2 (same as videos) and displayed on the Content Detail page.

## What gets removed

### 1. Delete the `regenerate-image` edge function entirely
- `supabase/functions/regenerate-image/index.ts` -- the entire function is solely for AI image regeneration

### 2. Remove image generation from `generate-content` edge function
- Remove the entire "Step 2: Image generation" block (lines 180-310) -- this is the GPT-4.1 Mini prompt crafting + FLUX.2 Pro image generation + R2 upload
- Remove the `AwsClient` import (line 2) since it's only used for image upload to R2
- After saving text fields, go straight to setting status to "complete"

### 3. Remove Image Instructions from the Instructions page
- `src/pages/Instructions.tsx`: Remove the `ImageRow` component, the `ImageInstruction` type, the `image-instructions` query, and the "Image Instructions" section from the JSX

## What gets added

### 4. Add optional cover image upload to `src/pages/CreateContent.tsx`
- Add an image file state (`imageFile`) and a preview URL
- Add a drag-and-drop image upload area (similar pattern to `VideoUploader` but accepting `image/*`)
- Mark it as "(Optional)" in the label
- On submit, if an image file is provided, upload it to R2 at `content/{contentId}/cover.png` using the existing `uploadVideoToR2` helper (which works for any file type -- it just gets a presigned URL and uploads via tus/PUT)
- Save the R2 storage path to the `image` column on the `social_content` row

### 5. Update `src/pages/ContentDetail.tsx`
- The `ImageSection` component already displays the cover image from R2 -- no changes needed there
- Remove or hide any "Regenerate" button references that trigger image regeneration (the current Regenerate button regenerates ALL content including image, which is fine to keep for text -- it just won't regenerate images anymore)

### 6. Update `src/components/content/ImageSection.tsx`
- Change the "No image generated yet" text to "No cover image" since images are now manually uploaded

## What stays the same
- The `image` column on `social_content` continues to store the R2 path
- The `ImageSection` component continues to fetch and display the image via `r2-read-url`
- The `ImageLightbox` component stays as-is
- Video upload flow is unchanged

## Technical Details

### CreateContent.tsx image upload flow:
1. User optionally selects/drops an image file
2. Show a thumbnail preview of the selected image
3. On form submit, after creating the content row and uploading the video:
   - Get a presigned upload URL from `r2-upload-url` for path `content/{contentId}/cover.{ext}`
   - Upload the image file to R2
   - Update the `social_content` row with `image: storagePath`
4. Then call `generate-content` for text generation as before

### generate-content edge function (simplified):
- Generate text with Claude Sonnet (unchanged)
- Save text fields (unchanged)
- Set status to "complete" (no more image step in between)
- The `AwsClient` import can be removed since R2 upload is no longer done server-side

### Files modified:
- `src/pages/CreateContent.tsx` -- add optional image upload field
- `src/components/content/ImageSection.tsx` -- update empty state text
- `src/pages/Instructions.tsx` -- remove Image Instructions section
- `supabase/functions/generate-content/index.ts` -- remove image generation block and AwsClient import

### Files deleted:
- `supabase/functions/regenerate-image/index.ts` -- entire function removed

### Edge function deployment:
- Redeploy `generate-content`
- Delete deployed `regenerate-image` function

