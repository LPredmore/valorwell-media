

# Fix: PostgREST Schema Cache Stale

## Diagnosis

The `social_content` table already has all required columns (`post_title`, `youtube_comment`, `youtube_title`, `facebook_desc`, etc.). The error `PGRST204` means PostgREST's internal schema cache is out of date — it doesn't know about columns added in recent migrations.

The edge function code itself is correct. Step 1 (script generation) succeeds because it writes to `script`, which PostgREST does have cached. Step 2 fails because it tries to write `post_title` and `youtube_comment`, which PostgREST hasn't picked up yet.

## Fix

**One migration** that sends the PostgREST reload signal:

```sql
NOTIFY pgrst, 'reload schema';
```

This forces PostgREST to re-read the database schema and pick up the columns it's missing from its cache.

**Then redeploy** the `generate-content` edge function (automatic on save) so the next invocation hits the refreshed cache.

No code changes needed. No new columns needed. Just the cache reload.

| Action | What |
|--------|------|
| DB migration | `NOTIFY pgrst, 'reload schema'` |
| Edge function | Redeploy `generate-content` (triggered automatically) |

