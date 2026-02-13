
# Update Image Generation Model to GPT-5 Image Mini

## What Changes

Update the model ID in `supabase/functions/generate-content/index.ts` from the broken `openai/gpt-image-1` to `openai/gpt-5-image-mini`.

## Technical Detail

**File:** `supabase/functions/generate-content/index.ts`

Three small changes:

1. **Line 223** - Update the prompt description reference:
   - `"A detailed prompt optimized for gpt-image-1 image generation"` -> `"A detailed prompt optimized for gpt-5-image-mini image generation"`

2. **Line 256** - Update the model ID:
   - `model: "openai/gpt-image-1"` -> `model: "openai/gpt-5-image-mini"`

3. **Line 269** - Update the error message reference:
   - `"No image returned from gpt-image-1"` -> `"No image returned from gpt-5-image-mini"`

No other files need changes. The edge function will be redeployed automatically.
