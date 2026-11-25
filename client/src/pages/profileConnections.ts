import { useMemo } from "react";
import { useInfiniteQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import type { GraphEntry } from "@/services/graphHelpers";

export type ConnectionKind = "followed_by" | "following" | "muted_by" | "muting" | "reported_by" | "reporting";
type GrTier =
  "high" | "medium_high" | "medium" | "medium_low" | "low" | "low_and_reported_by_2_or_more_trusted_pubkeys";
type ConnPage = { items: GraphEntry[]; next_cursor: string | null };
export type ConnectionsQuery = UseInfiniteQueryResult<{ pages: ConnPage[]; pageParams: (string | undefined)[] }, Error>;

/** A section's page size on the profile's connection lists. */
export const SECTION_LIMIT = 200;

/** UI filter keys → the backend's GrapeRank tier names. */
export const UI_TO_GR_TIER: Record<string, GrTier> = {
  high: "high",
  trusted: "medium_high",
  neutral: "medium",
  low: "medium_low",
  unverified: "low",
};

function filterFor(filter: string | undefined): { tier?: GrTier; verified_only?: boolean } {
  const f = filter || "all";
  if (f === "all") return {};
  // "verified" is the union of every banded tier, so it goes through `verified_only`.
  if (f === "verified") return { verified_only: true };
  return { tier: UI_TO_GR_TIER[f] };
}

function useConnectionsQuery(
  hexPubkey: string,
  kind: ConnectionKind,
  sort: string | undefined,
  filter: string | undefined,
  enabled: boolean,
): ConnectionsQuery {
  // Name sorts stay client-side (no backend name index) and fetch DESC.
  const order: "asc" | "desc" = sort === "trust-asc" ? "asc" : "desc";
  const { tier, verified_only } = filterFor(filter);
  return useInfiniteQuery<
    ConnPage,
    Error,
    { pages: ConnPage[]; pageParams: (string | undefined)[] },
    readonly unknown[],
    string | undefined
  >({
    // No preset in the key: a preset change invalidates (`invalidatePresetDrivenReads`).
    queryKey: ["profile-conn", hexPubkey, kind, order, tier ?? null, verified_only ?? false],
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.getUserConnections(hexPubkey, kind, {
        limit: SECTION_LIMIT,
        cursor: pageParam || undefined,
        order,
        tier,
        verified_only,
      });
      return {
        items: (res?.data?.items ?? []) as GraphEntry[],
        next_cursor: (res?.data?.next_cursor ?? null) as string | null,
      };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? undefined,
    enabled: !!hexPubkey && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** A section's rows across its loaded pages, or null before any landed. The same array until a page lands. */
function useFlattened(q: ConnectionsQuery): GraphEntry[] | null {
  const pages = q.data?.pages;
  return useMemo(() => pages?.flatMap((p) => p.items) ?? null, [pages]);
}

/**
 * The viewed profile's six connection lists (cursor-paginated), and each one's
 * rows flattened. followed_by and following load at once (mutuals and shared
 * connections are drawn from them); the other four when their section opens.
 *
 * The flattened lists keep their identity until a page lands. Flattened in
 * render they were new arrays every render, so everything derived from them —
 * the mutual and shared sets, the influence maps, groupsByPubkey, the trust
 * seeding and the idle prefetch — re-ran on every render.
 */
export function useProfileConnections(
  hexPubkey: string,
  sectionSort: Record<string, string | undefined>,
  sectionFilter: Record<string, string | undefined>,
  expandedSections: Record<string, boolean>,
) {
  const on = (kind: ConnectionKind) => !!expandedSections[kind];
  const s = sectionSort;
  const f = sectionFilter;
  const queries = {
    followed_by: useConnectionsQuery(hexPubkey, "followed_by", s.followed_by, f.followed_by, true),
    following: useConnectionsQuery(hexPubkey, "following", s.following, f.following, true),
    muted_by: useConnectionsQuery(hexPubkey, "muted_by", s.muted_by, f.muted_by, on("muted_by")),
    muting: useConnectionsQuery(hexPubkey, "muting", s.muting, f.muting, on("muting")),
    reported_by: useConnectionsQuery(hexPubkey, "reported_by", s.reported_by, f.reported_by, on("reported_by")),
    reporting: useConnectionsQuery(hexPubkey, "reporting", s.reporting, f.reporting, on("reporting")),
  };
  const items = {
    followed_by: useFlattened(queries.followed_by),
    following: useFlattened(queries.following),
    muted_by: useFlattened(queries.muted_by),
    muting: useFlattened(queries.muting),
    reported_by: useFlattened(queries.reported_by),
    reporting: useFlattened(queries.reporting),
  };
  return { queries, items };
}
