
# Generate Signed Download URLs at Posting Time

## What's Happening Now

Make.com reads from the `posted_content` table. Right now, `video_url` is always null and `image` contains an R2 object key like `content/uuid/cover.png`. Neither is a downloadable URL, so Make.com can't fetch the files for YouTube upload.

## The Fix

When the `post-scheduled-content` edge function copies a row into `posted_content`, it will generate fresh signed R2 download URLs (1-hour TTL) and store them in `video_url` and a new `image_url` column. Since Make.com picks up and processes the row immediately, 1 hour is more than enough time.

## What Changes

### 1. Database: Add `image_url` column to `posted_content`

A new nullable text column to hold the signed image download URL. The existing `video_url` column (already present, currently null) will be used for the signed video URL.

### 2. Edge function: `post-scheduled-content`

Before inserting into `posted_content`, the function will:
- Check if `video_storage_path` exists on the row, and if so, generate a signed R2 GET URL (1-hour TTL)
- Check if `image` exists on the row, and if so, generate a signed R2 GET URL (1-hour TTL)
- Set `video_url` to the signed video URL
- Set `image_url` to the signed image URL
- Insert the row with these URLs populated

The signing uses the same `aws4fetch` pattern already used in `r2-read-url`. No new secrets needed -- R2 credentials are already configured.

### 3. Config: `supabase/config.toml`

No changes needed -- `post-scheduled-content` is already configured.

## What Does NOT Change

- `social_content` table -- untouched
- Frontend upload flow -- untouched
- R2 object keys stay stored as permanent references in `video_storage_path` and `image`
- No new edge functions
- No new secrets

## Make.com Usage After This

When Make.com reads a new row from `posted_content`:
- `video_url` will be a valid `https://` URL that returns the MP4 (valid for 1 hour)
- `image_url` will be a valid `https://` URL that returns the image (valid for 1 hour)
- Use "HTTP -> Get a file" with these URLs, then map the output into YouTube upload

## Files Changed

| File | Change |
|------|--------|
| Database migration | Add `image_url` column to `posted_content` |
| `supabase/functions/post-scheduled-content/index.ts` | Generate signed R2 URLs before inserting into `posted_content` |
