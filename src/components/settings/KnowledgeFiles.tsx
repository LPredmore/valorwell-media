import { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const ACCEPTED_EXT = [".txt", ".md", ".docx"];
const ACCEPTED_MIME = [
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file

interface KnowledgeRow {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  error: string | null;
  is_active: boolean;
  created_at: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeFiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["user-knowledge-files", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_knowledge_files")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as KnowledgeRow[];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const rows = (query.state.data as KnowledgeRow[] | undefined) || [];
      return rows.some((f) => f.status === "pending" || f.status === "processing") ? 2000 : false;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("user_knowledge_files")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-knowledge-files"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (file: KnowledgeRow) => {
      // Delete from storage first (best effort), then DB
      await supabase.storage.from("content-media").remove([file.storage_path]);
      const { error } = await supabase
        .from("user_knowledge_files")
        .delete()
        .eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "File removed" });
      queryClient.invalidateQueries({ queryKey: ["user-knowledge-files"] });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || !user) return;
    const incoming = Array.from(fileList);
    setUploadingCount((c) => c + incoming.length);

    for (const file of incoming) {
      try {
        const lowerName = file.name.toLowerCase();
        const okExt = ACCEPTED_EXT.some((ext) => lowerName.endsWith(ext));
        const okMime = ACCEPTED_MIME.includes(file.type) || file.type === "" || file.type.startsWith("text/");
        if (!okExt || !okMime) {
          toast({ title: `Skipped ${file.name}`, description: "Only .txt, .md, .docx files are supported.", variant: "destructive" });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast({ title: `Skipped ${file.name}`, description: "File is larger than 5 MB.", variant: "destructive" });
          continue;
        }

        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const storagePath = `knowledge/${user.id}/${Date.now()}_${safeName}`;

        const { error: upErr } = await supabase.storage
          .from("content-media")
          .upload(storagePath, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw upErr;

        const { data: row, error: insErr } = await supabase
          .from("user_knowledge_files")
          .insert({
            user_id: user.id,
            file_name: file.name,
            storage_path: storagePath,
            mime_type: file.type || (lowerName.endsWith(".docx")
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "text/plain"),
            size_bytes: file.size,
            status: "pending",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        // Fire-and-forget extraction
        supabase.functions
          .invoke("extract-knowledge-file", { body: { fileId: row.id } })
          .then(({ error }) => {
            if (error) console.error("Extract invoke error:", error);
            queryClient.invalidateQueries({ queryKey: ["user-knowledge-files"] });
          });

        queryClient.invalidateQueries({ queryKey: ["user-knowledge-files"] });
      } catch (e: any) {
        toast({ title: `Upload failed: ${file.name}`, description: e.message, variant: "destructive" });
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold">Knowledge files</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Drop in .txt, .md, or .docx files (style guides, brand voice docs, FAQs). I'll read every active file alongside your brief on every generation.
          </p>
        </div>
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={uploadingCount > 0}
          className="gap-2 shrink-0"
        >
          {uploadingCount > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploadingCount > 0 ? `Uploading ${uploadingCount}…` : "Upload files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No knowledge files yet. Upload up to a few documents to give me deeper context.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium truncate">
                  <span className="truncate">{f.file_name}</span>
                  {f.status === "ready" && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
                  {(f.status === "pending" || f.status === "processing") && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                  )}
                  {f.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSize(f.size_bytes)} ·{" "}
                  {f.status === "ready"
                    ? "Ready"
                    : f.status === "processing"
                    ? "Extracting…"
                    : f.status === "pending"
                    ? "Queued…"
                    : f.status === "failed"
                    ? `Failed: ${f.error || "unknown error"}`
                    : f.status}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={f.is_active}
                    onCheckedChange={(v) => toggleActive.mutate({ id: f.id, is_active: v })}
                    disabled={f.status !== "ready"}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Remove "${f.file_name}"?`)) remove.mutate(f);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
