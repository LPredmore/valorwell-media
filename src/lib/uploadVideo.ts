import { supabase } from "@/integrations/supabase/client";

const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const CHUNK_TIMEOUT = 10 * 60 * 1000; // 10 minutes per chunk
const MAX_RETRIES = 3;

/**
 * Upload a video file to Cloudflare R2.
 * - Files under 100 MB: single presigned PUT (existing path).
 * - Files 100 MB+: S3-compatible multipart upload with 50 MB chunks.
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

  const uploadUrl: string = data.uploadUrl;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.timeout = 600000; // 10 minutes

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log("[R2 Upload] Single PUT succeeded");
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error(`Network error (status=${xhr.status})`));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload was aborted"));

    xhr.send(file);
  });
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

  // 2. Upload each chunk
  const completedParts: { partNumber: number; etag: string }[] = [];
  let bytesUploaded = 0;

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
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT);

          const res = await fetch(url, {
            method: "PUT",
            body: chunk,
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}: ${body}`);
          }

          etag = res.headers.get("ETag");
          if (!etag) {
            // Some CORS configs strip ETag. Try lowercase.
            etag = res.headers.get("etag");
          }
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
      bytesUploaded += chunkSize;
      onProgress?.((bytesUploaded / totalSize) * 100);
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
