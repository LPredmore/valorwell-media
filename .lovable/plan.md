

## Add TikTok Status Tracking to posted_content

### Problem
Publer TikTok publishing results are only captured in Edge Function logs. If a TikTok post fails, there is no structured way to query, display, or debug failures without digging through log streams.

### Changes

#### 1. Database Migration
Add two columns to `posted_content`:

```sql
ALTER TABLE posted_content
  ADD COLUMN tiktok_status text DEFAULT NULL,
  ADD COLUMN tiktok_error text DEFAULT NULL;
```

- `tiktok_status`: values will be `'posted'`, `'failed'`, or `NULL` (not applicable / not a Short)
- `tiktok_error`: stores the error message from Publer when `tiktok_status = 'failed'`
- Both nullable with no default constraint, so existing rows and non-Short content are unaffected

#### 2. Edge Function Update
In `post-scheduled-content/index.ts`, after the Publer publish attempt for Shorts, write the result into the `posted_content` insert (or update the row after insert):

- On Publer success: set `tiktok_status = 'posted'`
- On Publer failure: set `tiktok_status = 'failed'`, `tiktok_error = <error message>`
- For non-Shorts or when Publer is not configured: leave both `NULL`

Since the Publer call happens *after* the `posted_content` insert in the current code, the simplest approach is to issue an `UPDATE` to `posted_content` (matched by `source_content_id`) after the Publer attempt completes, rather than restructuring the insert flow.

