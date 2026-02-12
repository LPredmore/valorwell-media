import { useCallback, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutosave<T>(saveFn: (data: T) => Promise<void>, delay = 800) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<T | null>(null);

  const trigger = useCallback(
    (data: T) => {
      latestDataRef.current = data;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus("saving");

      timeoutRef.current = setTimeout(async () => {
        try {
          await saveFn(latestDataRef.current as T);
          setStatus("saved");
          setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
        } catch {
          setStatus("error");
        }
      }, delay);
    },
    [saveFn, delay]
  );

  return { trigger, status };
}
