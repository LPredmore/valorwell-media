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
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Not authenticated");

  // 1. Get presigned URL from edge function
  const { data, error } = await supabase.functions.invoke("r2-upload-url", {
    body: { storagePath, contentType: file.type },
  });

  if (error || !data?.uploadUrl) {
    throw new Error(error?.message ?? data?.error ?? "Failed to get upload URL");
  }

  const uploadUrl: string = data.uploadUrl;

  // 2. Upload directly to R2 with progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
