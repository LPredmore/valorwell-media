

# Overhaul Status System, Incomplete Tab, Playlist Scheduling, and Auto-Posting

## Overview

This plan restructures the content lifecycle around the `post_status` enum (`incomplete`, `unscheduled`, `scheduled`, `posted`), allows topic-only content creation, adds an Incomplete tab with media upload, replaces the platforms selector with a playlist picker, implements time-offset scheduling based on post length, and introduces a cron-driven edge function that posts scheduled content automatically.

---

## Database Changes

### 1. Migrate `status` column from text to the `post_status` enum

Both `social_content` and `posted_content` currently use a plain `text` column. The enum already exists. The migration will:

```sql
-- Map old text statuses to enum values before converting
UPDATE social_content SET status = 'incomplete' WHERE status IN ('new', 'uploading', 'ready', 'generating', 'error');
UPDATE social_content SET status = 'unscheduled' WHERE status = 'complete';

ALTER TABLE social_content
  ALTER COLUMN status TYPE post_status USING status::post_status,
  ALTER COLUMN status SET DEFAULT 'incomplete';

UPDATE posted_content SET status = 'posted' WHERE true;

ALTER TABLE posted_content
  ALTER COLUMN status TYPE post_status USING status::post_status,
  ALTER COLUMN status SET DEFAULT 'posted';
```

### 2. Add `playlist_id` column to both tables

```sql
ALTER TABLE social_content ADD COLUMN playlist_id bigint REFERENCES playlists(id);
ALTER TABLE posted_content ADD COLUMN playlist_id bigint REFERENCES playlists(id);
```

### 3. Add RLS to playlists table

The playlists table currently has no RLS. We need at least a SELECT policy for authenticated users:

```sql
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated select" ON playlists FOR SELECT USING (true);
```

### 4. Enable pg_cron and pg_net, create the hourly cron job

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

