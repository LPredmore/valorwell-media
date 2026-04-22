import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LogEntry = {
  ts: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
};

interface ConnectFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  platform: string;
  onClosed?: () => void;
}

export function ConnectFlowDialog({
  open,
  onOpenChange,
  url,
  platform,
  onClosed,
}: ConnectFlowDialogProps) {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mode, setMode] = useState<"iframe" | "popup" | "blocked">("iframe");
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const log = (level: LogEntry["level"], message: string) => {
    setLogs((prev) => [
      ...prev,
      { ts: new Date().toLocaleTimeString(), level, message },
    ]);
  };

  // Reset state on open/close
  useEffect(() => {
    if (open) {
      setLogs([]);
      setIframeLoaded(false);
      setMode("iframe");
      if (url) log("info", `Generated connect URL for ${platform}`);
    } else {
      // cleanup on close
      if (popupPollRef.current) {
        clearInterval(popupPollRef.current);
        popupPollRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        try { popupRef.current.close(); } catch { /* ignore */ }
      }
      popupRef.current = null;
      onClosed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Iframe framing-block detection: if not loaded after 4s, fall back to popup
  useEffect(() => {
    if (!open || !url || mode !== "iframe") return;
    const timer = window.setTimeout(() => {
      if (!iframeLoaded) {
        log(
          "warn",
          "Iframe didn't load within 4s — provider likely blocks framing. Falling back to popup.",
        );
        setMode("blocked");
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [open, url, mode, iframeLoaded]);

  const openPopup = () => {
    if (!url) return;
    const w = 600;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      url,
      "uploadpost-connect",
      `width=${w},height=${h},left=${left},top=${top},noopener=no,noreferrer=no`,
    );
    if (!popup) {
      log("error", "Popup blocked by browser. Allow popups and try again.");
      toast({
        title: "Popup blocked",
        description: "Allow popups for this site and try again.",
        variant: "destructive",
      });
      return;
    }
    popupRef.current = popup;
    setMode("popup");
    log("success", "Popup window opened");

    // Poll until closed
    if (popupPollRef.current) clearInterval(popupPollRef.current);
    popupPollRef.current = window.setInterval(() => {
      if (popup.closed) {
        log("info", "Popup window closed by user");
        if (popupPollRef.current) {
          clearInterval(popupPollRef.current);
          popupPollRef.current = null;
        }
      }
    }, 500);
  };

  // Auto-open popup when iframe is detected as blocked
  useEffect(() => {
    if (mode === "blocked" && open && url) {
      openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open, url]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
    log("success", "Iframe loaded a page");
    // Try to read URL — will throw on cross-origin (expected)
    try {
      const href = iframeRef.current?.contentWindow?.location.href;
      if (href) log("info", `Iframe URL: ${href}`);
    } catch {
      log("info", "Iframe is on a cross-origin page (URL not readable, normal for OAuth)");
    }
  };

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "URL copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const openInNewTab = () => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    log("info", "Opened in new tab");
  };

  const reopenPopup = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
    } else {
      openPopup();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Connect {platform}</DialogTitle>
          <DialogDescription>
            Complete the connection in the embedded view. We'll log every event
            on the right so we can see exactly what happens.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
          {/* Left: iframe / popup status */}
          <div className="flex flex-col min-h-0 border-r">
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b text-xs">
              <Badge variant="outline" className="font-mono">
                {mode}
              </Badge>
              <div className="flex-1 truncate font-mono text-muted-foreground">
                {url ?? "—"}
              </div>
              <Button size="sm" variant="ghost" onClick={copyUrl} disabled={!url}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={openInNewTab} disabled={!url}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 bg-muted/20 relative">
              {mode === "iframe" && url && (
                <iframe
                  ref={iframeRef}
                  src={url}
                  onLoad={handleIframeLoad}
                  className="w-full h-full border-0"
                  title="Upload-Post connect"
                  sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                />
              )}
              {mode !== "iframe" && (
                <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      The provider doesn't allow embedding.
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      A popup window has been opened. Complete the flow there;
                      this panel will log when it closes.
                    </p>
                  </div>
                  <Button onClick={reopenPopup} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Re-open popup
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right: event log */}
          <div className="flex flex-col min-h-0 bg-background">
            <div className="px-4 py-2 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Event log
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1.5 font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">No events yet…</p>
                ) : (
                  logs.map((entry, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">
                        {entry.ts}
                      </span>
                      <span
                        className={
                          entry.level === "error"
                            ? "text-destructive"
                            : entry.level === "warn"
                              ? "text-yellow-500"
                              : entry.level === "success"
                                ? "text-primary"
                                : "text-foreground"
                        }
                      >
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
