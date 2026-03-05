

# Plan: Sync `youtube_video_id` to `posted_content` via Database Trigger

## The Problem

Fly.io writes `youtube_video_id` back to `social_content` *after* the row has already been migrated to `posted_content`. The two tables share no linkage after migration, and `posted_content` doesn't even have a `youtube_video_id` column. There is no mechanism to propagate the ID forward.

## The Right Approach: A Database Trigger on `social_content`

The correct solution is a Postgres trigger, not an Edge Function, webhook, or polling job. Here is why:

- **Fly.io already writes the `youtube_video_id` back to `social_content`** via a standard UPDATE. That UPDATE is the single, authoritative event we need to react to. A trigger fires synchronously inside that same transaction -- zero latency, zero missed events, no additional infrastructure.
- **An Edge Function or cron** would introduce polling delay, require HTTP roundtrips, and add a failure mode (function timeout, network error) for something that Postgres can do natively in microseconds.
- **The `social_content` row still exists** after migration -- its `status` is set to `'posted'` but it is not deleted. So the trigger can read both the new `youtube_video_id` and the row's `id` to find the matching `posted_content` record.

The only prerequisite is a way to match `social_content` rows to `posted_content` rows. Currently `posted_content` generates its own `id` on insert (via `gen_random_uuid()`). But `post-scheduled-content` spreads `...rest` which does not include `id` (it's explicitly stripped). We need a foreign key or shared identifier. The cleanest option: add a `source_content_id` column to `posted_content` that stores the original `social_content.id`. This is better than trying to match on `topic + user_id + scheduled_at` which is fragile.

## Changes (3 total)

### 1. Database migration: Add two columns to `posted_content`

```sql
ALTER TABLE public.posted_content
  ADD COLUMN youtube_video_id text,
  ADD COLUMN source_content_id uuid;
```

`source_content_id` is the link back to the original `social_content` row. It enables the trigger to find the right `posted_content` row. `youtube_video_id` stores the YouTube ID.

### 2. Database migration: Create trigger on `social_content`

```sql
CREATE OR REPLACE FUNCTION public.sync_youtube_video_id_to_posted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.youtube_video_id IS NOT NULL
     AND (OLD.youtube_video_id IS DISTINCT FROM NEW.youtube_video_id)
  THEN
    UPDATE posted_content
       SET youtube_video_id = NEW.youtube_video_id
     WHERE source_content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_youtube_video_id
  AFTER UPDATE ON public.social_content
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_youtube_video_id_to_posted();
```

`SECURITY DEFINER` because `posted_content` has no INSERT/UPDATE RLS policies for regular users -- only service-role and this trigger need write access. The trigger only fires when `youtube_video_id` actually changes, so it's a no-op for unrelated updates.

### 3. Edge Function: Populate `source_content_id` during migration

In `post-scheduled-content/index.ts`, add `source_content_id: row.id` to the insert payload. This is the glue that lets the trigger find the right row later.

```js
const { error: insertError } = await supabase
  .from("posted_content")
  .insert({
    ...rest,
    source_content_id: row.id,   // <-- new
    status: "posted",
    posted_at: now,
    video_url: videoUrl,
    image_url: imageUrl,
    youtube_title: rest.post_title ?? null,
  });
```

Also stop stripping `youtube_video_id` from the spread. If Fly.io has already written it before the cron fires (possible for Short videos with a 2-hour buffer), the ID will flow through on initial migration. The trigger handles the late-arrival case.

Change line 126 from:
```js
const { id: _id, upload_at: _ua, youtube_status: _ys, youtube_video_id: _yv,
```
to:
```js
const { id: _id, upload_at: _ua, youtube_status: _ys,
```

This way `youtube_video_id` stays in `...rest` and gets inserted if present.

## Why This Covers All Timing Scenarios

| Scenario | What happens |
|---|---|
| YouTube finishes *before* migration (common for Shorts) | `youtube_video_id` is in the spread, inserted directly into `posted_content` |
| YouTube finishes *after* migration (common for Long) | Fly.io UPDATEs `social_content`, trigger fires, copies ID to `posted_content` via `source_content_id` |
| YouTube never finishes (failure) | `youtube_video_id` stays null in both tables -- correct |

## Summary

| Location | Change |
|---|---|
| DB migration | Add `youtube_video_id` and `source_content_id` columns to `posted_content` |
| DB migration | Create `sync_youtube_video_id_to_posted` trigger function + trigger on `social_content` |
| `post-scheduled-content/index.ts` | Set `source_content_id: row.id`, stop stripping `youtube_video_id` |

No client-side changes needed. No Fly.io changes needed. No new Edge Functions or cron jobs.

