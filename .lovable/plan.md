

## Fix: TikTok posts not actually publishing via Publer

### The Problem
The `publishToPubler()` function sends the publish request, gets back a `job_id`, and immediately returns `{ success: true }` without ever checking if the job completed. Publer's API is fully asynchronous — a 200 response only means "job accepted," not "video is live on TikTok."

### The Fix
After receiving the `job_id`, poll `GET /api/v1/job_status/{job_id}` until `status` is `"completed"` or `"failed"`. Only then report success or failure.

### Changes

**`supabase/functions/post-scheduled-content/index.ts`** — update `publishToPubler()`:

1. After the POST to `/posts/schedule/publish`, extract `job_id` from the response (`{ "job_id": "..." }`)
2. Poll `GET /api/v1/job_status/{job_id}` in a loop (up to 30 attempts, 3 seconds apart = ~90 seconds max)
3. If `status === "completed"` — return success
4. If `status === "failed"` — return failure with the error payload
5. If polling times out (still `"working"`) — store `tiktok_status = 'pending'` and the `job_id` in the database so it can be checked later, rather than falsely marking it as posted or failed

This also requires a small schema addition:

**Database migration** — add `tiktok_job_id` column to `posted_content`:
```sql
ALTER TABLE posted_content ADD COLUMN IF NOT EXISTS tiktok_job_id text;
```

This lets us store the Publer job ID for posts that didn't finish within the polling window, enabling future manual or cron-based verification.

### Summary

| Location | Change |
|---|---|
| `post-scheduled-content/index.ts` | Poll `/job_status/{job_id}` after publish, report real outcome |
| DB migration | Add `tiktok_job_id` column to `posted_content` |

