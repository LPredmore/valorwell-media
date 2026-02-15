

# Regenerate Image for Existing Content

## What It Does

Creates a new edge function called `regenerate-image` that takes a content ID, reads the already-generated text fields (YouTube title and description), and runs only the image generation pipeline (prompt crafting, image generation, R2 upload, and database update). This will be called once for the existing post (`d09170ac`), and will also be available for future use.

## How It Works

1. A new edge function receives the `contentId`
2. It fetches the existing content row to get `youtube_title` and `youtube_desc`
3. It runs the same image pipeline already in `generate-content`: GPT-4.1 Mini crafts a prompt, GPT-5 Image Mini generates the image, and the result is uploaded to R2
4. It saves the R2 storage path to the `image` column on the content row
5. The frontend already handles displaying images when the `image` column is populated, so no UI changes are needed

## Technical Detail

**New file:** `supabase/functions/regenerate-image/index.ts`

- Accepts `{ contentId }` in the request body
- Authenticates the user via the Authorization header
- Fetches the content row (using user client for RLS)
- Fetches active `image_instructions`
- Calls GPT-4.1 Mini to craft an image prompt from the existing title/description
- Calls GPT-5 Image Mini to generate the image
- Decodes the base64 result and uploads to R2 at `content/{contentId}/cover.png`
- Updates `social_content.image` with the storage path
- Returns success/error

**Updated file:** `supabase/config.toml`

- Add `[functions.regenerate-image]` with `verify_jwt = false` (auth validated in code)

**No UI changes** -- after deploying, I'll invoke the function directly for your existing post to trigger the image generation.

