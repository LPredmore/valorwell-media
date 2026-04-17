

The Fly.io cutover is done. Per the original phased plan, what remains is **Phase 1c — Open the doors** (public signup) plus the verification steps that confirm the per-user pipeline actually works end-to-end on the new domain.

Here's the recommended order. It's deliberately verification-first because turning on signups before confirming the upload path works would let real users hit broken state.

---

## Step 1 — End-to-end verification (do this first, today)

Before opening signup, prove the per-user path works on a real schedule.

1. **Pre-flight SQL** (Supabase SQL editor):
   ```sql
   SELECT yc.user_id, yc.google_email, yc.channel_title
   FROM youtube_connections yc
   WHERE yc.user_id IN (SELECT user_id FROM user_roles WHERE role='admin');
   ```
   Must return ≥1 row.

2. **Schedule a test post** owned by your admin user for ~5 min from now via `/schedule`.

3. **Watch Fly logs** in PowerShell:
   ```
   fly logs -a youtube-uploader-service
   ```
   Look for the `youtube-get-access-token` call → 200 → upload progress → "uploaded and scheduled".

4. **Confirm** the video lands on **your** channel (the one connected at `/connections`), not the legacy global account.

5. **Check edge function logs** for `youtube-get-access-token` in Supabase to confirm no errors.

If all green → proceed. If anything fails, stop and we debug before opening signup.

---

## Step 2 — Phase 1c: Public signup

Currently `/login` has no link to `/signup`, so even though signup works, no one can find it. Three small UI changes:

| File | Change |
|---|---|
| `src/pages/Login.tsx` | Add "Don't have an account? Sign up" link → `/signup` |
| `src/pages/Signup.tsx` | Confirm "Already have an account? Log in" link exists → `/login` |
| `src/pages/Onboarding.tsx` | Verify it auto-redirects new users to `/connections` so they immediately see the YouTube connect prompt |

Also worth a quick audit:
- **Supabase Auth → Sign Up settings**: confirm "Enable signups" is ON and email confirmation is configured how you want it
- **`enforce_youtube_schedule_requirements` trigger**: confirm it doesn't block new users from creating content rows before they've connected YouTube (the UI guard handles the schedule step, but the trigger could surprise us)

---

## Step 3 — Post-cutover cleanup (1 week out, after multiple successful per-user uploads)

- Delete `GOOGLE_OAUTH_REFRESH_TOKEN` from Supabase Edge Function secrets
- Unset `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` on Fly (no longer used by the uploader — they live in the Lovable edge function now)
- Drop the legacy `content_instructions` table if unused (out of scope for 1c, listed in original plan)

---

## What I'd build now (after you confirm Step 1 verification passes)

Just Step 2 — the signup link + onboarding flow audit. It's a small, contained change. Roughly 3 files touched, no DB migration, no edge function changes.

Want me to proceed with Step 2 once you've completed the Step 1 verification, or do you want to tackle something else first?

