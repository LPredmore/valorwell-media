

## Plan: Show only `post_title` in the Title column

The `ContentTable.tsx` currently displays `item.post_title || item.topic` (line 79), which falls back to `topic` when `post_title` is null.

**Change**: In `src/components/content/ContentTable.tsx`, line 79, replace:
```
{item.post_title || item.topic}
```
with:
```
{item.post_title || "Untitled"}
```

This ensures the Title column always shows `post_title`, with a neutral "Untitled" fallback for rows where content generation hasn't produced a title yet, rather than displaying the raw topic.

