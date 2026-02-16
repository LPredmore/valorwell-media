

# Unified Content Lifecycle Fix

## The Core Problem

There are three interrelated issues that all stem from the same root cause: **the system conflates "text is generated" with "content is ready."**

1. **Status logic is wrong.** The `generate-content` edge function unconditionally sets `status: 'unscheduled'` after generating text. This means a topic-only post (no image, no video) jumps straight to `unscheduled`, bypassing the Incomplete tab entirely. The user loses their entry point for adding media.

2. **Video upload fails on the detail page.** When the user navigates to `/content/:id` to add a video, the `handleVideoReplace` function uploads successfully to R2 and updates the DB, but it never recalculates the content's status. The post stays `unscheduled` regardless. Meanwhile, the `IncompleteTab` upload dialog has its own separate logic that checks for both media and re-triggers generation -- two competing workflows for the same operation.

3. **No single source of truth for "completeness."** Completeness checks are scattered: the `IncompleteTab` checks `image && video_storage_path`, the `UnscheduledTab.validateForScheduling` checks five fields, the DB trigger `enforce_youtube_schedule_requirements` checks four fields, and the edge function ignores media entirely. None of them agree.

## The Right Architecture

**Decision: Move status computation into the `generate-content` edge function, which is the only place that has full context.**

The edge function already reads the full content row and writes back all text fields. It should also be the one to decide the status based on what's actually present. This is better than:

- Client-side status computation (fragile, duplicated across 3+ components)
- A DB trigger (triggers can't easily inspect "did text generation succeed?")
- A separate "recompute-status" function (unnecessary indirection)

### Status rules (single source of truth, in the edge function):

```text
After text generation succeeds:
  IF image AND video_storage_path are both present -> 'unscheduled'
  ELSE -> 'incomplete'
```

This means:
- Topic-only creation: generates text, stays `incomplete` (user sees it in Incomplete tab, can add media)
- Topic + image: generates text, stays `incomplete` (still needs video)
- Topic + image + video: generates text, becomes `unscheduled` (ready to schedule)
- Adding media later from ContentDetail page: after uploading, call `generate-content` again (or a lighter status-recompute), which re-evaluates and promotes to `unscheduled` if complete

### Why not a separate status-recompute endpoint?

Regeneration is cheap (it's already a button on the detail page) and guarantees text fields are always fresh. A separate endpoint adds complexity for no real benefit. However, for the specific case of "user just uploaded a video, don't want to wait for AI," I'll add a simple status recompute directly in the client after media upload -- just a single DB update that checks the row and sets status accordingly. This avoids a round-trip to OpenRouter when only media changed.

## Implementation Plan

### 1. Edge Function: `generate-content` -- status-aware completion (line ~160)

Change the final update from hardcoded `status: "unscheduled"` to:

```typescript
// Re-fetch the row to see current media state (may have been uploaded concurrently)
const { data: current } = await adminClient
  .from("social_content")
  .select("image, video_storage_path")
  .eq("id", contentId)
  .single();

const hasAllMedia = !!current?.image && !!current?.video_storage_path;
const newStatus = hasAllMedia ? "unscheduled" : "incomplete";

await adminClient.from("social_content").update({
  post_title: generated.post_title,
  youtube_title: generated.youtube_title,
  // ... other text fields ...
  status: newStatus,
  error: null,
}).eq("id", contentId);
```

### 2. ContentDetail page -- promote status after media upload

In `ContentDetail.tsx`, after `handleVideoReplace` successfully uploads and updates the DB row, add a status recomputation:

```typescript
// After updating video fields in DB, check if content is now complete
const { data: updated } = await supabase
  .from("social_content")
  .select("image, video_storage_path, youtube_title, status")
  .eq("id", id)
  .single();

if (updated && updated.image && updated.video_storage_path 
    && updated.youtube_title && updated.status === "incomplete") {
  await supabase
    .from("social_content")
    .update({ status: "unscheduled" })
    .eq("id", id);
}
```

This is a simple, deterministic check -- no AI call needed.

### 3. ContentDetail page -- add image upload capability

The detail page currently shows `ImageSection` as read-only (no upload/replace). Add an image uploader to `ImageSection` (or next to it) so users can add/replace the cover image from the detail page, not just from the creation form or the Incomplete dialog.

After image upload, apply the same status recomputation as step 2.

### 4. IncompleteTab -- simplify the upload dialog logic

The current `handleMediaUpload` in `IncompleteTab` re-triggers `generate-content` when both media are present. This is unnecessary and slow -- it re-runs AI generation just because a video was added. Replace it with the same deterministic status promotion used in step 2. The dialog stays useful for quick media uploads, but stops triggering redundant AI calls.

### 5. CreateContent page -- no changes needed

The current flow is already correct after step 1:
- Insert row with `status: 'incomplete'`
- Upload media (if any)
- Call `generate-content`
- Edge function sets status based on media presence

The button label logic (`hasBothMedia ? "Create & Generate" : "Create"`) is misleading since generation always happens. Change it to just "Create" always.

## Files to Edit

| File | Change |
|------|--------|
| `supabase/functions/generate-content/index.ts` | Re-fetch media state before setting status; use `incomplete` or `unscheduled` based on image + video presence |
| `src/pages/ContentDetail.tsx` | Add status recomputation after video upload; add image upload/replace capability |
| `src/components/content/ImageSection.tsx` | Accept an `onReplace` callback prop for uploading/replacing the cover image |
| `src/components/schedule/IncompleteTab.tsx` | Replace `generate-content` call with deterministic status promotion after media upload |
| `src/pages/CreateContent.tsx` | Fix button label (always "Create") |

## What This Achieves

- **One definition of "complete"**: image + video + generated text = `unscheduled`. Missing any media = `incomplete`.
- **No redundant AI calls**: Media uploads don't trigger regeneration. Only the "Regenerate" button and initial creation call the AI.
- **Users can always add media**: From the detail page (video and image), from the Incomplete tab dialog, or at creation time. All paths converge on the same status logic.
- **Scheduling validation stays as-is**: The `UnscheduledTab.validateForScheduling` and the DB trigger `enforce_youtube_schedule_requirements` remain as safety nets, catching edge cases before a post can be scheduled.

