import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

type Idea = Tables<"content_ideas">;
type IdeaInsert = TablesInsert<"content_ideas">;
type IdeaInsertInput = Omit<IdeaInsert, "user_id">;

export function useIdeas() {
  return useQuery({
    queryKey: ["content_ideas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_ideas")
        .select("*")
        .order("planned_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Idea[];
    },
  });
}

export function useCreateIdea() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (idea: IdeaInsertInput) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("content_ideas")
        .insert({ ...idea, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_ideas"] }),
  });
}

export function useBulkCreateIdeas() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ideas: IdeaInsertInput[]) => {
      if (!user) throw new Error("Not authenticated");
      const withUser = ideas.map((i) => ({ ...i, user_id: user.id }));
      const { data, error } = await supabase
        .from("content_ideas")
        .insert(withUser)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_ideas"] }),
  });
}

export function useUpdateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & TablesUpdate<"content_ideas">) => {
      const { data, error } = await supabase
        .from("content_ideas")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_ideas"] }),
  });
}

export function useDeleteIdeas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase
        .from("content_ideas")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_ideas"] }),
  });
}

export function useGenerateViralShortsIdeas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ count, theme }: { count: number; theme: string }) => {
      const { data, error } = await supabase.functions.invoke("generate-viral-shorts-ideas", {
        body: { count, theme },
      });
      if (error) {
        // Try to extract structured error from edge function response
        const ctx = (error as any).context;
        if (ctx?.body) {
          try {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) throw new Error(parsed.error);
          } catch (_) { /* fallthrough */ }
        }
        throw error;
      }
      return data as { count: number; ideas: Array<{ topic: string }> };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_ideas"] }),
  });
}
