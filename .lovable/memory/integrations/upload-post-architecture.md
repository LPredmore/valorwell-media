---
name: Upload-Post Architecture
description: Multi-tenant Upload-Post integration replacing all prior posting infra (YouTube/Fly.io/Publer)
type: feature
---
# Upload-Post Architecture (current posting stack)

## Tenant model
- 1 user = 1 tenant = 1 Upload-Post profile
- Profile username format: `flurra<uuid_no_dashes>`
- Created async on signup via `handle_new_user` → `pg_net` → edge function `upload-post-create-profile`
- Tracked in `upload_post_profiles` table with `provisioning_status`: `pending` | `ready` | `failed`

## Edge functions
- `upload-post-create-profile` — provisions Upload-Post user; called from signup trigger
- `upload-post-generate-link` — JWT hosted-OAuth link per platform; opens new tab to Upload-Post
- `upload-post-sync-profile` — refreshes `connected_platforms` cache from Upload-Post
- `upload-post-submit` — multipart POST to `/api/upload`, signed R2 video URL, sets `upload_post_status`
- `upload-post-status-poll` — cron every 2 min; reconciles in-flight `uploading` rows; archives to `posted_content`
- `post-scheduled-content` — cron every 1 min; finds `status=scheduled AND scheduled_at<=now()`, invokes submit

## Status fields on social_content / posted_content
- `upload_post_request_id` (text)
- `upload_post_status` (`pending` | `uploading` | `success` | `partial` | `failed`)
- `upload_post_results` (jsonb, per-platform response)

## Removed entirely
- Tables: `youtube_connections`
- Columns: `youtube_status`, `youtube_video_id`, `youtube_uploaded_at`, `youtube_error_detail`, `tiktok_*`, `upload_at`, `youtube_comment_*`
- Functions: `youtube-save-connection`, `youtube-get-access-token`, `google-account-info`
- Secrets: `PUBLER_API_KEY`, `PUBLER_WORKSPACE_ID`, `PUBLER_TIKTOK_ACCOUNT_ID`
- UI: Google sign-in on Login, `/connections` page (now redirects to `/settings?tab=connections`)

## Connection UX
- 10 platforms: tiktok, instagram, youtube, linkedin, facebook, x, threads, pinterest, reddit, bluesky
- "Connect" → `upload-post-generate-link` → opens hosted page in new tab
- On return, `?synced=1` query param triggers `upload-post-sync-profile`
- Schedule dialog only shows actually-connected platforms as checkboxes
