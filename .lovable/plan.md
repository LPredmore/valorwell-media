

## Plan: Pure Upload-Post architecture, multi-tenant (1 user = 1 tenant = 1 Upload-Post profile)

### What this is

Every Flurra signup automatically gets their own Upload-Post profile created via API. That profile holds their connected social accounts (TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest). All posting goes through Upload-Post — no Fly.io, no per-user Google OAuth, no Publer, no Make.com.

### What gets deleted

**Edge functions (5 removed):**
- `youtube-save-connection`
- `youtube-get-access-token`
- `google-account-info`
- `extract-shorts` (kept — unrelated to posting)
- Old `post-scheduled-content` body (rewritten in place)

**Database tables/columns:**
- DROP `youtube_connections` table entirely
- DROP from `social_content` and `posted_content`: `youtube_status`, `youtube_uploaded_at`, `youtube_error_detail`, `youtube_video_id`, `tiktok_status`, `tiktok_error`, `tiktok_job_id`, `upload_at`, `youtube_comment_*` (all comment fields)
- DROP triggers/functions: `set_youtube_upload_at_and_queue()`, `sync_youtube_video_id_to_posted()`, `reset_stuck_youtube_uploads()`
- RENAME `enforce_youtube_schedule_requirements()` → `enforce_schedule_requirements()` with simpler rules (just video + title + post_length required)

**Secrets removed:** `PUBLER_API_KEY`, `PUBLER_WORKSPACE_ID`, `PUBLER_TIKTOK_ACCOUNT_ID`

**External services:** Delete the Fly.io app + Google Cloud OAuth client (manual, by you, after validation)

