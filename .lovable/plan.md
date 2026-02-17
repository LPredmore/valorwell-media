
# Add Thorough Diagnostic Logging to Video Upload Pipeline

## Why This Plan Exists

The video upload has failed multiple times and we have zero diagnostic data. The current code catches errors generically and shows a toast with no details. No console logs, no network details, no file metadata. This plan adds comprehensive logging at every step so the next failure gives us a clear answer.

## What Gets Logged (and Where)

### 1. `src/lib/uploadVideo.ts` -- The core upload function

Add `console.log` and `console.error` at every decision point:

- **Before calling the edge function:** Log file name, file size (bytes), file type, and the storagePath being requested
- **After the edge function responds:** Log whether it succeeded or failed, and if failed, log the full error object and response data
- **Before the XHR PUT:** Log the presigned URL (first 100 chars for security), content type header being set
- **XHR progress:** Already tracked via callback, no change needed
- **XHR onload (success):** Log status code and confirmation
- **XHR onload (failure):** Log status code, statusText, and responseText (the R2 error body, which is XML and will tell us exactly what went wrong -- e.g., "SignatureDoesNotMatch", "AccessDenied", "EntityTooLarge")
- **XHR onerror:** Log everything available -- the event itself, readyState, status, any responseText. This is the "Network error during upload" path that keeps firing, and right now it logs nothing
- **XHR ontimeout:** Add a timeout handler (currently missing entirely) with logging
- **XHR onabort:** Add an abort handler with logging

### 2. `src/pages/ContentDetail.tsx` -- handleVideoReplace

- **Before upload:** Log content ID, file name, file size, computed storagePath
- **After upload success:** Log confirmation before DB update
- **On catch:** Log the full error object (not just message) to console.error

### 3. `src/pages/CreateContent.tsx` -- handleSubmit video upload section

- **Before upload:** Log content ID, file name, file size
- **On catch:** Log the full error object to console.error

### 4. `src/components/content/ImageSection.tsx` -- handleImageUpload

- Same pattern: log before attempt, log full error on catch (currently only does `console.error("Image upload failed:", err)` which is okay but could include more context)

## Technical Details

### uploadVideo.ts -- Exact changes

```typescript
export async function uploadVideoToR2(
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  console.log("[R2 Upload] Starting upload", {
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    fileSizeHuman: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    fileType: file.type,
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error("[R2 Upload] No auth session found");
    throw new Error("Not authenticated");
  }

  console.log("[R2 Upload] Requesting presigned URL from edge function...");
  const { data, error } = await supabase.functions.invoke("r2-upload-url", {
    body: { storagePath, contentType: file.type },
  });

  if (error || !data?.uploadUrl) {
    console.error("[R2 Upload] Edge function failed", {
      error,
      data,
      errorMessage: error?.message,
    });
    throw new Error(error?.message ?? data?.error ?? "Failed to get upload URL");
  }

  const uploadUrl: string = data.uploadUrl;
  console.log("[R2 Upload] Got presigned URL", {
    urlPrefix: uploadUrl.substring(0, 100) + "...",
    urlLength: uploadUrl.length,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.timeout = 600000; // 10 minute timeout for large videos

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log("[R2 Upload] Upload succeeded", { status: xhr.status });
        resolve();
      } else {
        console.error("[R2 Upload] Upload failed with HTTP error", {
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText,
        });
        reject(new Error(
          `Upload failed: ${xhr.status} ${xhr.statusText} - ${xhr.responseText}`
        ));
      }
    };

    xhr.onerror = () => {
      console.error("[R2 Upload] XHR network error", {
        readyState: xhr.readyState,
        status: xhr.status,
        statusText: xhr.statusText,
        responseText: xhr.responseText,
        responseURL: xhr.responseURL,
      });
      reject(new Error(
        `Network error during upload (readyState=${xhr.readyState}, status=${xhr.status})`
      ));
    };

    xhr.ontimeout = () => {
      console.error("[R2 Upload] XHR timed out", {
        timeout: xhr.timeout,
        fileSize: file.size,
      });
      reject(new Error(`Upload timed out after ${xhr.timeout / 1000}s`));
    };

    xhr.onabort = () => {
      console.error("[R2 Upload] XHR was aborted");
      reject(new Error("Upload was aborted"));
    };

    console.log("[R2 Upload] Starting XHR PUT...");
    xhr.send(file);
  });
}
```

### ContentDetail.tsx -- handleVideoReplace changes

Add logging before the upload call and in the catch block:

```typescript
console.log("[ContentDetail] Starting video replace", {
  contentId: id,
  fileName: file.name,
  fileSize: file.size,
  fileSizeHuman: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
  storagePath,
});
// ... existing uploadVideoToR2 call ...
// In catch:
console.error("[ContentDetail] Video upload failed", uploadError);
```

### CreateContent.tsx -- handleSubmit video section

Same pattern: log before, log errors with full object.

### ImageSection.tsx -- handleImageUpload

Add file metadata logging before the upload attempt.

## Files to Edit

| File | Change |
|------|--------|
| `src/lib/uploadVideo.ts` | Add comprehensive logging at every step; add timeout/abort handlers |
| `src/pages/ContentDetail.tsx` | Add logging around handleVideoReplace |
| `src/pages/CreateContent.tsx` | Add logging around video upload in handleSubmit |
| `src/components/content/ImageSection.tsx` | Add file metadata logging |

## What Happens Next

After this is deployed, the next time the video upload fails, the browser console will contain a complete trace showing exactly which step failed and why. No more guessing. The logs will be automatically available when you send a message, so we'll be able to diagnose it immediately.
