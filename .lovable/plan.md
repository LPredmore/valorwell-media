

## Plan: Get Scheduled Content to Actually Post

### Lessons from the Fly.io Incident

The Fly.io crash was caused by a schema mismatch (`youtube_title` vs `post_title`) that produced a silent failure loop. The same class of bug exists in the `post-scheduled-content` Edge Function: it spreads all remaining columns from `social_content` into `posted_content`, but `social_content` has a `script` column that `posted_content` does not. This will cause a Postgres column-not-found error on every insert attempt -- identical root cause, different location.

Additionally, the Edge Function has never been invoked. There is no cron job configured for it, and `usePostNow` does not call it directly. Content sits in `social_content` with `status = 'scheduled'` indefinitely.

### Three changes, in dependency order

#### 1. Fix the schema mismatch in `post-scheduled-content/index.ts`

Add `script` to the destructured exclusion list alongside the other stripped fields:

```js
const { id: _id, upload_at: _ua, youtube_status: _ys, youtube_video_id: _yv,
        youtube_error_detail: _ye, youtube_uploaded_at: _yu, video_size_bytes: _vs,
        script: _sc,
        ...rest } = row;
```

Without this, every invocation will fail with a Postgres error. This must be fixed before enabling the cron or the function will fail on every run.

**Also**: map `post_title` to `youtube_title` in the insert. `posted_content` has a `youtube_title` column that downstream consumers (Make.com) may reference, but `social_content` does not have that column -- it uses `post_title`. The spread will populate `post_title` but leave `youtube_title` null. The insert should explicitly set `youtube_title: rest.post_title` so both fields are populated.

#### 2. Create a cron job to invoke the Edge Function

Use `pg_cron` + `pg_net` to call `post-scheduled-content` every minute. This is a data operation (not a migration) because it contains project-specific secrets (anon key).

```sql
SELECT cron.schedule(
  'post-scheduled-content-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://asjhkidpuhqodryczuth.supabase.co/functions/v1/post-scheduled-content',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzamhraWRwdWhxb2RyeWN6dXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzIzNDYsImV4cCI6MjA4NTg0ODM0Nn0.kb_iP02Fu-NNJtemRnLh7DhwaAybUEMUYQFaFWNxDOA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Every minute, this queries `social_content` for rows where `status = 'scheduled'` and `scheduled_at <= now()`, migrates them to `posted_content` with signed R2 URLs, and marks them as `posted`. This is the same pattern used by `kick_youtube_run_due`.

#### 3. Make "Post Now" invoke the Edge Function immediately

Update `usePostNow` in `src/hooks/useSchedule.ts` to call `supabase.functions.invoke('post-scheduled-content', { body: { contentId } })` after the status update succeeds. This gives the user instant feedback instead of waiting up to 60 seconds for the cron to pick it up.

The Edge Function already supports a `contentId` body parameter (lines 56-70 of the function) -- it fetches that specific row and processes it. No Edge Function changes needed for this.

### Why this is the right approach

**Why not a database trigger instead of a cron?** A trigger on `social_content` UPDATE (when `status` becomes `scheduled`) could invoke `pg_net` to call the function. But that conflates two concerns: scheduling (setting a future time) and posting (migrating data when that time arrives). Content scheduled for tomorrow should not trigger the Edge Function today. The cron correctly checks `scheduled_at <= now()` on every pass.

**Why strip `script` instead of adding it to `posted_content`?** The user explicitly said `script` does not need to be in `posted_content`. Adding unnecessary columns to the archive table creates maintenance burden. Strip it and move on.

**Why map `post_title` to `youtube_title`?** The `posted_content` table has a `youtube_title` column that was likely created before the schema was consolidated to use `post_title`. Downstream consumers (Make.com scenarios) may reference `youtube_title`. Populating both prevents a second "column mismatch" class of bug from surfacing in Make.com workflows.

### Summary

| Change | File | Type |
|---|---|---|
| Strip `script`, map `youtube_title` | `supabase/functions/post-scheduled-content/index.ts` | Code edit |
| Create cron job | Supabase SQL (data operation) | Database insert |
| Invoke edge function from Post Now | `src/hooks/useSchedule.ts` | Code edit |

