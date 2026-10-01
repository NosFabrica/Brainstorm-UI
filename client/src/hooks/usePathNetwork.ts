/**
 * The Connection page's Path network from an origin to a person: one request
 * for the whole network. When the server can't compute it in time (504) it
 * falls back to hops alone, so the page can still say how far away they are.
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { PathNetworkTooLargeError, type ShortestHops, type ShortestPath } from "@/services/api/users";

export interface PathNetworkQuery {
  /** Undefined until it lands, and when it was too large to compute. */
  network: ShortestPath | undefined;
  tooLarge: boolean;
  /** Hops alone, only when `tooLarge`. */
  hops: ShortestHops | undefined;
  isPending: boolean;
  error: unknown;
}

export function usePathNetwork(from: string, to: string, { enabled }: { enabled: boolean }): PathNetworkQuery {
  const full = useQuery({
    queryKey: ["shortestPath", from, to],
    queryFn: () => apiClient.getShortestPath({ from, to }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const tooLarge = full.error instanceof PathNetworkTooLargeError;
  const fallback = useQuery({
    queryKey: ["shortestHops", from, to],
    queryFn: () => apiClient.getShortestHops({ from, to }),
    enabled: enabled && tooLarge,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    network: full.data,
    tooLarge,
    hops: fallback.data,
    isPending: full.isPending || (tooLarge && fallback.isPending),
    error: tooLarge ? fallback.error : full.error,
  };
}
