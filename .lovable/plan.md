# Make Native YouTube Posting Fully Functional — Complete Plan

## Where we are right now

- Lovable side is done: `youtube-native-oauth-start/callback`, `youtube-native-submit`, `youtube-native-callback` all exist and the cron (`post-scheduled-content`) routes scheduled YouTube posts to the native path correctly.
- Lovable signs an HMAC payload and `POST`s to `https://youtube-uploader-service.fly.dev/upload-youtube` with the user's Google `refresh_token` *not* included — only `user_id`, the signed R2 video URL, title, description, and a `callback_url`.
- The Fly app is **alive** (`GET /health` → 200) but `POST /upload-youtube` returns **404**. The route doesn't exist.
- So: every scheduled native YouTube post fires, the cron picks it up, the edge function dispatches, Fly says "no such route", row gets stamped `youtube_native_status = failed`, nothing is uploaded.

The plan has 4 parts. Parts 1–2 are required. Parts 3–4 are small polish/hardening.

---

## Part 1 — Build & deploy the Fly.io worker (the only real missing piece)

This is the bulk of the work. We need a small Node/Express service on `youtube-uploader-service.fly.dev` that:

1. Accepts `POST /upload-youtube` with HMAC-signed JSON from our edge function.
2. Looks up the user's encrypted Google refresh token in the database.
3. Exchanges it for a fresh access token at Google.
4. Streams the R2-signed video URL → YouTube Resumable Upload API.
5. (Optionally) sets a custom thumbnail.
6. POSTs the result back to `youtube-native-callback` with the same HMAC scheme.

### 1a. Repo layout (new repo, e.g. `flurra-youtube-worker`)

```text
flurra-youtube-worker/
├── package.json
├── fly.toml
├── Dockerfile
├── .dockerignore
└── src/
    ├── index.ts            # Express app, routes
    ├── config.ts           # env loading & validation
    ├── auth.ts             # HMAC verify (incoming) + sign (outgoing)
    ├── supabase.ts         # service-role client
    ├── crypto.ts           # AES-GCM decrypt for refresh_token (must match edge fn)
    ├── google.ts           # refresh access token, channels.list (sanity)
    ├── youtube.ts          # resumable upload + thumbnail set
    └── jobs.ts             # the upload pipeline (orchestrator)
```

### 1b. Endpoints the worker must expose

