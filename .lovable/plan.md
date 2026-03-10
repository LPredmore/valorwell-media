

# Fix: Shorts Image Requirement + Long Video Image Not Persisting

## Two Distinct Issues

### Issue 1: Shorts cannot be scheduled — database trigger requires image for all content

The client-side validation in `UnscheduledTab.tsx` (line 15) correctly skips the image check for Shorts: `if (item.post_length === "Long" && !item.image?.trim())`. So the UI lets you proceed. But then the Supabase update to set `scheduled_at` fires the database trigger `enforce_youtube_schedule_requirements`, which unconditionally checks `if coalesce(new.image, '') = '' then raise exception 'Cannot schedule: image is missing'`. It does not check `post_length`. The trigger rejects the update, Supabase returns an error, and the UI shows the failure.

**Root cause**: The trigger was never updated for Shorts. The client-side fix was correct but irrelevant — the server-side gate is the one blocking it.

### Issue 2: Long video images are not available after posting

In `post-scheduled-content/index.ts` (line 83-84), the insert into `posted_content` explicitly sets `video_url: null` and `image_url: null`. The `image` field (the R2 storage path) does flow through via `...rest`, so the R2 path is preserved in `posted_content.image`. However, `image_url` (which would be a signed URL for external platforms like Make.com to download) is deliberately nulled. The previous diagnosis noted that signed URLs should be generated here, but currently they are not.

This means: the R2 path is archived, but no usable download URL is generated for external consumers at posting time.

## Technical Decisions

### Decision 1: Fix the trigger, not the client code

The correct fix is to modify the `enforce_youtube_schedule_requirements` database function to skip the image check when `post_length = 'Short'`. This is the single source of truth for scheduling validation. The client-side validation in `UnscheduledTab.tsx` is already correct and needs no change.

### Decision 2: Generate signed R2 URLs in the edge function

The `post-scheduled-content` function should generate signed R2 read URLs for both `video_url` and `image_url` (when `image` is present) instead of nulling them out. This is what Make.com needs to download the assets. The memory note on this system explicitly states this is the intended design: "generates 1-hour signed R2 URLs for `video_url` and `image_url` at the moment of migration." The current code contradicts the documented architecture. The edge function already has access to R2 secrets (it runs with service role), and the `r2-read-url` function shows the pattern for generating signed URLs.

## Changes

### 1. Database migration: update `enforce_youtube_schedule_requirements`

Replace the trigger function to skip the image check when `post_length = 'Short'`:

```sql
CREATE OR REPLACE FUNCTION public.enforce_youtube_schedule_requirements()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
begin
  if new.scheduled_at is not null then
    -- Image only required for Long-form content
    if new.post_length IS DISTINCT FROM 'Short' and coalesce(new.image, '') = '' then
      raise exception 'Cannot schedule: image is missing';
    end if;

    if coalesce(new.video_storage_path, '') = '' then
      raise exception 'Cannot schedule: video_storage_path is missing';
    end if;

    if coalesce(new.youtube_title, '') = '' then
      raise exception 'Cannot schedule: youtube_title is missing';
    end if;

    if coalesce(new.youtube_desc, '') = '' then
      raise exception 'Cannot schedule: youtube_desc is missing';
    end if;

    if new.post_length is null then
      raise exception 'Cannot schedule: post_length is missing';
    end if;
  end if;

  return new;
end;
$$;
```

Using `IS DISTINCT FROM 'Short'` rather than `= 'Long'` so the image is still required for any future post types and for null `post_length` (which would be caught by the later null check anyway, but defense in depth).

### 2. Edge function: generate signed R2 URLs instead of nulling them

In `supabase/functions/post-scheduled-content/index.ts`, import the S3 client (same pattern as `r2-read-url`), and before inserting into `posted_content`:

- If `row.video_storage_path` exists, generate a 1-hour signed URL and set it as `video_url`.
- If `row.image` exists, generate a 1-hour signed URL and set it as `image_url`.
- If either is missing, leave it as `null`.

This requires reading R2 secrets (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) which are already configured in the project secrets. I will read the `r2-read-url` function to replicate the exact signing pattern.

### Summary

| Location | Change |
|---|---|
| DB migration | Update `enforce_youtube_schedule_requirements` to skip image check for Shorts |
| `post-scheduled-content/index.ts` | Generate signed R2 URLs for `video_url` and `image_url` instead of setting them to `null` |

No client-side code changes needed. The UI validation is already correct.

