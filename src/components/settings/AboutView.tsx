import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Save, RotateCcw } from "lucide-react";

const SCOPE = "channel_brief";

export function AboutView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");
  const [original, setOriginal] = useState("");

  const { data: row, isLoading } = useQuery({
    queryKey: ["user-content-instructions", user?.id, SCOPE],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_content_instructions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("scope", SCOPE)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: defaultRow } = useQuery({
    queryKey: ["content-instruction-defaults", SCOPE],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_instruction_defaults")
        .select("*")
        .eq("scope", SCOPE)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (row) {
      setInstruction(row.instruction);
      setOriginal(row.instruction);
    } else if (defaultRow && !row) {
      setInstruction(defaultRow.instruction);
      setOriginal("");
    }
  }, [row, defaultRow]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user) throw new Error("Not authenticated");
      if (row) {
        const { error } = await supabase
          .from("user_content_instructions")
          .update({ instruction: text, is_active: true })
          .eq("user_id", user.id)
          .eq("scope", SCOPE);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_content_instructions")
          .insert({ user_id: user.id, scope: SCOPE, instruction: text, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "I'll use this on every piece of content I write for you." });
      setOriginal(instruction);
      queryClient.invalidateQueries({ queryKey: ["user-content-instructions"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleRestore = () => {
    if (!defaultRow) {
      toast({ title: "No default available", variant: "destructive" });
      return;
    }
    setInstruction(defaultRow.instruction);
    saveMutation.mutate(defaultRow.instruction);
  };

  const isDirty = instruction !== original;
  const matchesDefault = defaultRow && instruction === defaultRow.instruction;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">About your channel / application</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell me everything — who you are, what you make, your audience, your tone, your rules. I use this on every piece of content I write for you.
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={20}
          className="font-mono text-sm leading-relaxed"
          placeholder="Describe your channel, audience, voice, topics you cover, things to avoid…"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{instruction.length.toLocaleString()} characters</span>
          {matchesDefault && <span>Currently matches the system default</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => saveMutation.mutate(instruction)}
          disabled={saveMutation.isPending || !isDirty}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          Save
        </Button>
        <Button
          variant="outline"
          onClick={handleRestore}
          disabled={saveMutation.isPending || !defaultRow || !!matchesDefault}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Restore default
        </Button>
      </div>
    </div>
  );
}
