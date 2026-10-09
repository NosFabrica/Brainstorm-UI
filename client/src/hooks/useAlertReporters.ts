import { useQuery } from "@tanstack/react-query";
import { useScorePov } from "@/components/score/TrustScorePov";
import { apiClient } from "@/services/api";
import { toInfluenceMap, type GraphEntry } from "@/services/graphHelpers";
import type { Reporter } from "@/lib/reporterBreakdown";

const LIMIT = 50;

/**
 * Who reported a flagged account, each with their score — from the reader's
 * own perspective when they have chosen it, else Brainstorm's. Asked only when
 * a row on /alerts is opened (`enabled`): one request per account, so never
 * for a whole list at once.
 */
export function useAlertReporters(pubkey: string, enabled = true) {
  const { pov } = useScorePov();
  const query = useQuery({
    queryKey: ["alert-reporters", pubkey, pov],
    queryFn: async (): Promise<{ reporters: Reporter[]; total: number | null }> => {
      const res = await apiClient.getUserConnections(pubkey, "reported_by", {
        verified_only: true,
        limit: LIMIT,
        with_total: true,
        house: pov !== "personalized",
      });
      const items = (res?.data?.items ?? []) as GraphEntry[];
      const reporters = [...toInfluenceMap(items)].map(([pk, influence]) => ({ pubkey: pk, influence }));
      const total = typeof res?.data?.total === "number" ? res.data.total : null;
      return { reporters, total };
    },
    enabled: enabled && !!pubkey,
    staleTime: 10 * 60_000,
  });
  return { ...query, pov };
}
