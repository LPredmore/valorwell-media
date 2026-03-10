

## Diagnosis

Two distinct problems cause the frozen progress bar:

1. **Multipart uploads use `fetch()`, which has no upload progress API.** The `fetch()` spec does not expose upload byte counts. Progress only updates after an entire 50MB chunk completes and the server responds. For a 143MB file on a typical home connection (10 Mbps up), each chunk takes ~40 seconds of dead silence.

2. **ContentDetail.tsx fakes the initial 20% and compresses real progress into a 20–70% band.** Line 93 immediately sets progress to 20 before any bytes leave the browser. The `onProgress` callback then maps 0–100% from the upload library into the 20–70% visual range (`20 + pct * 0.5`). So even if the upload library reported perfect granularity, the bar would only move across half its width for the actual upload.

The single-PUT path (files under 100MB) already uses `XMLHttpRequest` with `upload.onprogress` and works correctly. Only the multipart path is broken.

---

## Decision: Replace `fetch()` with `XMLHttpRequest` in the multipart chunker

**Why XHR and not ReadableStream/tus/a polling workaround:**

- `XMLHttpRequest.upload.onprogress` is the only browser API that gives real-time upload byte counts. It is universally supported, battle-tested, and already used in the single-PUT path of this same file.
- The Fetch API's `ReadableStream` request bodies can technically enable progress, but they are not supported in Safari and break presigned S3/R2 URLs because they force `Transfer-Encoding: chunked`, which R2 rejects on presigned PUTs.
- tus-js-client is already installed but would require a tus server — R2 doesn't speak tus. It's irrelevant here.
- Simulating progress with timers or polling is dishonest UI and doesn't solve the problem.

XHR is the correct, only viable tool for this job.

---

## Changes

### 1. `src/lib/uploadVideo.ts` — Replace `fetch()` with XHR in multipart loop

Replace the inner `fetch()` call (lines 133–141) with an XHR-based upload function that:
- Sends each chunk via `xhr.send(chunk)`
- Reports per-byte progress combining: bytes already completed from prior chunks + bytes in flight for the current chunk
- Keeps the existing retry logic, abort controller timeout, and ETag extraction
- Calls `onProgress((totalBytesUploaded / totalFileSize) * 100)` continuously, not just at chunk boundaries

This is a ~40-line rewrite of the inner loop body. The function signature, retry logic, start/complete/abort edge function calls, and error handling all stay the same.

### 2. `src/pages/ContentDetail.tsx` — Remove fake progress, use 0–100% directly

- **Delete line 93** (`setVideoProgress(20)`) — no more fake head start
- **Change line 108** from `setVideoProgress(20 + pct * 0.5)` to `setVideoProgress(pct)` — let the upload library own the full 0–100% range
- After upload succeeds and the DB update runs, set to 100%

### 3. `src/components/jobs/VideoUploader.tsx` — Add status text

Below the progress bar, show contextual text: file size being uploaded and "Uploading..." so the user has confirmation the process is active even during brief stalls between chunks.

### Files changed
- `src/lib/uploadVideo.ts`
- `src/pages/ContentDetail.tsx`
- `src/components/jobs/VideoUploader.tsx`

No database, edge function, or dependency changes required.

