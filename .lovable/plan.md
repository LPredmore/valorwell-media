

## Plan: Native YouTube connection (parallel path to Upload-Post)

We're going to build a fully native YouTube posting path that lives **alongside** Upload-Post — not replacing it yet. Upload-Post still handles LinkedIn, Meta, X, TikTok. YouTube becomes ours. This way, if YouTube starts working perfectly via native, we expand from there. If we hit a snag, Upload-Post is still there as a fallback.

### How the native YouTube path will work

1. User goes to **Settings → Connections** and sees a new **"YouTube (Native)"** card alongside the existing Upload-Post YouTube card.
2. They click **Connect** → standard Google OAuth popup → grants `youtube.upload` scope to *their own* Google account.
3. We store their refresh token (encrypted at rest, server-side only) in a new `youtube_connections` table keyed on `user_id`.
4. When they schedule/post a video for YouTube, our backend uses **their** refresh token to mint a fresh access token, then streams the R2 video file directly to the YouTube Data API v3 (`videos.insert` with resumable upload).
5. Status, video ID, and any error get written back to the content row.

### Why a Fly.io worker (not just an edge function)

YouTube's resumable upload streams the full video file. Edge functions have a hard limit (CPU time + memory + payload) that breaks for the 5GB / 1hr files Flurra supports. Same reason we used Fly.io before. The Fly worker:
- Pulls a signed R2 URL for the video
- Streams it to YouTube's resumable upload endpoint
- Posts back the result to a Supabase edge function which writes to the DB

### Architecture

```text
[Browser]
   │  Click "Connect YouTube (Native)"
   ▼
[Google OAuth popup]
   │  authorization_code
   ▼
[Edge Fn: youtube-oauth-callback]
   │  exchange code → refresh_token + access_token
   │  store encrypted in youtube_connections
   ▼
[DB: youtube_connections]

──── Posting flow ────

[Cron: post-scheduled-content] (existing, every 1 min)
   │  finds row with status=scheduled, platforms includes "youtube_native"
   ▼
[Edge Fn: youtube-native-submit]
   │  signs R2 URL, mints access_token from refresh_token
   │  enqueues job to Fly worker
   ▼
[Fly.io worker: youtube-uploader]
   │  streams R2 → YouTube resumable upload
   │  writes back via [Edge Fn: youtube-native-callback]
   ▼
[DB: social_content.youtube_native_status / video_id]
```

### Data model (new + restored)

**New table `youtube_connections`** (per user, RLS enforced):
- `user_id` (uuid, FK to auth.users, unique)
- `google_account_email` (text)
- `channel_id` (text)
- `channel_title` (text)
- `refresh_token_encrypted` (text — encrypted with `pgsodium` or app-side AES; never exposed to client)
- `access_token` (text, short-lived cache)
- `access_token_expires_at` (timestamptz)
- `scopes` (text[])
- `connected_at`, `updated_at`

**Restored columns on `social_content` and `posted_content`**:
- `youtube_native_status` enum (`pending` | `uploading` | `success` | `failed`)
- `youtube_native_video_id` text
- `youtube_native_uploaded_at` timestamptz
- `youtube_native_error_detail` text

We're naming them `youtube_native_*` so they don't collide with the legacy `youtube_*` cleanup the Upload-Post migration did.

### Edge functions (new)

1. **`youtube-native-oauth-start`** — generates Google OAuth URL with state token, returns to client
2. **`youtube-native-oauth-callback`** — exchanges code for tokens, fetches channel info, stores encrypted refresh token
3. **`youtube-native-submit`** — called from `post-scheduled-content` cron; signs R2 URL, mints fresh access token, enqueues Fly job
4. **`youtube-native-callback`** — Fly worker calls this with upload result; updates `social_content` row
5. **`youtube-native-disconnect`** — revokes token at Google + clears row

### Fly.io worker (new repo / app)

Standalone Node service:
- `POST /upload` endpoint accepting `{ access_token, r2_signed_url, title, description, privacy, tags, callback_url, callback_token }`
- Streams R2 → YouTube resumable upload via `googleapis` SDK
- Posts result back to `youtube-native-callback`
- Includes retry/backoff on quota errors

### UI changes

**`src/components/settings/ConnectionsView.tsx`**:
- Add a new section header **"Native connections (beta)"** above the existing Upload-Post grid
- Render a YouTube card there with native connect button, channel handle when connected, disconnect option
- Existing Upload-Post YouTube card stays — gets a small subtitle: "via Upload-Post" so users know the difference

**`src/components/schedule/ScheduleDialog.tsx`**:
- When user picks YouTube as a target, show a small toggle: **"Post via Native YouTube" (default ON if connected)** vs **"Post via Upload-Post"**
- The chosen path is recorded on the content row (`youtube_via: 'native' | 'upload_post'`)

### Secrets needed

- `GOOGLE_OAUTH_CLIENT_ID` (you'll need to create OAuth credentials in Google Cloud Console — I'll walk you through it)
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_NATIVE_FLY_WORKER_URL` + `YOUTUBE_NATIVE_FLY_WORKER_TOKEN` (added once Fly app is deployed)
- `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY` (32-byte key for encrypting refresh tokens at rest)

### Order of work

1. Set up Google Cloud OAuth credentials + add secrets (manual step you'll do, I'll guide)
2. DB migration: new table + new columns
3. Edge functions for OAuth flow (no Fly dependency yet)
4. Wire up Connections UI for the OAuth flow — test that we can connect/disconnect and see channel info
5. Build the Fly.io worker (separate repo/deploy)
6. Edge functions for submit/callback + cron integration
7. ScheduleDialog toggle + end-to-end test

We can stop after step 4 to verify the connection flow before investing in the upload pipeline.

### What we are NOT doing

- Not removing Upload-Post
- Not touching LinkedIn/Meta/X/TikTok flows
- Not migrating existing scheduled YouTube posts — they'll continue via Upload-Post until the user manually re-routes them

### Files touched

**New:**
- `supabase/migrations/<timestamp>_youtube_native.sql`
- `supabase/functions/youtube-native-oauth-start/index.ts`
- `supabase/functions/youtube-native-oauth-callback/index.ts`
- `supabase/functions/youtube-native-submit/index.ts`
- `supabase/functions/youtube-native-callback/index.ts`
- `supabase/functions/youtube-native-disconnect/index.ts`
- `src/hooks/useYoutubeNativeConnection.ts`
- Fly worker repo (separate)

**Modified:**
- `src/components/settings/ConnectionsView.tsx` — add Native section
- `src/components/schedule/ScheduleDialog.tsx` — add path toggle
- `supabase/functions/post-scheduled-content/index.ts` — route to native vs upload-post

