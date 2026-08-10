import { useQuery, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { apiClient, hasSessionToken } from "@/services/api";

type ConnectionKind =
  | "followed_by"
  | "following"
  | "muted_by"
  | "muting"
  | "reported_by"
  | "reporting"
  | "flagged";

const FIRST_PAGE_LIMIT = 200;
const NEXT_PAGE_LIMIT = 100;

export function useSelfOverview(pubkey: string | undefined) {

  return useQuery({
    queryKey: ["/user/overview", pubkey],
    queryFn: () => apiClient.getUserOverview(pubkey!),
    enabled: !!pubkey,
    staleTime: 60_000,
  });
}

export function useSelfHistory(pubkey: string | undefined) {

  return useQuery({
    queryKey: ["/user/history", pubkey],
    queryFn: () => apiClient.getUserHistory(),
    // `/user/history` is auth-required; an Account can be active with no
    // Session, and firing anyway means authenticatedFetch → 401 → storage wipe
    // + hard-redirect to "/". Require a real session token.
    enabled: !!pubkey && hasSessionToken(),
    staleTime: 60_000,
  });
}

export function useSelfStats(pubkey: string | undefined) {

  return useQuery({
    queryKey: ["/user/stats", pubkey],
    queryFn: () => apiClient.getUserStats(pubkey!),
    enabled: !!pubkey,
    staleTime: 60_000,
  });
}

// Backend tier names match the GR result writer's count_values keys.
type Tier =
  | "high"
  | "medium_high"
  | "medium"
  | "medium_low"
  | "low"
  | "low_and_reported_by_2_or_more_trusted_pubkeys";

export function useSelfConnections(
  pubkey: string | undefined,
  kind: ConnectionKind,
  opts?: {
    enabled?: boolean;
    order?: "asc" | "desc";
    tier?: Tier;
    verifiedOnly?: boolean;
    withTotal?: boolean;
  },
) {

  const order: "asc" | "desc" = opts?.order ?? "desc";
  const tier = opts?.tier;
  const verifiedOnly = opts?.verifiedOnly ?? false;
  const withTotal = opts?.withTotal ?? false;
  const query = useInfiniteQuery({
    queryKey: [
      "/user/connections",
      pubkey,
      kind,
      order,
      tier ?? null,
      verifiedOnly,
      withTotal,
    ],
    queryFn: ({ pageParam }) =>
      apiClient.getUserConnections(pubkey!, kind, {
        limit: pageParam ? NEXT_PAGE_LIMIT : FIRST_PAGE_LIMIT,
        cursor: pageParam as string | undefined,
        order,
        tier,
        verified_only: verifiedOnly,
        // `total` is only needed once for the pager — request it on the first
        // page only; cursor pages reuse pages[0].data.total.
        with_total: withTotal && !pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: any) => lastPage?.data?.next_cursor ?? undefined,
    enabled: !!pubkey && (opts?.enabled ?? false),
    staleTime: 60_000,
    // Filter values live in the queryKey, so changing a filter spawns a new
    // query. Without this, `data` goes undefined and the list flashes empty
    // ("No matches found") until the request returns. keepPreviousData holds
    // the prior filter's results on screen during the refetch; `isPlaceholderData`
    // lets the UI dim them. See NetworkPage list-render gate.
    placeholderData: keepPreviousData,
  });

  return query;
}

export type ConnectionItem = {
  pubkey: string;
  influence: number | null;
  trusted_reporters: number | null;
  /** The bucket the server tiered this row into, under the observer's preset. */
  tier: Tier | null;
};

export function flattenConnections(pages: any[] | undefined): ConnectionItem[] {
  if (!pages) return [];
  const out: ConnectionItem[] = [];
  for (const page of pages) {
    const items = page?.data?.items ?? [];
    for (const it of items) out.push(it);
  }
  return out;
}
