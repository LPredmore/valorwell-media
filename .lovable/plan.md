

## Plan: Email script via Resend after generation

After Step 1 (script generation) succeeds and the script is saved to the DB, send an email using the Resend API (key already in Supabase secrets as `RESEND_API_KEY`).

### What changes

**File: `supabase/functions/generate-content/index.ts`**

Add a helper function `sendScriptEmail` that calls the Resend API (`https://api.resend.com/emails`) with:
- **From**: `onboarding@resend.dev` (or a verified domain sender if available — Resend requires a verified sender; the default sandbox sender works for sending to `info@valorwell.org`)
- **To**: `info@valorwell.org`
- **Subject**: `{postLength} - {postTitle}` (e.g. "Long - Why CHAMPVA Matters")
- **Body** (plain text): The generated script

Since `post_title` is not known until Step 2 completes, the email will be sent after Step 2 (social copy generation) succeeds, so both `post_title` and `script` are available.

The call is fire-and-forget with error logging — a failed email will not block or fail the content generation pipeline. The function reads `RESEND_API_KEY` from `Deno.env.get()`.

### Insertion point

Right after the Step 2 success log (line ~364), before the final success response (line 377). This ensures both `script` and `generated.post_title` are available.

### No other files change

This is entirely within the edge function.

