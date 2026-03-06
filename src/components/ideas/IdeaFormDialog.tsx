import { useState, useEffect, useCallback } from "react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_OPTIONS = ["Me", "Male Avatar", "Female Avatar"];
const CATEGORY_OPTIONS = ["The VA System", "Science & Psychology", "Home Life", "ValorWell's Mission", "Other"];

export interface IdeaFormValues {
  topic: string;
  avatar: string;
  category: string;
  length: "Short" | "Long" | "Both";
  plannedDate: Date | undefined;
}

interface IdeaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: IdeaFormValues;
  onSubmit: (values: IdeaFormValues) => Promise<void>;
  title: string;
  description?: string;
  submitLabel: string;
  isPending: boolean;
}

const defaultValues: IdeaFormValues = {
  topic: "",
  avatar: "",
  category: "",
  length: "Both",
  plannedDate: undefined,
};

export function IdeaFormDialog({
  open, onOpenChange, initialValues, onSubmit, title, description, submitLabel, isPending,
}: IdeaFormDialogProps) {
  const [topic, setTopic] = useState("");
  const [avatar, setAvatar] = useState("");
  const [category, setCategory] = useState("");
  const [length, setLength] = useState<"Short" | "Long" | "Both">("Both");
  const [plannedDate, setPlannedDate] = useState<Date | undefined>();

  const handleSpeechResult = useCallback((text: string) => {
    setTopic((prev) => (prev ? prev + " " + text : text));
  }, []);

  const { isListening, isSupported, startListening, stopListening } = useSpeechToText(handleSpeechResult);

  // Sync form when dialog opens or initialValues change
  useEffect(() => {
    if (open) {
      const vals = initialValues ?? defaultValues;
      setTopic(vals.topic);
      setAvatar(vals.avatar);
      setCategory(vals.category);
      setLength(vals.length);
      setPlannedDate(vals.plannedDate);
    } else {
      stopListening();
    }
  }, [open, initialValues, stopListening]);

  const handleSubmit = async () => {
    if (!topic.trim()) return;
    stopListening();
    await onSubmit({ topic, avatar, category, length, plannedDate });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Topic</Label>
            <div className="relative">
              <Textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe the content idea..."
                rows={4}
                className="pr-12"
              />
              {isSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "absolute bottom-2 right-2 h-8 w-8 rounded-full",
                    isListening && "text-destructive animate-pulse"
                  )}
                  onClick={isListening ? stopListening : startListening}
                  title={isListening ? "Stop recording" : "Start voice input"}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
            </div>
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
              <Select value={length} onValueChange={(v) => setLength(v as "Short" | "Long" | "Both")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Both">Both</SelectItem>
                  <SelectItem value="Long">Long</SelectItem>
                  <SelectItem value="Short">Short</SelectItem>
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
          <Button onClick={handleSubmit} disabled={!topic.trim() || isPending}>
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
