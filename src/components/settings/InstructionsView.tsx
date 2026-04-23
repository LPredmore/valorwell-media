import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Save, RotateCcw } from "lucide-react";

type UserInstruction = {
  user_id: string;
  scope: string;
  instruction: string;
  is_active: boolean;
  updated_at: string;
};

type DefaultInstruction = {
  scope: string;
  instruction: string;
  updated_at: string;
};

const SCOPE_LABELS: Record<string, string> = {
  global: "Global Instructions",
  channel_brief: "Channel Brief",
  post_title: "Post Title",
  youtube_title: "YouTube Title",
  youtube_desc: "YouTube Description",
  facebook_desc: "Facebook Caption",
  linkedin_desc: "LinkedIn Post",
  ig_tiktok_desc: "Instagram + TikTok Caption",
  hashtags: "Hashtag Rules",
  youtube_comment: "YouTube Comment",
  script_long: "Script (Long-Form Videos)",
  script_short: "Script (Short-Form Videos)",
  shorts_extraction: "Shorts Extraction Strategy",
};

function UserInstructionRow({
  row,
  defaultInstruction,
}: {
  row: UserInstruction;
  defaultInstruction: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState(row.instruction);
  const [isActive, setIsActive] = useState(row.is_active);

  const saveMutation = useMutation({
    mutationFn: async (payload: { instruction: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("user_content_instructions")
        .update({ instruction: payload.instruction, is_active: payload.is_active })
        .eq("user_id", row.user_id)
        .eq("scope", row.scope);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      queryClient.invalidateQueries({ queryKey: ["user-content-instructions"] });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleRestore = () => {
    if (defaultInstruction === undefined) {
      toast({ title: "No default available", variant: "destructive" });
      return;
    }
    setInstruction(defaultInstruction);
    saveMutation.mutate({ instruction: defaultInstruction, is_active: isActive });
  };

  const isDirty = instruction !== row.instruction || isActive !== row.is_active;
  const matchesDefault = defaultInstruction !== undefined && instruction === defaultInstruction;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{SCOPE_LABELS[row.scope] || row.scope}</span>
        <div className="flex items-center gap-3">
          {!matchesDefault && defaultInstruction !== undefined && (
            <span className="text-xs text-muted-foreground">customized</span>
          )}
          {row.scope !== "global" && (
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          )}
        </div>
      </div>
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={row.scope === "global" ? 8 : 4}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate({ instruction, is_active: isActive })}
          disabled={saveMutation.isPending || !isDirty}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRestore}
          disabled={saveMutation.isPending || matchesDefault || defaultInstruction === undefined}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restore default
        </Button>
      </div>
    </div>
  );
}

function DefaultInstructionRow({ row }: { row: DefaultInstruction }) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState(row.instruction);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("content_instruction_defaults")
        .update({ instruction })
        .eq("scope", row.scope);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Default saved",
        description: "Existing users keep their copy. New users (and 'Restore default') get this version.",
      });
      queryClient.invalidateQueries({ queryKey: ["content-instruction-defaults"] });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isDirty = instruction !== row.instruction;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{SCOPE_LABELS[row.scope] || row.scope}</span>
        <span className="text-xs text-muted-foreground">system default</span>
      </div>
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={row.scope === "global" ? 8 : 4}
      />
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !isDirty}
        className="gap-1.5"
      >
        <Save className="h-3.5 w-3.5" />
        Save default
      </Button>
    </div>
  );
}

export function InstructionsView() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [view, setView] = useState<"mine" | "defaults">("mine");

  const { data: userInstructions = [], isLoading: loadingUser } = useQuery({
    queryKey: ["user-content-instructions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_content_instructions")
        .select("*")
        .eq("user_id", user!.id)
        .order("scope");
      if (error) throw error;
      return data as UserInstruction[];
    },
    enabled: !!user,
  });

  const { data: defaults = [], isLoading: loadingDefaults } = useQuery({
    queryKey: ["content-instruction-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_instruction_defaults")
        .select("*")
        .order("scope");
      if (error) throw error;
      return data as DefaultInstruction[];
    },
    enabled: !!user,
  });

  const defaultsByScope: Record<string, string> = {};
  for (const d of defaults) defaultsByScope[d.scope] = d.instruction;

  const renderUserList = () => {
    if (loadingUser) {
      return (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }
    const globalRow = userInstructions.find((r) => r.scope === "global");
    const fieldRows = userInstructions.filter((r) => r.scope !== "global" && r.scope !== "channel_brief");
    return (
      <div className="space-y-10">
        {globalRow && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Global Instructions</h2>
            <UserInstructionRow row={globalRow} defaultInstruction={defaultsByScope[globalRow.scope]} />
          </section>
        )}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Field Instructions</h2>
          {fieldRows.map((row) => (
            <UserInstructionRow
              key={row.scope}
              row={row}
              defaultInstruction={defaultsByScope[row.scope]}
            />
          ))}
          {fieldRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No instructions found.</p>
          )}
        </section>
      </div>
    );
  };

  const renderDefaultsList = () => {
    if (loadingDefaults) {
      return (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }
    const globalRow = defaults.find((r) => r.scope === "global");
    const fieldRows = defaults.filter((r) => r.scope !== "global");
    return (
      <div className="space-y-10">
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Editing system defaults does <strong>not</strong> retroactively change existing users' instructions.
          Users only receive a new default value if they click <em>Restore default</em>, or when they sign up for the first time.
        </p>
        {globalRow && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Global Default</h2>
            <DefaultInstructionRow row={globalRow} />
          </section>
        )}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Field Defaults</h2>
          {fieldRows.map((row) => (
            <DefaultInstructionRow key={row.scope} row={row} />
          ))}
        </section>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Instructions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tune how I write for you across every field and platform.
          </p>
        </div>
        {isAdmin && (
          <Tabs value={view} onValueChange={(v) => setView(v as "mine" | "defaults")}>
            <TabsList>
              <TabsTrigger value="mine">My instructions</TabsTrigger>
              <TabsTrigger value="defaults">System defaults</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {view === "mine" || !isAdmin ? renderUserList() : renderDefaultsList()}
    </div>
  );
}
