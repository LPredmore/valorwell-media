
## Fix: Increase Global Upload Size Limit + Optimize Upload Endpoint

### Problem
Supabase has two file size limits. We increased the bucket-level limit to 5GB, but there is a **global file upload size limit** (set in the Supabase Dashboard) that overrides the bucket setting. This global limit is likely still at the default 50MB, which is why you're still getting the 413 "Maximum size exceeded" error.

### What You Need to Do (Manual Step)

1. Go to the Supabase Dashboard Storage Settings:
   **Settings > Storage > Global file size limit**
2. Increase the global limit to **5GB** (or higher if your plan supports it)

This cannot be done via code -- it must be changed in the dashboard.

### What I Will Change (Code)

**Update `src/lib/uploadVideo.ts`** to use the direct storage hostname for better large-file performance:

Change the endpoint from:
```
https://asjhkidpuhqodryczuth.supabase.co/storage/v1/upload/resumable
```
to:
```
https://asjhkidpuhqodryczuth.storage.supabase.co/storage/v1/upload/resumable
```

This is the recommended endpoint from the Supabase docs for uploading large files, as it bypasses the API gateway and connects directly to the storage server.

### Technical Details

- The global limit in the dashboard controls the maximum allowed `Upload-Length` header value
- The bucket-level `file_size_limit` (already set to 5GB) acts as a secondary check
- The direct storage hostname avoids potential proxy/gateway payload limits
