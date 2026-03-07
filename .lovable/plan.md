

## Diagnosis: Why TikTok Posts Are Not Publishing

### What I found

I reviewed the full edge function, Publer API documentation (Creating Posts, Immediate Publishing, TikTok Video format, Media Handling, Job Status), database state, and logs. There are **three distinct problems**, not one.

---

### Problem 1: Not checking `payload.failures` (false positives)

The Publer docs explicitly show that a job with `status: "complete"` can still contain failures:

```text
{
  "status": "complete",
  "payload": {
    "failures": {}       <-- empty = success
    "failures": { ... }  <-- non-empty = per-account failures
  }
}
```

The current code (line 107) treats any terminal status as success without inspecting `payload.failures`. This is why the database says `tiktok_status = 'posted'` while nothing is actually on TikTok. The job completed — but completed with a failure that we ignored.

### Problem 2: Missing required `details` object

The Publer TikTok docs mark the `details` object as **Required** for video posts. It controls privacy, comments, duets, etc. The current payload omits it entirely:

```text
Current payload (line 41-56):
  tiktok: {
    type: "video",
    text: caption,
    media: [{ path: videoUrl }]
    // ← no details object
  }

Required by Publer:
  tiktok: {
    type: "video",
    text: caption,
    media: [...],
    details: {              // ← REQUIRED
      privacy: "PUBLIC_TO_EVERYONE",
      comment: true,
      duet: true,
      stitch: true,
      promotional: false,
      paid: false
    }
  }
```

Without `details`, Publer may reject the post at the TikTok API level. This would show up as a per-account failure inside `payload.failures` — which we never check (Problem 1).

### Problem 3: Media may need pre-upload to Publer

The TikTok video post docs show `media[].id` as **Required** ("Media ID if using stored media"). The current code passes only `{ path: videoUrl }` with no `id`. The Publer media handling docs describe two upload methods:

1. `POST /media/from-url` — upload by URL (async, returns job_id → poll → get media ID)
2. Direct file upload

Historical errors support this theory:
- `media processing timed out after 80 seconds` — Publer tried to download/process the video inline during post creation, rather than from a pre-uploaded asset. This is fragile because signed R2 URLs must be downloaded within the Publer processing window.

Pre-uploading via `/media/from-url` would give Publer time to download and process the video before the post is submitted, making the flow more reliable.

---

### The Fix

**Single change location**: `supabase/functions/post-scheduled-content/index.ts`

#### Change 1: Add media pre-upload step
Before creating the TikTok post, call `POST /media/from-url` with the signed R2 video URL. Poll the upload job until complete. Extract the returned media `id`. This decouples video download/processing from post creation, eliminating timeouts.

#### Change 2: Fix the post payload
Use the media `id` from the upload step. Add the required `details` object with sensible defaults (`privacy: "PUBLIC_TO_EVERYONE"`, `comment: true`, `duet: true`, `stitch: true`).

#### Change 3: Check `payload.failures` in job status polling
When `status` is `complete`/`completed`/`done`, inspect `payload.failures`. If it's a non-empty object, extract the error and return failure — not success.

#### Change 4: Log the full job status response
Currently only the `status` string is logged. Log the entire response body so failures are visible in edge function logs for debugging.

### Why this is the right approach

- **Pre-uploading media** is what Publer's architecture expects. Passing raw URLs inline is an undocumented shortcut that works unreliably (evidenced by the 80s timeout). The official examples all use media IDs.
- **Checking `payload.failures`** is mandatory per the docs and is the single biggest bug — without it, every failure looks like success.
- **Adding `details`** fulfills a documented requirement. Even if Publer applies defaults when it's missing, omitting a required field is asking for unpredictable behavior.
- No database changes needed. No client-side changes needed. The fix is entirely within the edge function.

### Execution order

1. Add `uploadMediaFromUrl()` helper function (POST to `/media/from-url`, poll job, return media ID)
2. Update `publishToPubler()` to call the upload helper first, then build the correct payload with `id`, `path`, and `details`
3. Fix the job status polling to inspect `payload.failures`
4. Add detailed logging throughout
5. Redeploy the edge function

