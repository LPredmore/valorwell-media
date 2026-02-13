

# Add Image Generation to Content Workflow

## Overview

After text content is generated via OpenRouter (Claude Sonnet), the edge function will continue with two more steps:

1. **GPT-4.1 Mini** crafts an optimized image prompt from the generated text + the `image_instructions` table rules
2. **gpt-image-1** generates the actual image from that prompt via OpenRouter

The generated image is uploaded to the existing R2 bucket and the URL is saved to `social_content.image`.

## Workflow Change

The current `generate-content` edge function stops after saving text fields. The new flow:

```text
1. Generate text (Claude Sonnet via OpenRouter)        -- existing
2. Save text fields to DB, set status = 'generating'   -- existing
3. Fetch image_instructions from DB                    -- NEW
4. Call GPT-4.1 Mini to craft an image prompt           -- NEW
5. Call gpt-image-1 to generate the image               -- NEW
6. Upload base64 image to R2                            -- NEW
7. Save image URL to social_content.image               -- NEW
8. Set status = 'complete'                              -- moved to after image step
```

## Technical Details

### Step 3-4: Prompt Generation with GPT-4.1 Mini

- Model: `openai/gpt-4.1-mini` via OpenRouter
- Input: the generated youtube_title + youtube_desc (provides topic context) + active `image_instructions` (aspect ratio, brand tone rules)
- Output via tool calling: a single `image_prompt` string optimized for gpt-image-1
- This intermediate step exists because gpt-image-1 performs significantly better with a well-crafted prompt than with raw content text

### Step 5: Image Generation with gpt-image-1

- Model: `openai/gpt-image-1` via OpenRouter
- Uses `modalities: ["image"]` per OpenRouter's image generation API
- Request includes the crafted prompt from step 4
- Response contains a base64-encoded image in `choices[0].message.images[0].image_url.url`

### Step 6: Upload to R2

- The edge function already has access to R2 credentials (same secrets used by `r2-upload-url`)
- Decode the base64 image, upload directly from the edge function using `aws4fetch` (same library already used in `r2-upload-url`)
- Storage path: `content/{contentId}/cover.png`
- No presigned URL needed -- the edge function uploads server-side

### Step 7: Save Image Reference

- Store the R2 object path in `social_content.image`
- The frontend will need a way to display R2 images (either via a public R2 URL or a signed read URL)

### Files Modified

1. **`supabase/functions/generate-content/index.ts`** -- add steps 3-7 after text generation:
   - Import `aws4fetch` (already available as npm dependency in the project)
   - Fetch `image_instructions` from DB
   - Call GPT-4.1 Mini for prompt crafting
   - Call gpt-image-1 for image generation
   - Upload result to R2
   - Save path to `social_content.image`
   - Move `status = 'complete'` to after image step

2. **`src/pages/ContentDetail.tsx`** -- add an image display section showing the generated cover image (between Video and Generated Content sections)

3. **`src/components/content/VideoSection.tsx`** or a new **`src/components/content/ImageSection.tsx`** -- display the cover image with a "Regenerate Image" option

### Error Handling

- If text generation succeeds but image generation fails, the text is still saved and status is set to `'complete'` with the error logged. The user can see their text content and retry image generation separately.
- This prevents a failed image step from losing successfully generated text.

### Status Flow (unchanged)

```text
new -> uploading -> ready -> generating -> complete
                                       -> error (only if text fails)
```

Image failures are soft -- text is preserved, image field stays null, error is logged but status still goes to `complete`.

