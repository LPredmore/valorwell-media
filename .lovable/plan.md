
Diagnosis only (no fixes proposed)

What I reviewed (all related feature files)
- Edge function: `supabase/functions/post-scheduled-content/index.ts`
- Scheduling/posting flow: `src/hooks/useSchedule.ts`
- Schedule UI: `src/pages/Schedule.tsx`, `src/components/schedule/UnscheduledTab.tsx`, `ScheduledTab.tsx`, `PastTab.tsx`, `ScheduleDialog.tsx`
- Content UI/status surfaces: `src/components/content/ContentTable.tsx`, `src/pages/ContentDetail.tsx`, `src/hooks/useContents.ts`, `src/lib/platforms.ts`
- Runtime config: `supabase/config.toml`
- Relevant migrations and runtime cron state
- Live DB state + edge logs

What the database currently shows
- Shorts in `social_content` with `status='posted'`: 5 unique videos.
- Shorts in `posted_content`: 6 rows (one video was archived twice; duplicate `source_content_id`).
- Unique Short results by source content:
  - 4 are explicitly failed:
    - 3x `Publer media upload failed [401]: {"errors":["Not authenticated"]}` (older attempts)
    - 1x `Publer media processing timed out after 80 seconds`
  - 1 is marked `tiktok_status='posted'` with no error.
- Latest TikTok status updates happened around 23:10–23:11 UTC, so retries did run recently.

What the logs show
- Recent `post-scheduled-content` edge logs are mostly minute-by-minute boot/shutdown entries.
- This matches an active cron that runs every minute.
- No recent detailed Publer result logs are available in the current log window.
- No Shorts are currently `status='scheduled'`, so cron runs now are mostly no-op checks.

What the code is actually doing (critical behavior)
1. Short posts are attempted to TikTok inside `post-scheduled-content`.
2. For TikTok, `publishToPubler()` calls `POST /posts/schedule/publish`.
3. If HTTP is 200, code immediately returns success and sets `tiktok_status='posted'`.
4. The code does not verify final TikTok publish completion; it only treats “Publer accepted request” as success.
5. The social row is still moved to `status='posted'` regardless of TikTok outcome branch.

Why you can see “posted” internally but nothing on TikTok
- In this system, “posted” is currently an internal workflow state, not proof of final TikTok publication.
- A 200 from Publer is being treated as final success, but Publer/TikTok publishing is asynchronous.
- So the app/database can report success before TikTok actually has a live post.
- That explains your exact symptom: “none of the videos actually posted to TikTok” even though one record says `tiktok_status='posted'`.

Additional important context from code/data
- There is no TikTok post URL/id being persisted back into your DB for final confirmation.
- There is no TikTok status shown in main content/schedule UI tables (only generic content status + YouTube status), so UI can hide this mismatch.
- One source content has two archive rows in `posted_content`, which can make status counting look better than reality.

Bottom line in plain terms
- Most Shorts definitely failed (4/5 unique sources).
- The remaining one marked “posted” is a “request accepted” signal, not a guaranteed “video is live on TikTok” signal.
- So your observation is consistent with the actual system behavior and data.
