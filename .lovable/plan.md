

# Multipart Chunked Upload for Large Videos

## Decision: S3-compatible multipart upload with presigned part URLs

The right approach is S3 multipart upload, not increasing the timeout. Here's why:

- A single HTTP PUT for a 900MB file is inherently fragile regardless of timeout length. Any momentary network interruption kills the entire transfer and you start over.
- S3 multipart upload splits the file into independent chunks. Each chunk is its own HTTP request. If one fails, only that chunk retries -- not the whole file.
- R2 natively supports the S3 multipart API. This isn't a workaround; it's the intended way to upload large files.
- The existing architecture (presigned URLs, browser-direct-to-R2) stays the same. Chunks go browser-to-R2, not through the edge function.

## Architecture

```text
Browser                        Edge Function                   Cloudflare R2
  |                                 |                               |
  |-- POST {action:"start"} ------->|                               |
  |                                 |-- CreateMultipartUpload ------>|
  |                                 |<-- uploadId ------------------|
  |                                 |-- Sign presigned PUT URLs ---->|
  |<-- {uploadId, partUrls[]} ------|                               |
  |                                 |                               |
  |-- PUT chunk 1 (50MB) directly --------------------------------->|
  |<-- ETag 1 ------------------------------------------------------|
  |-- PUT chunk 2 (50MB) directly --------------------------------->|
  |<-- ETag 2 ------------------------------------------------------|
  |   ... repeat for all chunks ...                                 |
  |                                 |                               |
  |-- POST {action:"complete"} ---->|                               |
  |   {uploadId, parts:[{ETag,Num}]}|-- CompleteMultipartUpload --->|
  |                                 |<-- OK (file assembled) -------|
  |<-- {success: true} -------------|                               |
```

After `CompleteMultipartUpload`, R2 assembles all parts into a single object at the same key (`content/{id}/video.mp4`). The YouTube uploader, `r2-read-url`, and everything downstream sees a normal file. Nothing changes for them.

## What gets built

### 1. New edge function: `supabase/functions/r2-multipart-upload/index.ts`

Handles three actions via a single endpoint:

**`start`** -- Receives `storagePath` and `contentType`. Calls R2's `CreateMultipartUpload` via `aws4fetch`, then generates presigned PUT URLs for each part (caller provides `fileSize` and the function computes part count). Returns `uploadId` and array of presigned URLs with part numbers.

**`complete`** -- Receives `storagePath`, `uploadId`, and array of `{partNumber, etag}`. Calls R2's `CompleteMultipartUpload` with the XML body listing all parts. R2 assembles the file.

**`abort`** -- Receives `storagePath` and `uploadId`. Calls R2's `AbortMultipartUpload` to clean up partial uploads. Called on permanent failure or user cancellation.

Uses the same `aws4fetch` library and same R2 credentials (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) already configured as secrets.

### 2. Updated client: `src/lib/uploadVideo.ts`

The `uploadVideoToR2` function gets a size check:

- **Files under 100 MB**: Use the existing single PUT path (unchanged). Small files don't need multipart complexity.
- **Files 100 MB and above**: Use the new multipart path.

**Multipart upload flow in the client:**

1. Slice the file into 50 MB chunks (last chunk is whatever remains).
2. Call the edge function with `action: "start"`, passing `storagePath`, `contentType`, and `fileSize`.
3. Receive `uploadId` and an array of presigned PUT URLs.
4. Upload each chunk sequentially via `fetch()` PUT to its presigned URL. Each chunk gets a **10-minute timeout** via `AbortController` -- a 50 MB chunk at even 100 KB/s finishes in ~8.5 minutes, so 10 minutes is generous. On failure, retry that chunk up to 3 times with exponential backoff.
5. Collect the `ETag` response header from each successful chunk upload.
6. After all chunks succeed, call the edge function with `action: "complete"`, passing the `uploadId` and all `{partNumber, etag}` pairs.
7. If a chunk fails permanently (after 3 retries), call the edge function with `action: "abort"` to clean up, then throw an error.

**Progress tracking**: Progress = (completed chunks * chunk size + current chunk bytes sent) / total file size. This gives smooth, accurate progress even for multi-GB files.

**Logging**: All the diagnostic logging from the previous plan carries over. Each chunk logs its part number, size, attempt number, and any error details.

### 3. Config: `supabase/config.toml`

Add the new function entry:

```toml
[functions.r2-multipart-upload]
verify_jwt = false
```

### 4. No changes to these files

- `src/pages/ContentDetail.tsx` -- already calls `uploadVideoToR2`, which handles routing internally
- `src/pages/CreateContent.tsx` -- same, calls `uploadVideoToR2`
- `src/components/content/ImageSection.tsx` -- images are small, always uses single PUT
- `supabase/functions/r2-upload-url/index.ts` -- kept for small files
- `supabase/functions/r2-read-url/index.ts` -- unchanged, reads the assembled file
- Database schema -- unchanged
- YouTube upload pipeline -- unchanged, it reads the final assembled object

## Why 50 MB chunks and 10-minute per-chunk timeout

- **50 MB chunks**: S3 multipart requires minimum 5 MB per part (except the last). 50 MB balances between too many HTTP requests (overhead) and too large (fragile). A 5 GB file = 100 parts, well within S3's 10,000 part limit.
- **10-minute per-chunk timeout**: A 50 MB chunk at 100 KB/s (very slow connection) takes ~8.3 minutes. 10 minutes covers this with margin. This is not a global timeout -- it's per chunk. A 5 GB upload could theoretically run for 100 chunks x 10 minutes = 16+ hours on an extremely slow connection and still succeed.

## Why sequential uploads (not parallel)

Parallel chunk uploads would be faster but add complexity around browser connection limits, memory pressure (multiple 50 MB buffers), and harder progress tracking. Sequential is simpler, more reliable, and for a single user uploading one video at a time, the bottleneck is bandwidth, not concurrency.

## Files to create/edit

| File | Action |
|------|--------|
| `supabase/functions/r2-multipart-upload/index.ts` | Create new edge function |
| `src/lib/uploadVideo.ts` | Add multipart path, keep single PUT for small files |
| `supabase/config.toml` | Add `r2-multipart-upload` entry |

## R2 CORS requirement

R2 must expose the `ETag` header in CORS responses so the browser can read it after each chunk upload. The R2 bucket's CORS config needs `ExposeHeaders: ["ETag"]`. If this isn't already configured, chunk uploads will succeed but the client won't be able to read the ETag, and the complete step will fail. I'll note this after implementation so you can verify it in the Cloudflare dashboard.

