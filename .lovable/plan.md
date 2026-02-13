

## Fix Video Upload Size Limit

### Problem
The Supabase Storage bucket `content-media` uses the default 50MB file size limit. Hour-long videos easily exceed this, causing the "Payload too large" error you're seeing.

### Solution (Two Parts)

**Part 1: Increase the storage bucket file size limit**

Run a SQL migration to set the `content-media` bucket's file size limit to 5GB (5,368,709,120 bytes). This accommodates hour-long videos in most formats.

**Part 2: Switch to TUS resumable uploads**

The current code uploads videos in a single request, which is unreliable for large files (browser timeouts, network interruptions). We'll switch to the TUS (resumable upload) protocol which:
- Splits the file into 6MB chunks
- Automatically retries failed chunks
- Can resume interrupted uploads
- Reports real upload progress

### What Changes

1. **Install `tus-js-client`** -- the library that implements the TUS protocol

2. **New file: `src/lib/uploadVideo.ts`** -- a reusable helper that:
   - Gets the current auth session token
   - Creates a TUS upload to the Supabase Storage resumable endpoint
   - Uses 6MB chunks (required by Supabase)
   - Reports progress via a callback
   - Returns a Promise that resolves when upload completes
   - Supports upsert (replacing existing videos)

3. **Update `src/pages/CreateJob.tsx`** -- replace the single `supabase.storage.upload()` call with the new TUS upload helper, wiring up the progress callback to show real upload percentage

4. **Update `src/pages/JobDetail.tsx`** -- same change for the "replace video" flow

5. **SQL migration** -- increase the bucket file size limit:
   ```sql
   UPDATE storage.buckets
   SET file_size_limit = 5368709120
   WHERE id = 'content-media';
   ```

### Technical Details

The TUS upload helper will look like:

```typescript
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = "asjhkidpuhqodryczuth";

export function uploadVideoResumable(
  bucketName: string,
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return reject(new Error("Not authenticated"));

    const upload = new tus.Upload(file, {
      endpoint: `https://${PROJECT_ID}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // 6MB required by Supabase
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.((bytesUploaded / bytesTotal) * 100);
      },
      onSuccess: () => resolve(),
    });

    // Check for previous incomplete uploads to resume
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}
```

Both `CreateJob` and `JobDetail` will call this instead of `supabase.storage.from(...).upload(...)`, giving real progress tracking and reliable uploads for files of any size.