- `GET  /health` — already returning 200, keep it.
- `POST /upload-youtube` — main entry point. Accepts the JSON payload our edge function already sends (see `youtube-native-submit/index.ts` lines ~115–130):
  ```json
  {
    "content_id": "uuid",
    "user_id": "uuid",
    "video_url": "https://r2-signed-url...",
    "thumbnail_url": "https://r2-signed-url..." | null,
    "title": "string",
    "description": "string",
    "tags": [],
    "privacy": "public",
    "callback_url": "https://<project>.supabase.co/functions/v1/youtube-native-callback",
    "issued_at": 1730000000000
  }
  ```
  Must verify header `X-Flurra-Signature` = `base64(HMAC_SHA256(FLY_WORKER_HMAC_SECRET, rawBody))`.
  Returns **202 Accepted** immediately (so the edge function isn't blocked for minutes); does the actual upload async and pings the callback when done. Reject if `issued_at` is older than ~10 minutes (replay protection) or signature mismatches.

### 1c. The upload pipeline (per job)

1. **Verify HMAC** on raw body. Reject 401 if invalid.
2. **Look up `youtube_connections` row** for `user_id` (service-role Supabase client) → get `refresh_token_encrypted`. If missing, callback with `status: "failed", error_detail: "no_connection"` and return.
3. **Decrypt the refresh token** using AES-GCM with `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY`. Format must match what the edge function wrote: `iv (12 bytes) || ciphertext`, base64-encoded, key = `SHA-256(secret)`.
4. **Refresh Google access token** via `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`. Handle `invalid_grant` → callback with `error_detail: "google_reauth_required"`.
5. **Stream the video to YouTube Resumable Upload**:
   - `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with the access token. Body = the snippet+status JSON (title, description, tags, categoryId `22` default, `privacyStatus: "public"`, `selfDeclaredMadeForKids: false`).
   - Read the `Location` header from the response — that's the upload session URL.
   - `fetch(video_url)` → get a readable stream → `PUT` it to the upload session URL with `Content-Type: video/*` and `Content-Length` (use the R2 `HEAD` response or just stream with `Transfer-Encoding: chunked` if YouTube allows; safer is to do a HEAD first to get size).
   - On success YouTube returns the video resource with `id`.
6. **Set thumbnail (if provided)**: `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=<id>` with the JPEG/PNG bytes streamed from `thumbnail_url`. Non-fatal — log if it fails but don't fail the whole job.
7. **Callback to Lovable** at `callback_url` with HMAC-signed body:
   ```json
   { "content_id": "...", "status": "success", "video_id": "abc123" }
   ```
   or on failure:
   ```json
   { "content_id": "...", "status": "failed", "error_detail": "<message>" }
   ```
   Header `X-Flurra-Signature: base64(HMAC_SHA256(secret, rawBody))`.
   Retry the callback up to 3 times with backoff in case the edge function is cold.

### 1d. Environment (Fly secrets)

Set on the Fly app via `fly secrets set ...`:

| Name | Value | Where it comes from |
|---|---|---|
| `SUPABASE_URL` | `https://fjyhehtzryybbpuxqqdo.supabase.co` | already known |
| `SUPABASE_SERVICE_ROLE_KEY` | (copy from Lovable Cloud secrets) | Cloud → Backend → Secrets |
| `GOOGLE_OAUTH_CLIENT_ID` | (copy from Lovable secrets) | same |
| `GOOGLE_OAUTH_CLIENT_SECRET` | (copy from Lovable secrets) | same |
| `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY` | (copy from Lovable secrets) | **must match exactly**, otherwise we can't decrypt |
| `FLY_WORKER_HMAC_SECRET` | (copy from Lovable secrets) | **must match exactly** |
| `PORT` | `8080` | for Fly default |

No new Lovable-side secrets are required — everything already exists in Cloud.

### 1e. Fly config (`fly.toml`)

Standard Node app on the existing `youtube-uploader-service` app. Important bits:
- `[http_service]` `internal_port = 8080`, `force_https = true`, `auto_start_machines = true`, `auto_stop_machines = "stop"`, `min_machines_running = 0`.
- VM size: at least 512MB RAM, 1 shared CPU. YouTube uploads stream, so memory stays low even for big videos.
- Single region (the one closest to R2). One machine is fine; uploads are I/O-bound.

### 1f. Concurrency & safety

- Process one job per request; do *not* try to run a queue inside the worker yet. Lovable's cron is the queue.
- Add an in-memory `Set<content_id>` with a 30-min TTL so the same content_id can't be processed twice if the cron retries during a long upload.
- Wrap the whole pipeline in a try/catch that always sends a callback (success or failure) so rows never get stuck in `uploading`.

### 1g. Deployment

`fly deploy` from the repo. After deploy:
- `curl https://youtube-uploader-service.fly.dev/health` → 200
- Manual smoke test by re-running a failed scheduled post (Part 4).

---

## Part 2 — Lovable-side fixes (small, but needed)

These are real issues I found while reading the existing edge functions. Do them in the same change as the worker rollout.

### 2a. Pass everything the worker needs in the job payload

`supabase/functions/youtube-native-submit/index.ts` currently sends only the basics. Update the `job` object (around lines 117–129) to also include:

- `category_id`: default `"22"` (People & Blogs). Lets us change later without redeploying Fly.
- `privacy_status`: pull from `row.youtube_privacy` if you want a column for it later; for now hardcode `"public"`.
- `made_for_kids`: `false`.
- `tags`: parse from `row.youtube_tags` if it exists, else `[]`.

The current fields (`content_id`, `user_id`, `video_url`, `thumbnail_url`, `title`, `description`, `callback_url`, `issued_at`) stay as-is.

### 2b. Use the right title/description fallbacks

Currently:
```ts
title: row.post_title || row.topic || "Untitled",
description: row.youtube_desc || row.post_title || "",
```
Add the YouTube-specific title column path: `row.youtube_title || row.post_title || row.topic || "Untitled"` (the table already has `youtube_title` in `posted_content`; mirror it in `social_content` if it isn't there yet — quick check during build).

### 2c. Don't mark `failed` when we just dispatched

Right now `youtube-native-submit` marks `youtube_native_status = "uploading"` *before* the POST and then on a 404 stamps `"failed"`. Good. But the function returns **HTTP 200** on a Fly rejection (line ~155), which makes the cron think the dispatch succeeded. Change that branch to return a non-200 so the cron's `or("upload_post_status.is.null,upload_post_status.eq.failed")` filter can pick it up next minute. Also clear `youtube_native_status` back to `null` (not `"failed"`) on dispatch failure, so the next cron tick will retry it. A "real" failed status should only come from the worker's callback.

### 2d. Add a manual "Retry YouTube native" action

Mirror `useRetryUploadPost` in `src/hooks/useSchedule.ts` with a `useRetryYoutubeNative` that resets `youtube_native_status`, `youtube_native_error_detail`, `youtube_native_video_id` to `null` and calls `youtube-native-submit` directly. Wire a button into `ScheduledTab` / content detail when `youtube_native_status = "failed"`.

### 2e. Make sure scheduled archive picks native YouTube up

`upload-post-status-poll` is what archives finished posts to `posted_content`. Confirm it also archives rows where the *only* platform is native YouTube and `youtube_native_status = "success"`. If it doesn't (likely doesn't, since it's named for upload-post), add a parallel sweep in the same cron, or add a second tiny function `youtube-native-archive-poll` that:

- Selects `social_content` where `scheduled_platforms = ['youtube']` AND `youtube_via = 'native'` AND `youtube_native_status = 'success'` AND `posted_at IS NULL`
- Inserts into `posted_content`, sets `posted_at`, and deletes from `social_content`.

Schedule it via `pg_cron` every 1 min (same pattern as the others).

---

## Part 3 — Database polish (optional but cheap)

Add columns we already reference but that aren't in the schema:

```sql
ALTER TABLE social_content
  ADD COLUMN IF NOT EXISTS youtube_title text,
  ADD COLUMN IF NOT EXISTS youtube_tags text[],
  ADD COLUMN IF NOT EXISTS youtube_privacy text DEFAULT 'public';
```

Mirror on `posted_content` for archival parity. None are required to ship — defaults work.

---

## Part 4 — Verification (after deploy)

Do these in order. Stop at the first failure and fix.

1. **Worker reachable**: `curl https://youtube-uploader-service.fly.dev/health` → 200.
2. **HMAC handshake**: from the edge function logs, after a manual schedule, look for `Fly worker rejected job: 401` (signature mismatch — secrets out of sync) vs `200/202` (good).
3. **Token refresh path**: temporarily log (and then remove) the result of the Google token refresh in the worker; should see `"access_token": "..."` for `info+pendulo@bestselfs.com`.
4. **Resumable upload**: schedule a *short* test video for `now + 2 min` on that account. Watch:
   - `social_content.youtube_native_status` flips `null → uploading → success`
   - `social_content.youtube_native_video_id` populates with an 11-char ID
   - The video appears on the YouTube channel as Public
5. **Thumbnail**: confirm the `image` column's R2 file becomes the YouTube thumbnail. If it doesn't, check worker logs — non-fatal but worth confirming.
6. **Archive**: 1 minute after success, the row should move from `social_content` to `posted_content` (Part 2e).
7. **Failure path**: temporarily revoke the Google connection at myaccount.google.com → schedule another → `youtube_native_status` should land on `failed` with `error_detail = "google_reauth_required"`. Then reconnect from Settings → Connections.

---

## Order of operations (what I'll do, in order, after you approve)

1. **Lovable side first** (parts 2a–2c, 2e, optional 3) — small edits + one new mini cron function. Safe to ship even before the worker exists; it just means dispatches will keep retrying cleanly.
2. **Build the Fly worker repo** (Part 1). I'll write the full Express app for you and walk through `fly secrets set` + `fly deploy`. You'll need to run those commands yourself (Fly auth lives on your machine).
3. **End-to-end smoke test** (Part 4) on `info+pendulo@bestselfs.com`.
4. **Add the retry button** (Part 2d) once the happy path is verified.

---

## What I need from you before starting

Just confirm:

1. The Fly app `youtube-uploader-service` is yours and you can `fly deploy` to it (or you want me to scaffold a brand-new app name).
2. You're OK with me writing the worker as **Node + Express + TypeScript** (matches what the 404 page already suggests is running there). If you'd rather have Python/FastAPI, say so now.
3. Default privacy = `public` and category = `People & Blogs (22)` for now — fine, or do you want a different default?

Once you say go, I'll start with Lovable-side edits and produce the full Fly worker source in this same conversation so you can paste-and-deploy.
