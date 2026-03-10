import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useIdeas, useCreateIdea, useBulkCreateIdeas, useDeleteIdeas, useUpdateIdea } from "@/hooks/useIdeas";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Plus, Upload, Sparkles, Trash2, Pencil } from "lucide-react";
import type { TablesInsert, Tables } from "@/integrations/supabase/types";
import { IdeaFormDialog, type IdeaFormValues } from "@/components/ideas/IdeaFormDialog";

const CSV_COLUMNS = ["topic", "category", "avatar", "length", "planned_date"];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let cells: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current.trim());
        current = "";
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        if (ch === '\r') i++; // skip \n after \r
        cells.push(current.trim());
        if (cells.some((c) => c !== "")) rows.push(cells);
        cells = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
  // flush last row
  cells.push(current.trim());
  if (cells.some((c) => c !== "")) rows.push(cells);

  return rows;
}

function ideaToFormValues(idea: Tables<"content_ideas">): IdeaFormValues {
  return {
    topic: idea.topic || "",
    avatar: idea.avatar || "",
    category: idea.category || "",
    length: (idea.length as "Short" | "Long" | "Both") || "Both",
    plannedDate: idea.planned_date ? new Date(idea.planned_date) : undefined,
  };
}

export default function Ideas() {
  const { user } = useAuth();
  const { data: ideas = [], isLoading } = useIdeas();
  const createIdea = useCreateIdea();
  const bulkCreate = useBulkCreateIdeas();
  const deleteIdeas = useDeleteIdeas();
  const updateIdea = useUpdateIdea();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Tables<"content_ideas"> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === ideas.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ideas.map((i) => i.id)));
    }
  };

  const handleAddIdea = async (values: IdeaFormValues) => {
    try {
      await createIdea.mutateAsync({
        topic: values.topic.trim(),
        avatar: values.avatar || null,
        category: values.category || null,
        length: values.length,
        planned_date: values.plannedDate ? values.plannedDate.toISOString() : null,
      });
      toast({ title: "Idea added" });
      setAddDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add idea", description: err.message, variant: "destructive" });
    }
  };

  const handleEditIdea = async (values: IdeaFormValues) => {
    if (!editingIdea) return;
    try {
      await updateIdea.mutateAsync({
        id: editingIdea.id,
        topic: values.topic.trim(),
        avatar: values.avatar || null,
        category: values.category || null,
        length: values.length,
        planned_date: values.plannedDate ? values.plannedDate.toISOString() : null,
      });
      toast({ title: "Idea updated" });
      setEditingIdea(null);
    } catch (err: any) {
      toast({ title: "Failed to update idea", description: err.message, variant: "destructive" });
    }
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      toast({ title: "CSV is empty", variant: "destructive" });
      return;
    }
    const headers = rows[0].map((h) => h.toLowerCase());
    const missing = CSV_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      toast({
        title: "CSV column mismatch",
        description: `Expected columns: ${CSV_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}`,
        variant: "destructive",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const colIdx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, headers.indexOf(c)]));
    const inserts: TablesInsert<"content_ideas">[] = [];
    let invalidDateCount = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < CSV_COLUMNS.length) continue;
      const t = r[colIdx.topic]?.trim();
      if (!t) continue;
      const len = r[colIdx.length]?.trim();
      const parsedLen = len === "Short" ? "Short" : len === "Long" ? "Long" : "Both";
      const rawDate = r[colIdx.planned_date]?.trim() || null;
      let validDate: string | null = null;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          validDate = d.toISOString();
        } else {
          invalidDateCount++;
        }
      }
      inserts.push({
        topic: t,
        category: r[colIdx.category]?.trim() || null,
        avatar: r[colIdx.avatar]?.trim() || null,
        length: parsedLen as any,
        planned_date: validDate,
      });
    }
    if (inserts.length === 0) {
      toast({ title: "No valid rows found", variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      await bulkCreate.mutateAsync(inserts);
      toast({ title: `${inserts.length} ideas imported` });
    } catch (err: any) {
      toast({ title: "CSV import failed", description: err.message, variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleGenerate = async () => {
    if (!user || selected.size === 0) return;
    const selectedIdeas = ideas.filter((i) => selected.has(i.id));
    setGenerating(true);

    const totalJobs = selectedIdeas.reduce((sum, idea) => sum + (idea.length === "Both" ? 2 : 1), 0);
    let completedJobs = 0;
    setGenProgress({ current: 0, total: totalJobs });

    const successfulIdeaIds: number[] = [];

    for (const idea of selectedIdeas) {
      const lengths: Array<"Short" | "Long"> = idea.length === "Both" ? ["Long", "Short"] : [(idea.length || "Long") as "Short" | "Long"];
      let ideaSuccess = true;

      for (const len of lengths) {
        completedJobs++;
        setGenProgress({ current: completedJobs, total: totalJobs });

        const { data: content, error: insertErr } = await supabase
          .from("social_content")
          .insert({
            topic: idea.topic || "Untitled",
            post_length: len,
            user_id: user.id,
            status: "incomplete" as const,
          })
          .select()
          .single();

        if (insertErr || !content) {
          toast({ title: `Failed to create content for "${idea.topic?.slice(0, 40)}"`, description: insertErr?.message, variant: "destructive" });
          ideaSuccess = false;
          continue;
        }

        const { error: genErr } = await supabase.functions.invoke("generate-content", {
          body: { contentId: content.id },
        });
        if (genErr) {
          toast({ title: `Generation failed for "${idea.topic?.slice(0, 40)}"`, description: genErr.message, variant: "destructive" });
          ideaSuccess = false;
        }
      }

      if (ideaSuccess) {
        successfulIdeaIds.push(idea.id);
      }
    }

    if (successfulIdeaIds.length > 0) {
      try {
        await deleteIdeas.mutateAsync(successfulIdeaIds);
      } catch {
        // Non-critical
      }
    }

    setGenerating(false);
    setSelected(new Set());
    toast({
      title: `Generated ${completedJobs} content items from ${selectedIdeas.length} ideas`,
      description: "View them in the content list.",
      action: (
        <a href="/content" className="underline font-medium">
          Go to Content
        </a>
      ),
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    try {
      await deleteIdeas.mutateAsync(Array.from(selected));
      setSelected(new Set());
      toast({ title: `${selected.size} ideas deleted` });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold tracking-tight">Content Ideas</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Add Idea
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          </div>
        </div>

        {/* Add Dialog */}
        <IdeaFormDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onSubmit={handleAddIdea}
          title="Add Content Idea"
          description="Fill in the details for a new content idea."
          submitLabel="Add Idea"
          isPending={createIdea.isPending}
        />

        {/* Edit Dialog */}
        <IdeaFormDialog
          open={!!editingIdea}
          onOpenChange={(open) => { if (!open) setEditingIdea(null); }}
          initialValues={editingIdea ? ideaToFormValues(editingIdea) : undefined}
          onSubmit={handleEditIdea}
          title="Edit Content Idea"
          description="Update the details for this content idea."
          submitLabel="Save Changes"
          isPending={updateIdea.isPending}
        />

        {/* Action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" className="gap-2" onClick={handleGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4" /> Generate Content
            </Button>
            <Button size="sm" variant="destructive" className="gap-2" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}

        {/* Generation progress */}
        {generating && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">
              Generating {genProgress.current} of {genProgress.total}...
            </p>
            <Progress value={(genProgress.current / genProgress.total) * 100} />
          </div>
        )}

        {/* Ideas table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : ideas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No ideas yet. Add one manually or upload a CSV.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selected.size === ideas.length && ideas.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Avatar</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Planned Date</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ideas.map((idea) => (
                  <TableRow key={idea.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(idea.id)}
                        onCheckedChange={() => toggleSelect(idea.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-medium">
                      {idea.topic || "—"}
                    </TableCell>
                    <TableCell>{idea.category || "—"}</TableCell>
                    <TableCell>{idea.avatar || "—"}</TableCell>
                    <TableCell>{idea.length || "—"}</TableCell>
                    <TableCell>
                      {idea.planned_date
                        ? format(new Date(idea.planned_date), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingIdea(idea)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