**Auth changes:** Remove "Sign in with Google" from Login/Signup — pure email/password only (since Google sign-in's only purpose was the YouTube OAuth piggyback)

**Existing data:** Wipe all rows in `profiles`, `user_roles`, `social_content`, `posted_content`, `content_ideas`, `user_content_instructions`, `youtube_connections`. Auth users wiped via Lovable Cloud user management.

### What gets added

**1 new secret:** `UPLOAD_POST_API_KEY`

**1 new database table:**
```text
upload_post_profiles
  user_id              uuid PK FK auth.users
  username             text UNIQUE  (= 'flurra_' || short_uuid, sent to Upload-Post)
  connected_platforms  jsonb        (cached: {tiktok:{...}, instagram:{...}, youtube:{...}, ...})
  last_synced_at       timestamptz
  created_at           timestamptz
```

**2 new columns on `social_content`:**
- `upload_post_request_id` text
- `upload_post_results` jsonb — per-platform `{tiktok: {status, post_url, error}, instagram: {...}}`
- `upload_post_status` text — overall: `pending` | `uploading` | `partial` | `success` | `failed`

**Same 3 columns mirrored on `posted_content`** for archive

**6 new edge functions:**

| Function | Purpose |
|---|---|
| `upload-post-create-profile` | Called from `handle_new_user` flow on signup. Creates Upload-Post profile via `POST /api/uploadposts/users`, inserts row in `upload_post_profiles`. Returns error if profile slots exhausted. |
| `upload-post-generate-link` | Called when user clicks "Connect [Platform]". Generates JWT URL via `POST /api/uploadposts/users/generate-jwt` with redirect back to `/settings?tab=connections&synced=1`. |
| `upload-post-sync-profile` | Polls `GET /api/uploadposts/users/{username}` and updates `connected_platforms` cache. Called on Connections page load and after redirect. |
| `upload-post-submit` | New posting function. Takes `social_content.id`, fetches R2 signed URL, calls `POST /api/upload` with multipart form for selected platforms, stores `request_id` + `upload_post_status='uploading'`. |
| `upload-post-status-poll` | Cron-driven (every 2 min). Finds `social_content` where `upload_post_status='uploading'`, calls Upload-Post status endpoint, updates per-platform results, archives to `posted_content` when all platforms complete. |
| `post-scheduled-content` | Rewritten: cron-driven (every 1 min). Finds rows where `scheduled_at <= now()` and `status='scheduled'`, invokes `upload-post-submit` for each. |

**Trigger update:** `handle_new_user()` extended to also enqueue Upload-Post profile creation (via `pg_net` async call to `upload-post-create-profile`, so signup never blocks on Upload-Post latency). If creation fails, profile row gets a `provisioning_error` and user sees a banner asking them to retry.

### Connections UI rewrite

`src/components/settings/ConnectionsView.tsx` becomes:

- Header: "Connect your social accounts" with `connected_platforms` synced status
- Grid of 8 platform cards (TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest)
- Each card shows: platform icon, connection status (Connected ✅ with handle / Not connected), action button
- "Connect [Platform]" button → calls `upload-post-generate-link` → opens Upload-Post hosted OAuth in new tab (Flurra branding) → on return, auto-syncs
- "Refresh" button → calls `upload-post-sync-profile`
- "Disconnect" → calls Upload-Post disconnect endpoint per platform

### Schedule/Content UI updates

- Remove all references to `youtube_status`, `tiktok_status`, `youtube_video_id` from list/detail views
- Replace with single `upload_post_status` badge + per-platform mini-status row (TT ✅ IG ⏳ YT ❌)
- Remove "Retry YouTube upload" action; replace with "Retry post" that re-invokes `upload-post-submit`
- Schedule dialog: replace "platforms" checkboxes with checkboxes that map to user's actually-connected platforms (read from `upload_post_profiles.connected_platforms`)

### Order of execution

```text
PHASE 0 — You provide
  1. UPLOAD_POST_API_KEY (when I prompt)

PHASE 1 — Wipe + schema
  2. Wipe data from all 9 tables + auth users
  3. Migration: create upload_post_profiles, add 3 columns to social_content
     + posted_content, drop youtube_connections + obsolete columns + triggers
  4. Update handle_new_user trigger
  5. Drop PUBLER_* secrets

PHASE 2 — Edge functions
  6. Build the 6 new/rewritten functions above
  7. Create pg_cron jobs: post-scheduled-content (1 min), upload-post-status-poll (2 min)

PHASE 3 — UI
  8. Rewrite ConnectionsView.tsx (no Google OAuth code anywhere)
  9. Strip Google sign-in from Login.tsx + Signup.tsx
  10. Delete src/pages/Connections.tsx redirect
  11. Update Schedule tabs + ContentDetail to use upload_post_status
  12. Update ScheduleDialog platform selector

PHASE 4 — Validation
  13. You sign up fresh → tenant + Upload-Post profile auto-created
  14. You connect TikTok → verify hosted flow + redirect + cache sync
  15. We post one real test video end-to-end
  16. Once green: you delete Fly.io app + Google Cloud OAuth client
```

### Honest caveats

1. **Profile slot exhaustion is a hard ceiling.** When Upload-Post returns `PROFILE_LIMIT_REACHED`, signup fails for that user. UI will show: "We're at capacity — please contact support." You'll get an email alert so you can buy more slots. Acceptable for an admin-managed beta; would need a Stripe paywall before public launch.
2. **Profile creation is async.** If `upload-post-create-profile` fails after signup (network blip), the user lands in a "provisioning" state with a retry button. They can't post until provisioned.
3. **YouTube via Upload-Post may still be in audit.** I'll surface a "Pending Upload-Post audit" badge on the YouTube card if their API returns that flag, instead of pretending it works.
4. **No password protection on Upload-Post hosted OAuth pages.** The hosted connect flow opens in a new tab — anyone with that link could attempt to attach an account. We'll generate single-use JWTs with short TTL (Upload-Post supports this) and only generate them server-side after auth check.
5. **All existing users + content are wiped.** Confirmed.

### What I need from you to start

- `UPLOAD_POST_API_KEY` ready to paste when prompted

