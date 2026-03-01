import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

type ContentInstruction = {
  id: number;
  scope: string;
  instruction: string;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};


const SCOPE_LABELS: Record<string, string> = {
  global: "Global Instructions",
  post_title: "Post Title",
  youtube_title: "YouTube Title",
  youtube_desc: "YouTube Description",
  facebook_desc: "Facebook Caption",
  linkedin_desc: "LinkedIn Post",
  ig_tiktok_desc: "Instagram + TikTok Caption",
  hashtags: "Hashtag Rules",
  youtube_comment: "YouTube Comment",
  script_long: "Long-Form Script",
  script_short: "Short-Form Script",
};

function ContentInstructionRow({ row }: { row: ContentInstruction }) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState(row.instruction);
  const [isActive, setIsActive] = useState(row.is_active);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("content_instructions")
        .update({ instruction, is_active: isActive } as any)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      queryClient.invalidateQueries({ queryKey: ["content-instructions"] });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{SCOPE_LABELS[row.scope] || row.scope}</span>
        {row.scope !== "global" && (
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        )}
      </div>
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={row.scope === "global" ? 8 : 4}
      />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5">
        <Save className="h-3.5 w-3.5" />
        Save
      </Button>
    </div>
  );
}


export default function Instructions() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  const { data: contentInstructions = [] } = useQuery({
    queryKey: ["content-instructions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_instructions")
        .select("*")
        .order("id");
      if (error) throw error;
      return data as unknown as ContentInstruction[];
    },
    enabled: isAdmin,
  });


  if (adminLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">Not authorized</p>
          <p className="text-sm text-muted-foreground">You need admin access to view this page.</p>
        </div>
      </AppLayout>
    );
  }

  const globalInstruction = contentInstructions.find((r) => r.scope === "global");
  const fieldInstructions = contentInstructions.filter((r) => r.scope !== "global");

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Instructions</h1>

        {/* Global Instructions */}
        {globalInstruction && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Global Instructions</h2>
            <ContentInstructionRow row={globalInstruction} />
          </section>
        )}

        {/* Field Instructions */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Field Instructions</h2>
          {fieldInstructions.map((row) => (
            <ContentInstructionRow key={row.id} row={row} />
          ))}
          {fieldInstructions.length === 0 && (
            <p className="text-sm text-muted-foreground">No field instructions configured.</p>
          )}
        </section>

      </div>
    </AppLayout>
  );
}
