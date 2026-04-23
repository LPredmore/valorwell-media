import { useState, useRef } from "react";
import { useIdeas, useCreateIdea, useBulkCreateIdeas, useDeleteIdeas, useUpdateIdea, useGenerateViralShortsIdeas } from "@/hooks/useIdeas";
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
import { Plus, Upload, Sparkles, Trash2, Pencil, Wand2 } from "lucide-react";
import type { TablesInsert, Tables } from "@/integrations/supabase/types";
import { IdeaFormDialog, type IdeaFormValues } from "@/components/ideas/IdeaFormDialog";
import { GenerateIdeasDialog } from "@/components/ideas/GenerateIdeasDialog";

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
        if (ch === '\r') i++;
        cells.push(current.trim());
        if (cells.some((c) => c !== "")) rows.push(cells);
        cells = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
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

export function IdeasView() {
  const { user } = useAuth();
  const { data: ideas = [], isLoading } = useIdeas();
  const createIdea = useCreateIdea();
  const bulkCreate = useBulkCreateIdeas();
  const deleteIdeas = useDeleteIdeas();
  const updateIdea = useUpdateIdea();
  const generateIdeas = useGenerateViralShortsIdeas();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
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
    const inserts: Omit<TablesInsert<"content_ideas">, "user_id">[] = [];
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
      const dateWarning = invalidDateCount > 0 ? ` (${invalidDateCount} invalid dates were cleared)` : "";
      toast({ title: `${inserts.length} ideas imported${dateWarning}` });
    } catch (err: any) {
      toast({ title: "CSV import failed", description: err.message, variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleGenerate = async () => {
    if (!user || selected.size === 0) return;
    const selectedIdeas = ideas.filter((i) => selected.has(i.id));
    setGenerating(true);

    const initialTotalJobs = selectedIdeas.reduce((sum, idea) => {
      if (idea.length === "Both") return sum + 2;
      return sum + 1;
    }, 0);
    let completedJobs = 0;
    let totalJobs = initialTotalJobs;
    setGenProgress({ current: 0, total: totalJobs });

    const successfulIdeaIds: number[] = [];
    let totalCreated = 0;

    for (const idea of selectedIdeas) {
      let ideaSuccess = true;

      if (idea.length === "Both") {
        const { data: longContent, error: longInsertErr } = await supabase
          .from("social_content")
          .insert({
            topic: idea.topic || "Untitled",
            post_length: "Long" as const,
            user_id: user.id,
            status: "incomplete" as const,
            planned_date: idea.planned_date || null,
          })
          .select()
          .single();

        if (longInsertErr || !longContent) {
          toast({ title: `Failed to create Long content for "${idea.topic?.slice(0, 40)}"`, description: longInsertErr?.message, variant: "destructive" });
          ideaSuccess = false;
        } else {
          const { error: genErr } = await supabase.functions.invoke("generate-content", {
            body: { contentId: longContent.id },
          });
          if (genErr) {
            toast({ title: `Long generation failed for "${idea.topic?.slice(0, 40)}"`, description: genErr.message, variant: "destructive" });
            ideaSuccess = false;
          } else {
            totalCreated++;
            completedJobs++;
            setGenProgress({ current: completedJobs, total: totalJobs });

            const { data: updatedLong } = await supabase
              .from("social_content")
              .select("script")
              .eq("id", longContent.id)
              .single();

            const longScript = updatedLong?.script;

            if (longScript) {
              completedJobs++;
              setGenProgress({ current: completedJobs, total: totalJobs });

              const { data: extractData, error: extractErr } = await supabase.functions.invoke("extract-shorts", {
                body: { longScript, topic: idea.topic || "Untitled" },
              });

              if (extractErr || !extractData?.shorts) {
                toast({ title: `Shorts extraction failed for "${idea.topic?.slice(0, 40)}"`, description: extractErr?.message || "No shorts returned", variant: "destructive" });
                ideaSuccess = false;
              } else {
                const shorts = extractData.shorts as Array<{ title: string; script: string }>;
                totalJobs = totalJobs + shorts.length;
                setGenProgress({ current: completedJobs, total: totalJobs });

                for (let i = 0; i < shorts.length; i++) {
                  const short = shorts[i];

                  const { data: shortContent, error: shortInsertErr } = await supabase
                    .from("social_content")
                    .insert({
                      topic: idea.topic || "Untitled",
                      post_length: "Short" as const,
                      user_id: user.id,
                      status: "incomplete" as const,
                      planned_date: idea.planned_date || null,
                      script: short.script,
                      parent_content_id: longContent.id,
                    })
                    .select()
                    .single();

                  if (shortInsertErr || !shortContent) {
                    toast({ title: `Failed to create Short ${i + 1} for "${idea.topic?.slice(0, 40)}"`, description: shortInsertErr?.message, variant: "destructive" });
                    ideaSuccess = false;
                    continue;
                  }

                  const { error: shortGenErr } = await supabase.functions.invoke("generate-content", {
                    body: { contentId: shortContent.id, skipScript: true },
                  });

                  if (shortGenErr) {
                    toast({ title: `Short ${i + 1} generation failed for "${idea.topic?.slice(0, 40)}"`, description: shortGenErr.message, variant: "destructive" });
                    ideaSuccess = false;
                  } else {
                    totalCreated++;
                  }

                  completedJobs++;
                  setGenProgress({ current: completedJobs, total: totalJobs });
                }
              }
            } else {
              ideaSuccess = false;
              completedJobs++;
              setGenProgress({ current: completedJobs, total: totalJobs });
            }
          }
        }
      } else {
        const len = (idea.length || "Long") as "Short" | "Long";

        const { data: content, error: insertErr } = await supabase
          .from("social_content")
          .insert({
            topic: idea.topic || "Untitled",
            post_length: len,
            user_id: user.id,
            status: "incomplete" as const,
            planned_date: idea.planned_date || null,
          })
          .select()
          .single();

        if (insertErr || !content) {
          toast({ title: `Failed to create content for "${idea.topic?.slice(0, 40)}"`, description: insertErr?.message, variant: "destructive" });
          ideaSuccess = false;
        } else {
          const { error: genErr } = await supabase.functions.invoke("generate-content", {
            body: { contentId: content.id },
          });
          if (genErr) {
            toast({ title: `Generation failed for "${idea.topic?.slice(0, 40)}"`, description: genErr.message, variant: "destructive" });
            ideaSuccess = false;
          } else {
            totalCreated++;
          }
        }

        completedJobs++;
        setGenProgress({ current: completedJobs, total: totalJobs });
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
      title: `Generated ${totalCreated} content items from ${selectedIdeas.length} ideas`,
      description: "View them in the content list.",
      action: (
        <a href="/schedule" className="underline font-medium">
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">General Ideas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Toss me topics and I'll spin them into full content packages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2" onClick={() => setGenerateDialogOpen(true)}>
            <Wand2 className="h-4 w-4" /> Generate Ideas
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Add Idea
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
        </div>
      </div>

      <GenerateIdeasDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        isPending={generateIdeas.isPending}
        onSubmit={async (count, theme) => {
          try {
            const result = await generateIdeas.mutateAsync({ count, theme });
            toast({ title: `Generated ${result.count} viral Shorts ideas` });
            setGenerateDialogOpen(false);
          } catch (err: any) {
            toast({ title: "Generation failed", description: err.message, variant: "destructive" });
          }
        }}
      />

      <IdeaFormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddIdea}
        title="Add Content Idea"
        description="Fill in the details for a new content idea."
        submitLabel="Add Idea"
        isPending={createIdea.isPending}
      />

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

      {generating && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">
            Generating {genProgress.current} of {genProgress.total}...
          </p>
          <Progress value={(genProgress.current / genProgress.total) * 100} />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No ideas yet — toss me a topic or upload a CSV and I'll get to work.</p>
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
  );
}
