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
import {
  ExternalLink,
  Copy,
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LogEntry = {
  ts: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
};

type FlowStatus =
  | "idle"
  | "opening"
  | "open"
  | "blocked"
  | "closed"
  | "syncing"
  | "done"
  | "error";

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
  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<number | null>(null);
  const popupOpenedAtRef = useRef<number>(0);
  const autoOpenedRef = useRef(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<FlowStatus>("idle");

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
      setStatus("idle");
      autoOpenedRef.current = false;
      if (url) log("info", `Generated connect URL for ${platform}`);
    } else {
      // cleanup on close
      if (popupPollRef.current) {
        clearInterval(popupPollRef.current);
        popupPollRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          /* ignore */
        }
      }
      popupRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openPopup = () => {
    if (!url) return;
    const w = 600;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    setStatus("opening");
    log("info", "Opening popup window…");
    const popup = window.open(
      url,
      "uploadpost-connect",
      `width=${w},height=${h},left=${left},top=${top},noopener=no,noreferrer=no`,
    );
    if (!popup) {
      setStatus("blocked");
      log("error", "Popup blocked by browser. Allow popups and try again.");
      toast({
        title: "Popup blocked",
        description: "Allow popups for this site and click 'Re-open popup'.",
        variant: "destructive",
      });
      return;
    }
    popupRef.current = popup;
    popupOpenedAtRef.current = Date.now();
    setStatus("open");
    log("success", "Popup window opened");

    // Poll until closed
    if (popupPollRef.current) clearInterval(popupPollRef.current);
    popupPollRef.current = window.setInterval(() => {
      if (popup.closed) {
        const elapsed = Date.now() - popupOpenedAtRef.current;
        if (popupPollRef.current) {
          clearInterval(popupPollRef.current);
          popupPollRef.current = null;
        }
        // If it closed almost immediately, treat as blocked
        if (elapsed < 500) {
          setStatus("blocked");
          log(
            "error",
            "Popup closed immediately — likely blocked. Click 'Re-open popup'.",
          );
          return;
        }
        setStatus("syncing");
        log("info", "Popup closed — syncing connections…");
        try {
          onClosed?.();
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "Sync failed";
          setStatus("error");
          log("error", `Sync error: ${message}`);
          return;
        }
        // Mark as done; the parent's sync mutation will refresh state.
        setStatus("done");
        log("success", "Sync requested. Check Diagnostics for raw provider state.");
      }
    }, 500);
  };

  // Auto-open popup once the dialog is open and we have a URL
  useEffect(() => {
    if (!open || !url) return;
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

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
      log("info", "Focused existing popup");
    } else {
      openPopup();
    }
  };

  const statusLabel: Record<FlowStatus, string> = {
    idle: "idle",
    opening: "opening",
    open: "in progress",
    blocked: "blocked",
    closed: "closed",
    syncing: "syncing",
    done: "done",
    error: "error",
  };

  const statusVariant = (s: FlowStatus) => {
    if (s === "blocked" || s === "error") return "destructive" as const;
    if (s === "done") return "default" as const;
    return "outline" as const;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[70vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Connect {platform}</DialogTitle>
          <DialogDescription>
            A separate window has opened to complete the connection. We'll log
            every event on the right and sync your account when it closes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
          {/* Left: status panel */}
          <div className="flex flex-col min-h-0 border-r">
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b text-xs">
              <Badge variant={statusVariant(status)} className="font-mono">
                {statusLabel[status]}
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

            <div className="flex-1 min-h-0 bg-muted/20 flex items-center justify-center p-6">
              <div className="max-w-sm text-center space-y-4">
                {status === "open" || status === "opening" ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <div>
                      <p className="font-medium">Connection window is open</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Complete the {platform} connection in the popup.
                        We'll detect when you finish and sync automatically.
                      </p>
                    </div>
                  </>
                ) : status === "blocked" ? (
                  <>
                    <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
                    <div>
                      <p className="font-medium">Popup blocked</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your browser blocked the connection window. Allow
                        popups for this site, then click below.
                      </p>
                    </div>
                  </>
                ) : status === "syncing" ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    <div>
                      <p className="font-medium">Syncing connections…</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Reading the latest state from Upload-Post.
                      </p>
                    </div>
                  </>
                ) : status === "done" ? (
                  <>
                    <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
                    <div>
                      <p className="font-medium">Sync complete</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Close this dialog to see updated status, or check
                        Diagnostics if {platform} still shows as not connected.
                      </p>
                    </div>
                  </>
                ) : status === "error" ? (
                  <>
                    <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
                    <div>
                      <p className="font-medium">Something went wrong</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        See the event log on the right for details.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Preparing connection…
                    </p>
                  </>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <Button onClick={reopenPopup} className="gap-2" disabled={!url}>
                    <RefreshCw className="h-4 w-4" />
                    {status === "blocked" ? "Re-open popup" : "Re-open / focus popup"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openInNewTab}
                    className="gap-2"
                    disabled={!url}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in new tab instead
                  </Button>
                </div>
              </div>
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
