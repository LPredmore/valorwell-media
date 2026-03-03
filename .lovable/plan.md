

# YouTube Comment: End-to-End Fix

## Diagnosis Summary

There are three distinct gaps preventing `youtube_comment` from working correctly:

1. **UI gap**: `youtube_comment` is not in `CONTENT_FIELDS` in `src/lib/platforms.ts`, so it never renders as an editable card on the content detail page. Users cannot see, edit, or copy it.

2. **Data loss on posting**: The `post-scheduled-content` edge function copies rows from `social_content` to `posted_content` via a destructured spread. The `posted_content` table has no `youtube_comment` column, so even though the data exists in `social_content`, it is silently dropped during the insert. The comment-related tracking fields (`youtube_comment_status`, `youtube_comment_id`, `youtube_comment_posted_at`, `youtube_comment_error_detail`) are also absent.

3. **Comment status not visible**: The YouTube Status Panel in `ContentDetail.tsx` shows `youtube_status`, `youtube_video_id`, and `youtube_uploaded_at`, but has no rendering for the comment lifecycle fields that already exist in `social_content`.

## Technical Decision

**Do NOT add `youtube_comment` to `CONTENT_FIELDS`.** That constant drives the "Generated Content" card list, and `youtube_comment` is semantically different — it is a YouTube-specific operational field, not a cross-platform social copy field like `facebook_desc` or `linkedin_desc`. Mixing it in would break the conceptual model. Instead, render it as a standalone editable card in a dedicated "YouTube Comment" section, or more naturally, within the existing YouTube Status Panel area on `ContentDetail.tsx`.

For `posted_content`, add the five missing comment columns via a migration. This preserves the full record for historical auditing and lets the Past tab or any future reporting surface comment data.

## Changes

### 1. Database migration — add comment columns to `posted_content`

```sql
ALTER TABLE public.posted_content
  ADD COLUMN youtube_comment text,
  ADD COLUMN youtube_comment_status text,
  ADD COLUMN youtube_comment_id text,
  ADD COLUMN youtube_comment_posted_at timestamptz,
  ADD COLUMN youtube_comment_error_detail text;
```

No RLS changes needed — `posted_content` is already SELECT-only for users, INSERT/UPDATE restricted to service role.

### 2. `supabase/functions/post-scheduled-content/index.ts` — stop stripping comment fields

Currently the destructure explicitly drops YouTube fields:

```ts
const { id: _id, upload_at: _ua, youtube_status: _ys, youtube_video_id: _yv,
        youtube_error_detail: _ye, youtube_uploaded_at: _yu, video_size_bytes: _vs,
        ...rest } = row;
```

This strips `youtube_comment`, `youtube_comment_status`, etc. into `...rest` — but since `posted_content` lacked those columns, it failed silently. After the migration adds the columns, `...rest` will correctly carry them through. No code change needed here (the comment fields are already in `...rest` since they are not destructured out). The only fields dropped are the upload-pipeline fields (`youtube_status`, `youtube_video_id`, etc.) which is correct — those are transient job state, not archival data.

Actually, let me verify: `youtube_comment_status`, `youtube_comment_id`, `youtube_comment_posted_at`, and `youtube_comment_error_detail` are also in the spread `...rest` since they are not destructured out. So they will flow into `posted_content` automatically once the columns exist. Correct — no edge function change needed.

### 3. `src/pages/ContentDetail.tsx` — render youtube_comment as an editable card

Add a `ContentFieldCard` for `youtube_comment` after the YouTube Status Panel (or within the Generated Content section as a separate group). Also surface the comment lifecycle fields (`youtube_comment_status`, `youtube_comment_id`, `youtube_comment_posted_at`, `youtube_comment_error_detail`) inside the YouTube Status Panel grid, mirroring how `youtube_status` and `youtube_video_id` are already shown.

Specifically:
- Add a `ContentFieldCard` with `fieldKey="youtube_comment"` and `label="YouTube First Comment"` and `charTarget="≤300"` below the YouTube Status Panel or in the Generated Content section.
- Inside the YouTube Status Panel, add rows for: Comment Status (badge), Comment ID (link if present), Comment Posted At, and Comment Error (red box, same pattern as `youtube_error_detail`).

### 4. `src/hooks/useContents.ts` — ensure `SocialContent` type includes comment fields

The `SocialContent` type likely comes from the Supabase generated types. Since the fields already exist in `social_content`, they should already be in the type. The code uses `(content as any)` for many fields anyway, so this is low risk. No change needed unless the type is manually defined — in which case, add the five fields.

### Summary

| File | Change |
|------|--------|
| DB migration | Add 5 comment columns to `posted_content` |
| `src/pages/ContentDetail.tsx` | Add youtube_comment editable card + comment status fields in YouTube panel |
| No change needed | `post-scheduled-content` (comment fields already flow through `...rest`) |
| No change needed | `generate-content` (already generates and saves `youtube_comment`) |
| No change needed | `src/lib/platforms.ts` (youtube_comment is not a cross-platform field) |

