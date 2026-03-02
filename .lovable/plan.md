
# Rename "Topic" Column Header to "Title"

## Change

In `src/pages/Ideas.tsx`, rename the table column header from "Topic" to "Title". The underlying data (`idea.topic`) stays the same -- this is purely a display label change.

## File to edit

**`src/pages/Ideas.tsx`** -- Change `<TableHead>Topic</TableHead>` to `<TableHead>Title</TableHead>` in the ideas table header row.
