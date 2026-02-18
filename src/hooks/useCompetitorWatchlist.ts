import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CompetitorWatchlistEntry {
  id: string;
  name: string;
  facebook_page_id: string;
  facebook_page_name: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export function useCompetitorWatchlist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: competitors = [], isLoading, error } = useQuery({
    queryKey: ["competitor-watchlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_watchlist")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as CompetitorWatchlistEntry[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (entry: { name: string; facebook_page_id: string; notes?: string }) => {
      const { data, error } = await supabase
        .from("competitor_watchlist")
        .insert([{ ...entry, active: true }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-watchlist"] });
      toast({ title: "Competitor added", description: "Now tracking their Meta Ad Library activity." });
    },
    onError: (err) => {
      toast({ title: "Failed to add competitor", description: String(err), variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("competitor_watchlist")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-watchlist"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("competitor_watchlist")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["competitor-ad-library"] });
      toast({ title: "Competitor removed" });
    },
  });

  return {
    competitors,
    isLoading,
    error,
    addCompetitor: addMutation.mutate,
    isAdding: addMutation.isPending,
    toggleActive: toggleActiveMutation.mutate,
    deleteCompetitor: deleteMutation.mutate,
  };
}
