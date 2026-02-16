

# Make "Add Video" More Discoverable

## Problem
After creating a post with just a topic and image, there's no obvious way to add a video. The video uploader exists on the content detail page (`/content/:id`), but there's no visible "Edit" or "Add Video" button on the content list or schedule pages to guide users there.

## Solution
Add a visible "Edit" button to the content list table rows so it's clear you can click through to add missing media. Also, on the Schedule "Incomplete" tab, surface a clearer call-to-action.

### 1. Content Table -- Add Edit Button (src/components/content/ContentTable.tsx)
- Add a small "Edit" or pencil icon button in each row (next to the delete button) that navigates to `/content/:id`.
- While the row itself is already clickable, an explicit button makes the action discoverable, especially on mobile where "click row to edit" isn't intuitive.

### 2. Content Detail Page -- Already Complete
- The `/content/:id` page already shows the `VideoSection` component with a drag-and-drop uploader.
- No changes needed here -- once users know to click into a post, they can add video.

### 3. Schedule Incomplete Tab -- Show "Edit" alongside "Upload Media"
- In the Incomplete tab, add a secondary action (e.g., a link/button) on each row that navigates to the full content detail page at `/content/:id`, so users can add video (or image) from the detail view as an alternative to the dialog.

## Technical Details

### ContentTable.tsx -- Add edit button
```tsx
<TableCell className="flex items-center gap-1">
  <Button
    variant="ghost"
    size="icon"
    className="text-muted-foreground hover:text-primary"
    onClick={(e) => { e.stopPropagation(); navigate(`/content/${item.id}`); }}
  >
    <Pencil className="h-4 w-4" />
  </Button>
  {/* existing delete button */}
</TableCell>
```

### IncompleteTab.tsx -- Add "Edit" link
Add a small edit/pencil button in each row that links to `/content/:id`, giving users a way to go to the full editor where the video uploader lives.

### Files to edit:
- `src/components/content/ContentTable.tsx` -- add Edit button column
- `src/components/schedule/IncompleteTab.tsx` -- add Edit link per row

