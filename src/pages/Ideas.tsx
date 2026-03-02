import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useIdeas, useCreateIdea, useBulkCreateIdeas, useDeleteIdeas } from "@/hooks/useIdeas";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, Plus, Upload, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";

const AVATAR_OPTIONS = ["Me", "Male Avatar", "Female Avatar"];
const CATEGORY_OPTIONS = ["The VA System", "Science & Psychology", "Home Life", "ValorWell's Mission", "Other"];
const CSV_COLUMNS = ["topic", "category", "avatar", "length", "planned_date"];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { cells.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

export default function Ideas() {
  const { user } = useAuth();
  const { data: ideas = [], isLoading } = useIdeas();
  const createIdea = useCreateIdea();
  const bulkCreate = useBulkCreateIdeas();
  const deleteIdeas = useDeleteIdeas();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [topic, setTopic] = useState("");
  const [avatar, setAvatar] = useState("");
  const [category, setCategory] = useState("");
  const [length, setLength] = useState<"Short" | "Long">("Long");
  const [plannedDate, setPlannedDate] = useState<Date | undefined>();

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

  const resetForm = () => {
    setTopic(""); setAvatar(""); setCategory(""); setLength("Long"); setPlannedDate(undefined);
  };

  const handleAddIdea = async () => {
    if (!topic.trim()) return;
    try {
      await createIdea.mutateAsync({
        topic: topic.trim(),
        avatar: avatar || null,
        category: category || null,
        length: length,
        planned_date: plannedDate ? plannedDate.toISOString() : null,
      });
      toast({ title: "Idea added" });
      resetForm();
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add idea", description: err.message, variant: "destructive" });
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
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < CSV_COLUMNS.length) continue;
      const t = r[colIdx.topic]?.trim();
      if (!t) continue;
      const len = r[colIdx.length]?.trim();
      inserts.push({
        topic: t,
        category: r[colIdx.category]?.trim() || null,
        avatar: r[colIdx.avatar]?.trim() || null,
        length: (len === "Short" ? "Short" : "Long") as "Short" | "Long",
        planned_date: r[colIdx.planned_date]?.trim() || null,
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
    setGenProgress({ current: 0, total: selectedIdeas.length });

    for (let idx = 0; idx < selectedIdeas.length; idx++) {
      const idea = selectedIdeas[idx];
      setGenProgress({ current: idx + 1, total: selectedIdeas.length });

      // 1. Insert into social_content
      const { data: content, error: insertErr } = await supabase
        .from("social_content")
        .insert({
          topic: idea.topic || "Untitled",
          post_length: idea.length,
          user_id: user.id,
          status: "incomplete" as const,
        })
        .select()
        .single();

      if (insertErr || !content) {
        toast({ title: `Failed to create content for "${idea.topic?.slice(0, 40)}"`, description: insertErr?.message, variant: "destructive" });
        continue;
      }

      // 2. Call generate-content
      const { error: genErr } = await supabase.functions.invoke("generate-content", {
        body: { contentId: content.id },
      });
      if (genErr) {
        toast({ title: `Generation failed for "${idea.topic?.slice(0, 40)}"`, description: genErr.message, variant: "destructive" });
      }
    }

    setGenerating(false);
    setSelected(new Set());
    toast({
      title: `Generated ${selectedIdeas.length} content items`,
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Add Idea
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Content Idea</DialogTitle>
                  <DialogDescription>Fill in the details for a new content idea.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Topic</Label>
                    <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Describe the content idea..." rows={4} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Avatar</Label>
                      <Select value={avatar} onValueChange={setAvatar}>
                        <SelectTrigger><SelectValue placeholder="Select avatar" /></SelectTrigger>
                        <SelectContent>
                          {AVATAR_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Length</Label>
                      <Select value={length} onValueChange={(v) => setLength(v as "Short" | "Long")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Short">Short</SelectItem>
                          <SelectItem value="Long">Long</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Planned Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !plannedDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {plannedDate ? format(plannedDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={plannedDate} onSelect={setPlannedDate} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddIdea} disabled={!topic.trim() || createIdea.isPending}>
                    {createIdea.isPending ? "Adding..." : "Add Idea"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button size="sm" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          </div>
        </div>

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
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Avatar</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Planned Date</TableHead>
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
