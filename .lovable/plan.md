

# Fix Content Search

The search in `useContents.ts` line 48 filters only on `topic`, but the table displays `youtube_title || topic`. The fix is to use Supabase's `or` filter to match against both columns.

## Change

In `src/hooks/useContents.ts`, replace the single `ilike("topic", ...)` call with an `or` filter that checks both `topic` and `youtube_title`:

```ts
query = query.or(`topic.ilike.%${search}%,youtube_title.ilike.%${search}%`);
```

One line change, no other files affected.

