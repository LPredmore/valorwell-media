import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SocialContent } from "./useContents";

export function useContent(id: string | undefined) {
  return useQuery({
    queryKey: ["content", id],
    queryFn: async () => {
      if (!id) throw new Error("No content ID");
      const { data, error } = await supabase
        .from("social_content")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as SocialContent;
    },
    enabled: !!id,
  });
}
