import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (count: number, theme: string) => Promise<void>;
  isPending: boolean;
}

export function GenerateIdeasDialog({ open, onOpenChange, onSubmit, isPending }: Props) {
  const [count, setCount] = useState(10);
  const [theme, setTheme] = useState("");

  const handleSubmit = async () => {
    await onSubmit(count, theme.trim());
    setTheme("");
    setCount(10);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate viral Shorts ideas
          </DialogTitle>
          <DialogDescription>
            I'll invent short-form video topics tailored to your channel brief. Avoiding any recent topics you already have.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>How many ideas?</Label>
              <span className="text-sm font-medium tabular-nums">{count}</span>
            </div>
            <Slider
              value={[count]}
              onValueChange={(v) => setCount(v[0])}
              min={5}
              max={25}
              step={1}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="theme">Theme or angle (optional)</Label>
            <Input
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. holiday season, beginner tips, controversial takes"
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {isPending ? "Generating…" : `Generate ${count} ideas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
