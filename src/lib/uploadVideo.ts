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
    const {
      data: { session },
    } = await supabase.auth.getSession();

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

    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}
