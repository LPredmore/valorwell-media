

## Plan: confirm OAuth flow is fine, then move forward

**Diagnosis recap:** The native YouTube connection is working. The console errors are cosmetic — they come from a sandboxed-iframe restriction in the Lovable preview that blocks the success page's auto-close script. The token exchange and DB save happen server-side before that page ever renders, and our popup-close polling fallback already handles UI refresh. In production (custom domain / published URL), the popup opens as a real window and these errors don't appear.

### Recommendation: do nothing, move to Step 5

The flow works end-to-end:
- Google OAuth completes
- Refresh token is encrypted and stored in `youtube_connections`
- UI shows ValorWell channel as connected
- Disconnect works (verified in your network log: `POST youtube-native-disconnect → {"ok":true}`)

The console warnings are preview-only artifacts and will not appear for users on the published site. No code change is justified to suppress them.

### Optional polish (only if you want to silence preview noise)

If the console errors bother you during dev, we could add a server-rendered "Click to close" button on the callback HTML as a manual fallback for sandboxed environments. This would let you click instead of waiting for the auto-close that's being blocked. Tiny UX win in preview, zero impact in production. **Not recommended unless it actively annoys you.**

### Proposed next step: Step 5 — Fly.io upload worker

Per the master plan, the next milestone is the actual upload pipeline. We'd build:

1. **Fly.io worker service** (separate repo, you deploy):
   - Endpoint `POST /upload-youtube` accepting `{ content_id, user_id, video_url, title, description, tags, privacy }`
   - Decrypts refresh token (calls Supabase to fetch encrypted token, decrypts with `YOUTUBE_REFRESH_TOKEN_ENCRYPTION_KEY`)
   - Exchanges refresh token for fresh access token
   - Streams video from R2 → YouTube Data API v3 resumable upload
   - On success/failure, calls back to Supabase edge function with result

2. **`youtube-native-submit` edge function**:
   - Called from `post-scheduled-content` when `youtube_via = 'native'`
   - Generates short-lived signed R2 read URL
   - POSTs job to Fly worker
   - Marks `youtube_native_status = 'uploading'`

3. **`youtube-native-callback` edge function**:
   - Receives result from Fly worker (HMAC-signed payload)
   - Updates `social_content` / `posted_content` with `youtube_native_status`, `youtube_native_video_id`, `youtube_native_uploaded_at`, or `youtube_native_error_detail`

4. **`ScheduleDialog` toggle**:
   - When YouTube is selected and a native connection exists, show a switch: **"Post via Native (beta) / Upload-Post"**
   - Stores choice in `youtube_via` column

### Files in next batch

**New:**
- `supabase/functions/youtube-native-submit/index.ts`
- `supabase/functions/youtube-native-callback/index.ts`
- Fly worker repo (separate, instructions provided)

**Modified:**
- `src/components/schedule/ScheduleDialog.tsx` — add native/upload-post toggle
- `supabase/functions/post-scheduled-content/index.ts` — route YouTube to native when `youtube_via='native'`

### Stopping point

After Step 5 you'll be able to schedule a YouTube post via the native path and watch it upload directly through your own Google credentials, bypassing Upload-Post entirely.

