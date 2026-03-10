import { supabase } from "@/integrations/supabase/client";

const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const CHUNK_TIMEOUT = 10 * 60 * 1000; // 10 minutes per chunk
const MAX_RETRIES = 3;

/**
 * Upload a video file to Cloudflare R2.
 * - Files under 100 MB: single presigned PUT.
 * - Files 100 MB+: S3-compatible multipart upload with 50 MB chunks.
 *
 * Both paths use XMLHttpRequest for real-time upload progress.
 */
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
    method: file.size >= MULTIPART_THRESHOLD ? "multipart" : "single-put",
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.error("[R2 Upload] No auth session found");
    throw new Error("Not authenticated");
  }

  if (file.size >= MULTIPART_THRESHOLD) {
    return multipartUpload(storagePath, file, onProgress);
  } else {
    return singlePutUpload(storagePath, file, onProgress);
  }
}

// ── XHR helper ──────────────────────────────────────────────────────

/**
 * Upload a blob to a presigned URL via XHR, with per-byte progress.
 * Returns the ETag header from the response (needed for multipart complete).
 */
function xhrPut(
  url: string,
  body: Blob,
  contentType: string | undefined,
  timeoutMs: number,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ status: number; etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = timeoutMs;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };

    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag");
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, etag });
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error(`Network error (status=${xhr.status})`));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload was aborted"));

    xhr.send(body);
  });
}

// ── Single PUT (files < 100 MB) ─────────────────────────────────────

async function singlePutUpload(
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  console.log("[R2 Upload] Using single PUT path");

  const { data, error } = await supabase.functions.invoke("r2-upload-url", {
    body: { storagePath, contentType: file.type },
  });

  if (error || !data?.uploadUrl) {
    console.error("[R2 Upload] Edge function failed", { error, data });
    throw new Error(error?.message ?? data?.error ?? "Failed to get upload URL");
  }

  await xhrPut(
    data.uploadUrl,
    file,
    file.type,
    600_000, // 10 minutes
    (loaded, total) => onProgress?.((loaded / total) * 100),
  );

  console.log("[R2 Upload] Single PUT succeeded");
}

// ── Multipart upload (files ≥ 100 MB) ───────────────────────────────

async function multipartUpload(
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const totalSize = file.size;
  const partCount = Math.ceil(totalSize / CHUNK_SIZE);
  console.log(`[R2 Multipart] Starting: ${partCount} parts, ${(totalSize / 1024 / 1024).toFixed(1)} MB total`);

  // 1. Start multipart upload
  const { data: startData, error: startError } = await supabase.functions.invoke("r2-multipart-upload", {
    body: { action: "start", storagePath, contentType: file.type, fileSize: totalSize },
  });

  if (startError || !startData?.uploadId) {
    console.error("[R2 Multipart] Start failed", { startError, startData });
    throw new Error(startError?.message ?? startData?.error ?? "Failed to start multipart upload");
  }

  const { uploadId, partUrls } = startData as {
    uploadId: string;
    partUrls: { partNumber: number; url: string }[];
  };
  console.log(`[R2 Multipart] Got uploadId=${uploadId}, ${partUrls.length} presigned URLs`);

  // 2. Upload each chunk with real-time progress via XHR
  const completedParts: { partNumber: number; etag: string }[] = [];
  let bytesCompleted = 0; // bytes from fully finished prior chunks

  try {
    for (const { partNumber, url } of partUrls) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = file.slice(start, end);
      const chunkSize = end - start;

      console.log(`[R2 Multipart] Uploading part ${partNumber}/${partCount} (${(chunkSize / 1024 / 1024).toFixed(1)} MB)`);

      let etag: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await xhrPut(
            url,
            chunk,
            undefined, // no Content-Type needed for part uploads
            CHUNK_TIMEOUT,
            (loaded) => {
              // Combine completed bytes from prior chunks + in-flight bytes from this chunk
              const totalUploaded = bytesCompleted + loaded;
              onProgress?.((totalUploaded / totalSize) * 100);
            },
          );

          etag = result.etag;
          if (!etag) {
            throw new Error("No ETag in response — check R2 CORS ExposeHeaders config");
          }

          console.log(`[R2 Multipart] Part ${partNumber} done (attempt ${attempt}), ETag=${etag}`);
          break; // success
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[R2 Multipart] Part ${partNumber} attempt ${attempt} failed: ${msg}`);

          if (attempt === MAX_RETRIES) {
            throw new Error(`Part ${partNumber} failed after ${MAX_RETRIES} attempts: ${msg}`);
          }

          // Exponential backoff: 2s, 4s, 8s
          await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
        }
      }

      completedParts.push({ partNumber, etag: etag! });
      bytesCompleted += chunkSize;
      onProgress?.((bytesCompleted / totalSize) * 100);
    }

    // 3. Complete
    console.log("[R2 Multipart] All parts uploaded, completing...");
    const { data: completeData, error: completeError } = await supabase.functions.invoke("r2-multipart-upload", {
      body: { action: "complete", storagePath, uploadId, parts: completedParts },
    });

    if (completeError || !completeData?.success) {
      console.error("[R2 Multipart] Complete failed", { completeError, completeData });
      throw new Error(completeError?.message ?? completeData?.error ?? "Failed to complete multipart upload");
    }

    console.log("[R2 Multipart] Upload completed successfully");
    onProgress?.(100);
  } catch (err) {
    // Abort on any permanent failure
    console.error("[R2 Multipart] Upload failed, aborting...", err);
    try {
      await supabase.functions.invoke("r2-multipart-upload", {
        body: { action: "abort", storagePath, uploadId },
      });
      console.log("[R2 Multipart] Abort succeeded");
    } catch (abortErr) {
      console.warn("[R2 Multipart] Abort also failed", abortErr);
    }
    throw err;
  }
}
