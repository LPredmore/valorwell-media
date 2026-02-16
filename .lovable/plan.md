
# Upload Media Dialog Fix, Content Generation on Topic-Only, and YouTube Title Display

## Overview
Three changes: (1) fix the Upload Media dialog so the topic text stays within bounds, (2) trigger AI content generation when a topic-only post is created (no media required), and (3) show `youtube_title` in the Topic column across all schedule tabs when available, falling back to `topic`.

## Changes

### 1. Fix Upload Media Dialog Overflow (IncompleteTab.tsx)
- Add `overflow-hidden` to the `DialogDescription` so it clips properly within the dialog instead of trailing off-screen.
- Use `min-w-0` on the `DialogHeader` to allow flex children to shrink.

### 2. Trigger Generation on Topic-Only Creation (CreateContent.tsx)
- Currently, `generate-content` is only called when both video and image are uploaded at creation time.
- Change the logic so that `generate-content` is always invoked after the content row is created, regardless of whether media files are attached.
- The edge function already handles topic-only content -- it reads the topic, generates text fields, and sets status to `unscheduled`.
- This means a topic-only post will go straight from `incomplete` to `unscheduled` with all text fields populated. Media can be uploaded later from the Incomplete tab (or it moves to Unscheduled immediately since text is generated).

**Wait -- re-reading the current flow**: The status starts as `incomplete` and the edge function sets it to `unscheduled`. If we generate immediately, the post will be `unscheduled` even without media. That aligns with the user's intent: text content gets generated right away, and media can be added later before scheduling (the scheduling validation already blocks posts without video/image).

### 3. Show youtube_title in Topic Column (all schedule tabs)
- In `IncompleteTab`, `UnscheduledTab`, `ScheduledTab`, and `PastTab`, display `item.youtube_title || item.topic` instead of just `item.topic`.
- This shows the AI-generated YouTube title once content has been generated, falling back to the original topic for incomplete items.

## Technical Details

### IncompleteTab.tsx -- Dialog fix
```tsx
<DialogDescription className="truncate">
  Upload media for "{editItem?.topic}"
</DialogDescription>
```
Shorten the text and keep `truncate`. Also add `overflow-hidden` to `DialogHeader`.

### IncompleteTab.tsx -- Topic column display
```tsx
<TableCell className="font-medium max-w-[150px] sm:max-w-[250px] truncate">
  {item.youtube_title || item.topic}
</TableCell>
```
Same pattern applied to `UnscheduledTab`, `ScheduledTab`, and `PastTab`.

### CreateContent.tsx -- Always trigger generation
Remove the conditional `if (videoStoragePath && imageStoragePath)` guard around the `generate-content` call, so it always fires after the content row and any media uploads are complete.

```tsx
// Always call generate-content (works with topic-only)
const { error: genError } = await supabase.functions.invoke("generate-content", {
  body: { contentId },
});
if (genError) {
  toast({ title: "Generation failed", description: genError.message, variant: "destructive" });
}
```

### IncompleteTab.tsx -- Also trigger generation after both media uploaded
The existing logic in `handleMediaUpload` already calls `generate-content` when both media are present. However, since we now generate text on creation, this second call would re-generate. We should keep it as-is -- it acts as a "regenerate" when media is finally complete, which is fine.

### Summary of files to edit:
- `src/pages/CreateContent.tsx` -- remove media guard on generation call
- `src/components/schedule/IncompleteTab.tsx` -- fix dialog text, show youtube_title
- `src/components/schedule/UnscheduledTab.tsx` -- show youtube_title
- `src/components/schedule/ScheduledTab.tsx` -- show youtube_title
- `src/components/schedule/PastTab.tsx` -- show youtube_title
