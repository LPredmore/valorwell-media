

## Diagnosis recap

The system has **three separate places** that attempt to promote content from `incomplete` to `unscheduled`:

1. **`generate-content` edge function** (lines 360-364) -- checks media at the end of AI generation. Works if media was uploaded before generation ran, but the typical flow is: create row, upload media, call generate. There's a race between the media DB update and the function's re-fetch.

2. **`useIncompleteContent` hook** (useSchedule.ts lines 18-30) -- client-side query that promotes matching rows every time the Incomplete tab is viewed. Only fires when someone opens that tab. Silent failure on errors.

3. **`ContentDetail` page** (lines 90-109, 157-165) -- `promoteStatusIfComplete` runs after video/image upload and on content load via useEffect. This is the most reliable path but only fires when viewing a specific content detail page.

The core problem: there is **no server-side mechanism** that reacts to field changes on `social_content`. Promotion depends entirely on a client happening to be in the right place at the right time.

## The right fix: a database trigger

A `BEFORE UPDATE` trigger on `social_content` is the correct solution. Here's why:

- **Single source of truth.** Every update to the row -- whether from the edge function, the client, the IncompleteTab dialog, the ContentDetail page, or a future admin tool -- passes through the same gate. No duplication, no race conditions.
- **Eliminates all client-side promotion code.** The three scattered promotion mechanisms become unnecessary. The trigger handles it atomically within the same transaction as the update that satisfies the requirements.
- **Consistent with existing patterns.** The project already uses triggers for validation (`enforce_youtube_schedule_requirements`), computed fields (`set_youtube_upload_at_and_queue`), and timestamps (`set_updated_at`). This is the same pattern.
- **No edge function changes needed.** The generate-content function can stop checking media state and just save its fields. The trigger will promote if the row is now complete.

## What the trigger checks

When `status = 'incomplete'` and an update provides all required fields, the trigger sets `status = 'unscheduled'`:

- **Always required:** `video_storage_path`, `post_title`, `post_length`
- **Required only for Long:** `image`
- **Short:** no image needed

This matches the existing validation logic exactly.

## Changes

### 1. Database migration: create trigger function + trigger

```sql
CREATE OR REPLACE FUNCTION public.auto_promote_incomplete()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
begin
  -- Only act on rows currently incomplete
  if new.status = 'incomplete' then
    -- Check core fields
    if coalesce(new.video_storage_path, '') <> ''
       and coalesce(new.post_title, '') <> ''
       and new.post_length is not null
    then
      -- Image only required for non-Short
      if new.post_length::text = 'Short'
         or coalesce(new.image, '') <> ''
      then
        new.status := 'unscheduled';
      end if;
    end if;
  end if;

  return new;
end;
$$;

CREATE TRIGGER trg_auto_promote_incomplete
  BEFORE INSERT OR UPDATE ON public.social_content
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_promote_incomplete();
```

The trigger fires on both INSERT and UPDATE so it catches every path.

### 2. Remove client-side promotion logic

- **`useSchedule.ts` / `useIncompleteContent`**: Remove the `readyToPromoteIds` filter-and-update block (lines 18-30). The query just returns incomplete rows.
- **`ContentDetail.tsx`**: Remove `promoteStatusIfComplete` callback (lines 90-109), the useEffect that calls it (lines 157-165), and the calls from `handleVideoReplace` and `handleImageUploaded`. These are no longer needed.
- **`IncompleteTab.tsx`**: Remove the post-upload promotion check in `handleMediaUpload` (the block that re-fetches and updates status). After uploading media and saving to DB, the trigger handles the rest.

### 3. Remove media-check logic from generate-content edge function

In `generate-content/index.ts`, lines 353-364: remove the re-fetch of `image`/`video_storage_path` and the `hasAllMedia` conditional. Just set `status: 'incomplete'` unconditionally in the update (or omit status entirely since it's already incomplete). The trigger will promote it if media was already uploaded.

### Summary

| Location | Change |
|---|---|
| DB migration | Add `auto_promote_incomplete` trigger function + trigger |
| `useSchedule.ts` | Remove client-side promotion logic from `useIncompleteContent` |
| `ContentDetail.tsx` | Remove `promoteStatusIfComplete` and related useEffect/callbacks |
| `IncompleteTab.tsx` | Remove post-upload status promotion in `handleMediaUpload` |
| `generate-content/index.ts` | Remove media re-fetch and conditional status logic |

