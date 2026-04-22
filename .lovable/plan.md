

## Plan: Migrate Flurra to a fresh dedicated Supabase backend

### Goal
Move Flurra off the current shared Supabase project (which carries leftover tables from other apps — Valorwell, influencers, donations, Helpscout, ad campaigns, etc.) and onto a brand-new dedicated Lovable Cloud Supabase project that contains **only** what Flurra actually uses. Media stays out (you'll re-upload). Make.com stays out (replaced by n8n later).

### What carries over (keep)

**Tables Flurra actively reads/writes:**
- `profiles`
- `user_roles` + `app_role` enum + `has_role()` function
- `content_ideas` + `video_length` enum
- `social_content` + `post_status` enum
- `posted_content`
- `content_instruction_defaults`
- `user_content_instructions`
- `youtube_connections`
- `playlists`

**Database functions / triggers in active use:**
- `has_role(uuid, app_role)`
- `handle_new_user()` + trigger on `auth.users` (creates profile + assigns 'user' role)
- `seed_user_instructions()` + trigger on `profiles` insert (seeds defaults into `user_content_instructions`)
- `set_updated_at()` + triggers wherever `updated_at` exists
- `auto_promote_incomplete()` + trigger on `social_content` (promotes incomplete → unscheduled)
- `enforce_youtube_schedule_requirements()` + trigger on `social_content` (validation before scheduling)
- `set_youtube_upload_at_and_queue()` + trigger on `social_content` (computes `upload_at`, queues YouTube)
- `sync_youtube_video_id_to_posted()` + trigger (mirrors `youtube_video_id` to `posted_content`)
- `reset_stuck_youtube_uploads()` (utility for stuck uploads)

**Edge functions (all 9 redeploy as-is):**
- `extract-shorts`, `generate-content`, `google-account-info`
- `post-scheduled-content`, `r2-multipart-upload`, `r2-read-url`, `r2-upload-url`
- `youtube-get-access-token`, `youtube-save-connection`

**Storage buckets to recreate empty:**
- `avatars` (public)
- `content-media` (private)

**Secrets actually referenced by edge function code:**
- `OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- `PUBLER_API_KEY`, `PUBLER_WORKSPACE_ID`, `PUBLER_TIKTOK_ACCOUNT_ID`
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_DATA_API_KEY`
- (Auto-injected by Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)

### What gets dropped (NOT migrated)

**Tables (other apps' leftovers):**
`app_activity_events`, `app_bulk_send_logs`, `app_bulk_send_recipients`, `app_bulk_sms_logs`, `app_bulk_sms_recipients`, `app_campaign_enrollments`, `app_campaign_step_logs`, `app_campaign_steps`, `app_campaign_triggers`, `app_campaigns`, `app_email_signatures`, `app_helpscout_settings`, `app_kanban_config`, `app_notes`, `current_competitors`, `donation_attribution`, `givebutter_donations`, `influencer_platforms`, `influencers`, `platform_instructions`, `sm_platforms`, `content_instructions` (old single-row table — superseded by `_defaults` + `user_content_instructions`), `role_options`, `site_config`, `support_session_inquiries`, `therapist_applications`, `youtube_cron_http_log`

**Functions/triggers tied to dropped tables:**
`handle_entity_status_change`, `schedule_first_campaign_step`, `notify_make_youtube_published`, `kick_youtube_run_due` (Fly.io cron kicker — replaced below), `sync_is_competing_on_insert`, `sync_is_competing_on_delete`

**Secrets to drop:**
Make.com (`MAKE_WEBHOOK_URL`), Helpscout (`HELPSCOUT_*`), Google Ads (`GOOGLE_ADS_*`), Givebutter feed (`ADS_FEED_*`), `GOOGLE_OAUTH_*` (separate Google Ads OAuth, distinct from YouTube), `ACTIONS_API_KEY`, plus duplicated `CUSTOM_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` / `PROJECT_URL` (clean Supabase auto-injects what's needed)

**Code to remove from `post-scheduled-content`:** the `MAKE_WEBHOOK_URL` block (you're replacing this with n8n)

### What changes outside Supabase

1. **Fly.io YouTube uploader service** — update its env vars to point at the new Supabase URL + service role key. No code change. You'll do this in the Fly dashboard once.
2. **Cron schedule for `youtube-uploader-service.fly.dev/youtube/run-due`** — currently triggered by `kick_youtube_run_due` (pg_cron + pg_net). On the new project we'll recreate this as a `pg_cron` job that does the same `net.http_post` call (no separate logging table needed unless you want it).
3. **Cron schedule for `post-scheduled-content` edge function** — recreate the 1-minute pg_cron job that calls this edge function.
4. **Google Cloud Console** — add the new Supabase project's `/auth/v1/callback` URL to YouTube OAuth client's authorized redirect URIs.
5. **R2 / Cloudflare** — no change. New project uses same bucket via the same secrets.
6. **getflurra.com / Lovable hosting** — unchanged.

### Step-by-step execution order

```text
PHASE 1 — Provision (you + me)
  1. You enable Lovable Cloud on this project → new Supabase project provisioned
  2. I run ONE consolidated migration creating:
     - enums (app_role, post_status, video_length)
     - 9 tables with full RLS policies (mirrored exactly from current)
     - 9 functions + triggers listed above
     - storage buckets (avatars public, content-media private) + storage policies
  3. I redeploy all 9 edge functions to the new project (automatic on push)

PHASE 2 — Secrets & external wiring (you, guided by me)
  4. You add the 12 runtime secrets above in the new project
  5. You enable pg_cron + pg_net extensions, I add the 2 cron jobs
  6. You update Fly.io service env vars → new SUPABASE_URL + SERVICE_ROLE_KEY
  7. You add new auth callback URL to YouTube OAuth in Google Cloud Console

PHASE 3 — Code cleanup (me)
  8. Remove MAKE_WEBHOOK_URL block from post-scheduled-content
  9. Confirm src/integrations/supabase/client.ts auto-updated to new URL/key
  10. Regenerate src/integrations/supabase/types.ts against new schema

PHASE 4 — Cutover (you)
  11. First admin signs up on new project → I promote them via SQL
  12. Smoke test: create an idea → generate content → upload video →
      schedule → confirm YouTube upload fires → confirm pg_cron runs
  13. Once happy, archive/disconnect the old Supabase project
```

### Honest caveats

1. **All users start fresh.** Auth users don't migrate. You and any test users re-sign up. First signup = manual admin promotion via SQL on the new project.
2. **All content data starts empty.** You said this is fine — confirming.
3. **R2 bucket is shared** between old and new during transition. Old content URLs in the dropped database become orphaned R2 objects; you may want to wipe the bucket separately.
4. **Fly.io service downtime window** = the few minutes between updating its env vars and the new cron firing. Negligible.
5. **n8n integration** from the previous approved plan gets built **on the new project** afterward. The schema for `user_n8n_workflows` + `user_social_credentials` is added in a separate follow-up migration so this migration stays focused on parity.

### What I need from you to start

- Confirm: enable Lovable Cloud on this project (provisions the new Supabase backend)
- Confirm: you'll re-add the 12 runtime secrets and update Fly.io env vars when prompted
- Confirm: you accept losing all current users + content + media references

