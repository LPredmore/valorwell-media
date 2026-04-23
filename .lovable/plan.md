

## Next: add secrets, then run DB migration + build OAuth flow

You have the three values. I'll request them via the secure secret form, then proceed.

### Step 2a — Request secrets (immediately on approval)

Pop the secure form for these three secret names:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY`

You paste the values, they get stored as runtime secrets accessible to edge functions only — never exposed to the browser.

### Step 2b — Database migration

Create `supabase/migrations/<timestamp>_youtube_native.sql`:

- New table `public.youtube_connections`:
  - `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
  - `google_account_email text`
  - `channel_id text`
  - `channel_title text`
  - `channel_handle text`
  - `refresh_token_encrypted text NOT NULL` (AES-GCM ciphertext, base64)
  - `access_token text` · `access_token_expires_at timestamptz` (short-lived cache)
  - `scopes text[] NOT NULL DEFAULT '{}'`
  - `connected_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()` (with `set_updated_at` trigger)
- Enable RLS. Policies:
  - Users can `SELECT` their own row (so the UI can show channel name/handle/connected status — no token columns exposed via a view, see below)
  - No `INSERT`/`UPDATE`/`DELETE` from clients — only edge functions (service role) write
  - Admins full access via `has_role(auth.uid(), 'admin')`
- Create a safe view `public.youtube_connections_public` exposing only `user_id, google_account_email, channel_title, channel_handle, channel_id, scopes, connected_at, updated_at` — the UI reads from this so refresh tokens are never selectable client-side.
- New columns on `social_content` and `posted_content`:
  - `youtube_native_status text` (values: `pending` | `uploading` | `success` | `failed`)
  - `youtube_native_video_id text`
  - `youtube_native_uploaded_at timestamptz`
  - `youtube_native_error_detail text`
  - `youtube_via text` — `'native'` or `'upload_post'`, default `null`

### Step 3 — OAuth edge functions

Three new functions, all with `verify_jwt = false` (validated in code):

1. **`youtube-native-oauth-start`** — POST. Authenticated. Generates a short-lived signed `state` token (JWT signed with `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY` derivative, includes `user_id` + nonce + 10-min expiry). Returns the Google OAuth URL with `access_type=offline`, `prompt=consent` (forces refresh token), scopes for `youtube.upload` + `youtube.readonly` + email/profile, and the `state` value.

2. **`youtube-native-oauth-callback`** — GET. Public. Receives `code` + `state` from Google's redirect. Verifies state token, exchanges code for tokens, calls YouTube `channels.list?mine=true` to get channel id/title/handle and userinfo for email. Encrypts refresh token with AES-GCM using `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY`. Upserts into `youtube_connections`. Returns a small HTML page that posts a message to the opener (`{type: 'youtube_connected'}`) and closes itself.

3. **`youtube-native-disconnect`** — POST. Authenticated. Revokes refresh token at `https://oauth2.googleapis.com/revoke`, deletes the row.

Add these blocks to `supabase/config.toml`:
```toml
[functions.youtube-native-oauth-start]
verify_jwt = false

[functions.youtube-native-oauth-callback]
verify_jwt = false

[functions.youtube-native-disconnect]
verify_jwt = false
```

### Step 4 — Wire up the Connections UI

- New hook `src/hooks/useYoutubeNativeConnection.ts` — reads from `youtube_connections_public` view, exposes `connect()` (calls oauth-start, opens popup, listens for `youtube_connected` postMessage) and `disconnect()`.
- `src/components/settings/ConnectionsView.tsx`:
  - Add a new section header **"Native connections (beta)"** above the existing Upload-Post grid.
  - Render a YouTube card showing channel handle + email when connected, "Connect YouTube" button when not.
  - Add subtitle "via Upload-Post" to the existing Upload-Post YouTube card so users can tell them apart.

### Stopping point for verification

Per the approved master plan, we stop here. You'll be able to:
- Click "Connect YouTube (Native)"
- Complete Google OAuth
- See your channel name + email appear in the Connections page
- Click Disconnect and see it cleared

Once that flow works end-to-end with your Google account, we move to Steps 5–7 (Fly worker + submit/callback + ScheduleDialog toggle).

### Files in this batch

**New:**
- `supabase/migrations/<timestamp>_youtube_native.sql`
- `supabase/functions/youtube-native-oauth-start/index.ts`
- `supabase/functions/youtube-native-oauth-callback/index.ts`
- `supabase/functions/youtube-native-disconnect/index.ts`
- `src/hooks/useYoutubeNativeConnection.ts`

**Modified:**
- `supabase/config.toml` (3 new function blocks)
- `src/components/settings/ConnectionsView.tsx` (Native section + subtitle on Upload-Post YouTube card)

