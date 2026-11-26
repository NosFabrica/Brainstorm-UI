import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { GRAPERANK_RESULT_KEY, noteGrapeRankTriggered } from "@/services/queries/graperank";
import { apiClient } from "@/services/api";

/**
 * Settings' "Recalculate GrapeRank" (and the preset toast's "Recalculate now"):
 * starts a run, takes the answer as the new run status, and goes to the
 * dashboard, where the run is followed.
 */
export function useRecalculateGrapeRank() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: (data) => {
      noteGrapeRankTriggered();
      if (data?.data && typeof data.data === "object") {
        queryClient.setQueryData(GRAPERANK_RESULT_KEY, data);
      }
      queryClient.invalidateQueries({ queryKey: GRAPERANK_RESULT_KEY });
      toast({
        title: "Recalculation started",
        description: "Recalculating now — redirecting to your dashboard.",
        duration: 4000,
      });
      setTimeout(() => navigate("/dashboard"), 600);
    },
    onError: () => {
      toast({
        title: "Recalculation failed",
        description: "Something went wrong triggering the recalculation. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    },
  });
}

export type RecalculateGrapeRank = ReturnType<typeof useRecalculateGrapeRank>;
