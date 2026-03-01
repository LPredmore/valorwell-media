import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Idea = Tables<"content_ideas">;
type IdeaInsert = TablesInsert<"content_ideas">;

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
  return useMutation({
    mutationFn: async (idea: IdeaInsert) => {
      const { data, error } = await supabase
        .from("content_ideas")
        .insert(idea)
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
  return useMutation({
    mutationFn: async (ideas: IdeaInsert[]) => {
      const { data, error } = await supabase
        .from("content_ideas")
        .insert(ideas)
        .select();
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
