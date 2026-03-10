

# Fix: Scheduled content stuck due to missing `planned_date` column on `posted_content`

## Root Cause

The earlier migration added a `planned_date` column to `social_content` but not to `posted_content`. The `post-scheduled-content` edge function copies all fields from `social_content` into `posted_content` using a JavaScript spread (`...rest`). Since `planned_date` now exists in the spread but not in the target table, every insert fails with: *"Could not find the 'planned_date' column of 'posted_content'"*.

The cron job has been retrying and failing every minute. The content is permanently stuck as "scheduled."

## Fix

### 1. Database migration: add `planned_date` to `posted_content`

```sql
ALTER TABLE public.posted_content ADD COLUMN planned_date timestamptz;
```

This is all that's needed. Once the column exists, the next cron run (within 60 seconds) will successfully process the stuck content and move it to `posted_content`. No edge function changes required -- the existing spread logic will just work.

### 2. Strip `planned_date` from the edge function spread (defense in depth)

As a safeguard against future column mismatches, explicitly strip `planned_date` from the destructured fields in `post-scheduled-content/index.ts`, the same way `upload_at`, `youtube_status`, etc. are already stripped. This way even if more columns are added to `social_content` later, we control exactly what goes into `posted_content`.

In `post-scheduled-content/index.ts` line 432, add `planned_date` to the destructured exclusion list.

## Summary

| Change | Purpose |
|---|---|
| Add `planned_date` column to `posted_content` | Unblocks all stuck scheduled content immediately |
| Strip `planned_date` in edge function spread | Prevents this class of bug from recurring |

No client-side changes needed. The stuck Short will post automatically on the next cron cycle after the migration runs.

