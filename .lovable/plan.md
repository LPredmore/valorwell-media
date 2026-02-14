

# Switch Image Generation Model to FLUX.2 Pro

## Overview
Replace `openai/gpt-5-image-mini` with `black-forest-labs/flux.2-pro` for cover image generation in both edge functions. The API format is identical on OpenRouter (same endpoint, same `modalities: ["image"]` parameter, same response structure).

## Verified
- `black-forest-labs/flux.2-pro` exists on OpenRouter at https://openrouter.ai/black-forest-labs/flux.2-pro
- Uses the same `/v1/chat/completions` endpoint with `modalities: ["image"]`
- Returns images in the same `message.images` array format

## Changes

### 1. `supabase/functions/generate-content/index.ts`
- Line 205: Update prompt crafting system message to reference FLUX.2 Pro instead of gpt-image-1
- Line 223: Update tool parameter description to reference FLUX.2 Pro
- Line 256: Change model from `openai/gpt-5-image-mini` to `black-forest-labs/flux.2-pro`
- Line 269: Update error message to reference FLUX.2 Pro

### 2. `supabase/functions/regenerate-image/index.ts`
- Line 107: Update tool parameter description to reference FLUX.2 Pro
- Line 140: Change model from `openai/gpt-5-image-mini` to `black-forest-labs/flux.2-pro`
- Line 153: Update error message to reference FLUX.2 Pro

### 3. Deploy
- Redeploy both `generate-content` and `regenerate-image` edge functions

## No other changes needed
The request/response format is identical, so the base64 image extraction and R2 upload logic remains unchanged.

