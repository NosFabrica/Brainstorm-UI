import { useQuery } from "@tanstack/react-query";
import { apiClient, isFlaggedAlert, type NetworkAlertEntry, type NetworkAlertsData } from "@/services/api";

/**
 * Network Alerts for an observer — the trust signals on people in their network.
 * Deliberately its OWN async query (never gate page render on it): the endpoint
 * is ~10s for populated observers today, so this loads in the background and the
 * Network Alerts card shows a skeleton until it resolves.
 *
 * `enabled` defaults to false so callers opt in explicitly (e.g. only when the
 * card scrolls into view / the dashboard is for the signed-in owner).
 */
export function useNetworkAlerts(
  observer: string | undefined,
  opts?: { enabled?: boolean; limit?: number },
) {
  return useQuery({
    queryKey: ["/networkAlerts", observer, opts?.limit ?? 100],
    queryFn: () => apiClient.getNetworkAlerts(observer!, { limit: opts?.limit }),
    enabled: !!observer && (opts?.enabled ?? false),
    // Expensive + slow-moving data — cache generously, don't refetch on focus.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Flagged accounts (verified reporters ≥ threshold) across the whole network,
 *  most-influential first — the headline "risk signals" for the card. */
export function selectFlaggedAlerts(data: NetworkAlertsData | undefined): NetworkAlertEntry[] {
  if (!data) return [];
  return [...data.directFollows, ...data.extendedNetwork]
    .filter(isFlaggedAlert)
    .sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0));
}
