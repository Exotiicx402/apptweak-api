import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Schedule {
  id: number;
  name: string;
  schedule: string;
  scheduleDisplay: string;
  active: boolean;
}

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: async (): Promise<Schedule[]> => {
      const { data, error } = await supabase.functions.invoke("manage-schedules", {
        method: "GET",
      });

      if (error) throw error;
      return data.jobs || [];
    },
  });
}

export function useToggleSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: number) => {
      const { data, error } = await supabase.functions.invoke("manage-schedules", {
        body: { action: "toggle", jobId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ jobId, schedule }: { jobId: number; schedule: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-schedules", {
        body: { action: "update_schedule", jobId, schedule },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}
