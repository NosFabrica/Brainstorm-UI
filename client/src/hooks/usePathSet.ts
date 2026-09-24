/**
 * The Connection page's set of paths from an origin to a person.
 *
 * The first answer (the probe) renders the moment it lands, exactly as the
 * page always has; the sampled rest arrive behind it in one further query
 * (lib/hopsPaths `samplePaths`), never as N queries with one key — those
 * would dedupe to a single fetch and "sample" one path seven times. A
 * shuffle bumps the nonce and both ask afresh.
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import type { ShortestPath } from "@/services/api/users";
import { dedupePaths, samplePaths } from "@/lib/hopsPaths";

/** How many paths a server that returns the list may send. */
export const MAX_PATHS = 50;

export interface PathSet {
  head: ShortestPath | undefined;
  /** De-duplicated; `[head.path]` until sampling lands. */
  paths: string[][];
  /** How many distinct paths were judged. */
  checked: number;
  /** Every path is in hand — the server sent the list, or sampling found them all. */
  complete: boolean;
  isPending: boolean;
  sampling: boolean;
  error: unknown;
}

export function usePathSet(from: string, to: string, { enabled, nonce }: { enabled: boolean; nonce: number }): PathSet {
  const ask = () => apiClient.getShortestPath({ from, to, maxPaths: MAX_PATHS });
  const probe = useQuery({
    queryKey: ["shortestPath", from, to, nonce],
    queryFn: ask,
    enabled,
    // Stable per nonce — the shuffle bumps `nonce` to ask afresh, so background
    // refetches never remount the list under the reader.
    staleTime: 5 * 60_000,
    retry: false,
  });
  const head = probe.data;
  const more = useQuery({
    queryKey: ["shortestPath-more", from, to, nonce],
    queryFn: () => samplePaths(head!, ask),
    enabled: enabled && !!head?.reachable && head.pathCount > 1,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const paths = more.data?.paths ?? (head?.path?.length ? dedupePaths([head.path]) : []);
  const sampling = !!head && head.reachable && head.pathCount > 1 && more.isPending;
  const complete = more.data ? more.data.complete : !!head && (head.pathCount <= 1 || !!head.paths?.length);
  return { head, paths, checked: paths.length, complete, isPending: probe.isPending, sampling, error: probe.error };
}
