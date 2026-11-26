import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

/**
 * One person's GrapeRank run, claimed in the console's in-flight set
 * (useInFlightTriggers) so no control sends a second request for someone
 * already in flight.
 */
export function useTriggers({
  claim,
  release,
  onTriggered,
}: {
  claim: (pubkeys: readonly string[]) => string[];
  release: (pubkey: string) => void;
  /** A run was sent (the console boosts its polling). */
  onTriggered: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // One person's run, from any control that isn't the Users row (which confirms
  // first, in triggerGraperank): refused while that person is in flight.
  const retriggerOne = useCallback(
    async (pubkey: string) => {
      if (claim([pubkey]).length === 0) throw new Error("A run for this user is already in flight.");
      try {
        await apiClient.triggerUserGraperank(pubkey);
      } finally {
        release(pubkey);
      }
    },
    [claim, release],
  );

  /** The Users row's confirmed trigger: says how it went, and refreshes the tables. */
  const triggerGraperank = useCallback(
    async (pubkey: string) => {
      if (claim([pubkey]).length === 0) return;
      try {
        await apiClient.triggerUserGraperank(pubkey);
        toast({ title: "GrapeRank triggered", description: `Triggered for ${pubkey.slice(0, 12)}...` });
        void queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
        onTriggered();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Trigger failed", description: message, variant: "destructive" });
      } finally {
        release(pubkey);
      }
    },
    [claim, release, toast, queryClient, onTriggered],
  );

  return { retriggerOne, triggerGraperank };
}
