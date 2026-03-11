

# Add Media Editing for Scheduled Content

## Current State

The **Scheduled tab** only lets you edit the schedule (date/time/playlist) via the pencil button or delete. There is no way to replace the image or video file from here.

However, the **Content Detail page** (`/content/:id`) already fully supports replacing both image and video for any content item, regardless of status. The `ImageSection` component has a "Replace Image" button and upload-from-scratch flow, and the `VideoSection` uses the `VideoUploader` component which supports replacing an existing video.

## Plan

**Add a "navigate to content detail" button** in `ScheduledTab.tsx`, exactly like the `IncompleteTab` already does. This reuses the existing, fully-functional media editing UI without duplicating code.

### Changes to `src/components/schedule/ScheduledTab.tsx`

1. Import `useNavigate` from react-router-dom and the `Pencil` icon is already imported (rename its usage).
2. In the action column for each row, add a button that navigates to `/content/${item.id}` so users can edit media (and anything else).
3. Keep the existing pencil (schedule edit) button but visually distinguish it -- rename the schedule-edit button's icon or add a tooltip. Use a dedicated icon like `CalendarDays` for "edit schedule" and keep `Pencil` for "edit content."

The action cell will have three buttons:
- **Pencil** icon -- navigates to `/content/:id` (edit content including media)
- **CalendarDays** icon -- opens the ScheduleDialog (edit date/time)
- **Trash** icon -- delete (existing)

This matches the pattern already used in `IncompleteTab` and avoids duplicating the upload media dialog.

