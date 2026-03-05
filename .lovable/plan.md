

## Plan: Update Resend sender to valorwell.org domain

**Single change** in `supabase/functions/generate-content/index.ts`, line 208:

Change `from: "onboarding@resend.dev"` to `from: "Valorwell <info@valorwell.org>"` (or whatever sender name/address you prefer on the valorwell.org domain).

Then redeploy the edge function.

