

# YouTube API Integration for Posting Videos

## How YouTube Upload Works

YouTube's Data API v3 requires OAuth2 user credentials (not service accounts). The flow is:

1. Exchange a stored refresh token for an access token
2. Initiate a resumable upload session with video metadata (title, description, privacy, category)
3. Stream the video file to that session URL
4. YouTube returns the published video ID

**Important constraint**: Videos uploaded via unverified OAuth apps are locked to "Private". The Google Cloud project must go through YouTube API verification to upload as Public/Unlisted. Until verified, uploads will work but remain Private.

## Architecture

A new edge function `publish-youtube` handles the entire server-side flow:

```text
Client (trigger) --> publish-youtube edge function
                        |
                        +--> Exchange refresh token for access token (Google OAuth)
                        +--> Fetch video from R2 (presigned GET)
                        +--> Resumable upload to YouTube Data API v3
                        +--> Update social_content row (status=posted, posted_at, video_url=youtube link)
```

The function is invoked per content item when the user clicks a "Post Now" button or (later) by a scheduled cron trigger.

## Existing Secrets (Already Configured)

These are already in Supabase secrets -- no new secrets needed:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

## Implementation Details

### 1. New Edge Function: `supabase/functions/publish-youtube/index.ts`

**Input**: `{ contentId: string }`

**Steps**:

1. Authenticate the caller (require auth header, verify ownership via RLS)
2. Fetch the `social_content` row -- need `youtube_title`, `youtube_desc`, `video_storage_path`, `video_mime_type`
3. Validate the content has a video and generated text
4. Exchange `GOOGLE_OAUTH_REFRESH_TOKEN` for an access token via `https://oauth2.googleapis.com/token`
5. Fetch the video from R2 using a presigned URL (reuse the same `aws4fetch` pattern from `r2-read-url`)
6. Initiate a resumable upload:
   - `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
   - Body: `{ snippet: { title, description, categoryId: "22" }, status: { privacyStatus: "private" } }`
   - Returns a `Location` header with the upload URI
7. `PUT` the video bytes to that upload URI
8. Parse the response for the YouTube video ID
9. Update the `social_content` row: `status = "posted"`, `posted_at = now()`, `video_url = https://youtu.be/{videoId}`

**Error handling**: If upload fails, set `status = "error"` and store the error message. The user can retry.

### 2. Config: `supabase/config.toml`

Add:
```toml
[functions.publish-youtube]
verify_jwt = false
```

### 3. UI: Add "Post to YouTube" action

**File: `src/components/schedule/ScheduledTab.tsx`**

Add a "Post" button next to the Edit button for each scheduled item. Clicking it:
- Calls `supabase.functions.invoke("publish-youtube", { body: { contentId } })`
- Shows a loading spinner during upload
- On success, the item moves from Scheduled to Past tab via query invalidation
- On failure, shows a toast with the error

**File: `src/pages/ContentDetail.tsx`**

Add a "Post to YouTube" button in the header actions area (visible when `status === "scheduled"` or `status === "complete"`).

### 4. New hook: `src/hooks/usePublishYouTube.ts`

A React Query mutation wrapping the edge function call, with query invalidation for `["schedule"]` and `["contents"]` on success.

## What This Does NOT Cover (Future Work)

- **Automated scheduled posting** (cron trigger) -- currently manual "Post Now" only
- **Other platforms** (Facebook, LinkedIn, Instagram/TikTok) -- same pattern, different APIs
- **OAuth consent flow in-app** -- the refresh token is pre-configured in secrets, meaning it's tied to one YouTube channel. A full multi-user OAuth flow would require a different architecture.
- **YouTube API verification** -- uploads will be Private until the Google Cloud project is verified

## File Summary

| File | Action |
|------|--------|
| `supabase/functions/publish-youtube/index.ts` | Create |
| `supabase/config.toml` | Add publish-youtube config |
| `src/hooks/usePublishYouTube.ts` | Create |
| `src/components/schedule/ScheduledTab.tsx` | Add Post button |
| `src/pages/ContentDetail.tsx` | Add Post to YouTube button |

