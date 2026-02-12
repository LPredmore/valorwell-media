import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type PlatformInstruction = Tables<"platform_instructions">;
type ImageInstruction = Tables<"image_instructions">;

function PlatformRow({ row }: { row: PlatformInstruction }) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState(row.instruction);
  const [aspectRatio, setAspectRatio] = useState(row.preferred_aspect_ratio);
  const [isActive, setIsActive] = useState(row.is_active);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("platform_instructions")
        .update({ instruction, preferred_aspect_ratio: aspectRatio, is_active: isActive })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      queryClient.invalidateQueries({ queryKey: ["platform-instructions"] });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold capitalize">{row.component}</span>
          <span className="ml-2 text-xs text-muted-foreground">v{row.version}</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="9:16">9:16</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5">
        <Save className="h-3.5 w-3.5" />
        Save
      </Button>
    </div>
  );
}

function ImageRow({ row }: { row: ImageInstruction }) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState(row.instruction);
  const [isActive, setIsActive] = useState(row.is_active);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("image_instructions")
        .update({ instruction, is_active: isActive })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      queryClient.invalidateQueries({ queryKey: ["image-instructions"] });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{row.aspect_ratio}</span>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} />
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5">
        <Save className="h-3.5 w-3.5" />
        Save
      </Button>
    </div>
  );
}

export default function Instructions() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  const { data: platformInstructions = [] } = useQuery({
    queryKey: ["platform-instructions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_instructions")
        .select("*")
        .order("platform")
        .order("component");
      if (error) throw error;
      return data as PlatformInstruction[];
    },
    enabled: isAdmin,
  });

  const { data: imageInstructions = [] } = useQuery({
    queryKey: ["image-instructions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("image_instructions")
        .select("*")
        .order("aspect_ratio");
      if (error) throw error;
      return data as ImageInstruction[];
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

  // Group platform instructions by platform
  const grouped = platformInstructions.reduce<Record<string, PlatformInstruction[]>>((acc, row) => {
    if (!acc[row.platform]) acc[row.platform] = [];
    acc[row.platform].push(row);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Instructions</h1>

        {/* Platform Instructions */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold">Platform Instructions</h2>
          {Object.entries(grouped).map(([platform, rows]) => (
            <div key={platform} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {PLATFORMS[platform as PlatformKey]?.label || platform}
              </h3>
              {rows.map((row) => (
                <PlatformRow key={row.id} row={row} />
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <p className="text-sm text-muted-foreground">No platform instructions configured.</p>
          )}
        </section>

        {/* Image Instructions */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold">Image Instructions</h2>
          {imageInstructions.map((row) => (
            <ImageRow key={row.id} row={row} />
          ))}
          {imageInstructions.length === 0 && (
            <p className="text-sm text-muted-foreground">No image instructions configured.</p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