Then use the insert tool (not migration) to schedule:
```sql
SELECT cron.schedule(
  'post-scheduled-content',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://asjhkidpuhqodryczuth.supabase.co/functions/v1/post-scheduled-content',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## Edge Function: `post-scheduled-content`

A new edge function invoked hourly by cron. Logic:

1. Query `social_content` where `status = 'scheduled'` and `scheduled_at <= now()`
2. For each row:
   - INSERT a copy into `posted_content` with `status = 'posted'` and `posted_at = now()`
   - UPDATE the `social_content` row status to `'posted'` and set `posted_at = now()`
3. Uses the service role key (no user auth needed since it's a cron trigger)

Add to `supabase/config.toml`:
```toml
[functions.post-scheduled-content]
verify_jwt = false
```

---

## Frontend Changes

### CreateContent.tsx -- Allow topic-only submission

- Remove the requirement for `videoFile` in the submit guard (`!videoFile` check removed)
- New flow:
  - If neither image nor video provided: insert with `status = 'incomplete'`, skip generate-content, navigate to content detail
  - If both image and video provided: insert with `status = 'uploading'`, upload both, call generate-content (which sets status to `unscheduled` instead of `complete`)
  - If only one of image/video: insert with `status = 'incomplete'`, upload whichever is provided, skip generate-content
- The button text changes contextually: "Create" when incomplete, "Create & Generate" when both media are present

### generate-content edge function

- Change the final status from `"complete"` to `"unscheduled"` (line 170)

### StatusBadge.tsx

Update styles to reflect new statuses:
```
incomplete: "bg-muted text-muted-foreground"
unscheduled: "bg-success text-success-foreground"
scheduled: "bg-info text-info-foreground"
posted: "bg-primary text-primary-foreground"
```
Remove old statuses (new, uploading, ready, generating, complete, error).

### platforms.ts

Update `CONTENT_STATUSES` to match the enum: `["incomplete", "unscheduled", "scheduled", "posted"]`

### Schedule.tsx -- Add Incomplete tab

Add a fourth tab "Incomplete" as the first tab (default):

```
<TabsTrigger value="incomplete">Incomplete</TabsTrigger>
```

### New component: `IncompleteTab.tsx`

- Query `social_content` where `status = 'incomplete'`
- Table with columns: Topic, Image (checkmark/dash), Video (checkmark/dash), Action
- Action button opens an edit dialog/inline section allowing the user to upload an image and/or video
- After uploading, if the row now has BOTH `image` and `video_storage_path`:
  - Call generate-content (which sets status to `unscheduled`)
- If still missing one, keep status as `incomplete`

### ScheduleDialog.tsx -- Replace platforms with playlist picker

- Remove the `PLATFORMS` array, `platforms` state, `togglePlatform` function, and platforms UI section
- Add playlist fetching: `useQuery` to get all rows from `playlists` table
- Add a `Select` dropdown for playlist selection
- Change the `onConfirm` signature from `(scheduledAt: Date, platforms: string[])` to `(scheduledAt: Date, playlistId: number | null)`
- Add the time-offset logic:
  - Accept `postLength` as a prop (passed from the parent which knows the content's `post_length`)
  - When confirming, compute `actualScheduledAt`:
    - Short: subtract 2 hours from selected time
    - Long: subtract 6 hours from selected time
    - If result is in the past, use `new Date()` (post now)
  - If `actualScheduledAt` is now (in the past), the mutation should:
    - Copy the row to `posted_content` with `status = 'posted'`
    - Update `social_content` status to `'posted'`
  - If future, set `social_content` status to `'scheduled'` and `scheduled_at` to the computed time
- Remove `initialPlatforms` prop, add `initialPlaylistId` prop
- Confirm button enabled when date is selected (playlist is optional)

### useSchedule.ts -- Update hooks

- `useUnscheduledContent`: change filter from `status = 'complete'` to `status = 'unscheduled'`
- `useScheduleContent` mutation: update signature to accept `playlistId` instead of `platforms`, update the DB call accordingly
- `useUpdateSchedule` mutation: same changes
- `usePostedContent`: query from `posted_content` table instead of `social_content`
- Add `useIncompleteContent` hook: query `social_content` where `status = 'incomplete'`
- Add `usePostNow` mutation: inserts into `posted_content` and updates `social_content` status to `'posted'`

### UnscheduledTab.tsx

- Update to pass `postLength` (from the content item) to `ScheduleDialog`
- Remove platforms from `handleConfirm` signature, use `playlistId`

### ScheduledTab.tsx

- Same updates: remove platform references, use playlist
- Pass `postLength` to `ScheduleDialog`

### PastTab.tsx

- Change query to use `posted_content` table (via updated `usePostedContent` hook)

### ContentDetail.tsx

- Update status checks from `"complete"` to `"unscheduled"` where relevant

---

## Files Changed

| File | Action |
|------|--------|
| Migration SQL | Enum conversion, add playlist_id columns, playlists RLS |
| Insert SQL (not migration) | pg_cron job setup |
| `supabase/functions/post-scheduled-content/index.ts` | New edge function |
| `supabase/config.toml` | Add post-scheduled-content entry |
| `supabase/functions/generate-content/index.ts` | Change final status to `unscheduled` |
| `src/pages/CreateContent.tsx` | Allow topic-only, conditional flow |
| `src/pages/Schedule.tsx` | Add Incomplete tab |
| `src/components/schedule/IncompleteTab.tsx` | New component |
| `src/components/schedule/ScheduleDialog.tsx` | Replace platforms with playlist, add time offset |
| `src/components/schedule/UnscheduledTab.tsx` | Update for new dialog signature |
| `src/components/schedule/ScheduledTab.tsx` | Update for new dialog signature |
| `src/components/schedule/PastTab.tsx` | Query from posted_content |
| `src/hooks/useSchedule.ts` | Update hooks, add incomplete/postNow |
| `src/lib/platforms.ts` | Update CONTENT_STATUSES |
| `src/components/content/StatusBadge.tsx` | Update status styles |
| `src/pages/ContentDetail.tsx` | Update status references |
| `src/hooks/useContents.ts` | Add playlist_id to type |

## Edge Function Deployments

- Deploy: `post-scheduled-content` (new)
- Redeploy: `generate-content`

