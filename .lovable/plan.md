

# Rename "Topic" to "Title" in Content Table

## Change

Update the Content List page and ContentTable component to display `youtube_title` instead of `topic`, and rename the column header from "Topic" to "Title".

## Files to Edit

### `src/components/content/ContentTable.tsx`
- Change the column header from "Topic" to "Title"
- Change the cell value from `item.topic` to `item.youtube_title || item.topic` (fallback to topic if no title exists)

### `src/pages/ContentList.tsx`
- Update the search input placeholder from "Search by topic..." to "Search by title..."

