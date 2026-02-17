import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a video file to Cloudflare R2 via a presigned URL.
 * 1. Calls the r2-upload-url edge function to get a presigned PUT URL.
 * 2. Uploads the file directly to R2 using XMLHttpRequest for progress tracking.
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
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    console.error("[R2 Upload] No auth session found");
    throw new Error("Not authenticated");
  }

  // 1. Get presigned URL from edge function
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

  // 2. Upload directly to R2 with progress
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
