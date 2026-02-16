

# Migrate YouTube Uploads from Make.com to Fly.io Job Queue

## Summary

YouTube uploading is moving from Make.com (which downloads entire MP4s at cost) to a Fly.io service that streams directly from R2 to YouTube. The Lovable app's role changes from "trigger Make.com via posted_content" to "write scheduling data to social_content and display job status from the same table." A Supabase trigger already handles the queue logic -- the app just needs to get out of its way and surface the results.

## Architecture Decision

**The `post-scheduled-content` edge function will be stripped of all YouTube-related responsibilities.** It will continue to exist only for non-YouTube posting workflows (copying to `posted_content` for Make.com to handle other platforms). YouTube is now entirely owned by Fly.io polling `social_content.youtube_status = 'queued'`.

The `publish-youtube` edge function becomes dead code and should be removed. The `usePublishYouTube` hook and all "Post to YouTube" buttons go with it. These were browser-initiated uploads that bypass the queue -- keeping them creates two competing pathways to YouTube, which is a reliability and debugging nightmare.

The ScheduleDialog currently computes a time offset (2h for Short, 6h for Long) on the client side and sends the offset time as `scheduled_at`. This is wrong for the new model. The Supabase trigger expects `scheduled_at` to be the actual desired publish time, and it computes `upload_at` itself by subtracting the buffer. The client must stop doing this arithmetic. The trigger is the single source of truth for upload timing.

## Changes by File

### 1. `src/hooks/useContents.ts` -- Add YouTube columns to SocialContent type

Add the six new fields so TypeScript stops requiring `as any` casts:

- `youtube_status: string | null`
- `upload_at: string | null`
- `youtube_video_id: string | null`
- `youtube_error_detail: string | null`
- `youtube_uploaded_at: string | null`
- `video_size_bytes: number | null`

### 2. `src/components/schedule/ScheduleDialog.tsx` -- Stop computing time offsets

**Remove lines 98-107** (the offset logic). The dialog should send the raw selected date+time as `scheduled_at`. The Supabase trigger owns the buffer calculation. The dialog description text about "schedules 2h early" / "schedules 6h early" should change to something like "Upload begins 2h before broadcast" / "Upload begins 6h before broadcast" to accurately describe what happens.

Also remove the "if adjusted time is in the past, use now" fallback (lines 106-107). If the user picks a time in the past, the trigger will clamp `upload_at` to `now()` via `greatest(now(), scheduled_at - buffer)`. Let the trigger handle it.

### 3. `src/hooks/useSchedule.ts` -- Clean up scheduling mutations

**`useScheduleContent`**: Only set `scheduled_at` and `playlist_id`. Do NOT set `status: "scheduled"` manually -- however, this one is actually still needed because the trigger only sets `youtube_status` and `upload_at`, not the post `status` column. So `status: "scheduled"` stays. Do NOT set `upload_at` or `youtube_status`.

**`usePostNow`**: This currently calls the `post-scheduled-content` edge function for immediate posting. Under the new model, "Post Now" should set `scheduled_at = now()` and `status = "scheduled"`. The trigger will set `upload_at = now()` and `youtube_status = 'queued'`, and Fly.io will pick it up within its polling interval. Remove the edge function invocation.

**Add `useRetryYouTubeUpload`**: A new mutation that updates `social_content` with:
```
youtube_status: 'queued'
upload_at: new Date().toISOString()
youtube_error_detail: null
youtube_video_id: null
youtube_uploaded_at: null
```

### 4. `src/pages/ContentDetail.tsx` -- Replace YouTube button, add status panel

**Remove**: The `usePublishYouTube` import and the "Post to YouTube" button (lines 7, 48, 181-206).

**Add**: A YouTube Status section below the header that shows:
- **YouTube Status**: Badge showing `youtube_status` (queued/uploading/scheduled/failed) with color coding
- **Upload At**: Formatted `upload_at` timestamp
- **YouTube Video ID**: Link to `https://youtu.be/{id}` when available
- **Uploaded At**: Formatted `youtube_uploaded_at`
- **Error Detail**: Red alert box showing `youtube_error_detail`, only when `youtube_status === 'failed'`

**Add**: A "Retry Upload" button visible when `youtube_status === 'failed'`. Uses the new `useRetryYouTubeUpload` mutation.

### 5. `src/components/schedule/ScheduledTab.tsx` -- Remove YouTube publish button

**Remove**: The `usePublishYouTube` import, `publishMutation`, `publishingId` state, `handlePublish` function, and the upload button in each table row (lines 8, 18, 21-35, 101-114).

**Add**: A `youtube_status` column in the table showing a small badge per row so users can see queue state at a glance.

### 6. `src/components/schedule/UnscheduledTab.tsx` -- Add pre-scheduling validation

Before opening the ScheduleDialog, validate that the selected item has:
- `video_storage_path` is not null
- `youtube_title` is not empty
- `youtube_desc` is not empty
- `post_length` is either "Short" or "Long"

If validation fails, show a toast with the specific missing fields and do not open the dialog. Image (`image`) is optional per the spec.

### 7. `src/components/content/ContentTable.tsx` -- Add YouTube status column

Add a narrow column showing `youtube_status` as a small colored badge next to the existing status badge, so the content list gives a quick overview of YouTube pipeline state.

### 8. `supabase/functions/post-scheduled-content/index.ts` -- Remove YouTube URL generation

Strip the `generateSignedUrl` function and the `aws4fetch` import. Remove the signed URL generation block (lines 106-126). The insert into `posted_content` should go back to using `video_url: null` and `image_url: null` (or simply omit them). This function now only serves non-YouTube platforms via Make.com.

The function's core purpose (copy to `posted_content` on schedule) remains for any Make.com scenarios that aren't YouTube. If YouTube is the only platform, this function could eventually be removed entirely, but that decision is out of scope.

### 9. `src/hooks/usePublishYouTube.ts` -- Delete

Dead code. Fly.io owns YouTube uploads now.

### 10. `supabase/functions/publish-youtube/index.ts` -- Delete

Dead code. The browser-initiated YouTube upload path is replaced by Fly.io.

## What This Does NOT Change

- R2 upload flow (browser -> R2 via TUS) -- untouched
- Content generation (`generate-content` edge function) -- untouched
- `posted_content` table and Make.com integration for non-YouTube platforms -- untouched
- Database schema -- no migrations needed, columns and trigger already exist
- YouTube OAuth connection flow in Settings -- untouched (Fly.io uses the same `youtube_connections` table)

## Validation Sequence

After implementation, to verify correctness:

1. Create content with video + image + generated fields
2. Set `post_length` to "Short"
3. Click Schedule, pick a future date/time
4. Confirm `scheduled_at` in DB equals the exact time selected (no offset applied by client)
5. Confirm `upload_at` in DB equals `max(now(), scheduled_at - 2 hours)`
6. Confirm `youtube_status` in DB equals `queued`
7. All three values should be visible in the UI
8. If `youtube_status` is manually set to `failed` with an error, the UI should show the error and a Retry button
9. Clicking Retry should reset `youtube_status` to `queued` and `upload_at` to now

