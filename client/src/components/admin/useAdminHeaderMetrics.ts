import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { BACKEND_MAX_DAYS } from "@/pages/adminRange";

/** The backend pages lists at 100 rows; a whole-table read asks for this many pages at a time. */
const PAGE_BATCH = 10;
/** The users directory lists everyone: the backend's `days` has no ceiling, and this covers the data. */
export const ALL_USERS_DAYS = 9999;

type Paged = { items?: unknown[]; pages?: number };

/**
 * Every page of a backend list: the first, then the rest a batch at a time,
 * `onBatch` handed the items so far as each batch lands.
 */
export async function readEveryPage<T extends Paged>(
  fetchPage: (page: number) => Promise<T>,
  onBatch?: (sofar: T) => void,
): Promise<T> {
  const first = await fetchPage(1);
  const pages = first?.pages ?? 1;
  let items = [...(first?.items ?? [])];
  for (let from = 2; from <= pages; from += PAGE_BATCH) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(PAGE_BATCH, pages - from + 1) }, (_, i) => fetchPage(from + i)),
    );
    items = items.concat(batch.flatMap((pg) => pg?.items ?? []));
    onBatch?.({ ...first, items });
  }
  return { ...first, items };
}

/**
 * Streams the partial result into the cache only while there is nothing to
 * show. A refetch (every minute, every few seconds during a trigger boost)
 * keeps the complete answer on screen and swaps the new one in whole: written
 * batch by batch, the figures and charts dropped to the first pages and climbed
 * back up on every poll.
 */
export function streamFirstLoad<T>(
  queryClient: QueryClient,
  key: readonly unknown[],
): ((sofar: T) => void) | undefined {
  if (queryClient.getQueryData(key) !== undefined) return undefined;
  return (sofar) => queryClient.setQueryData<T>(key, sofar);
}

export type WholeTableRead = { enabled: boolean; refetchInterval: number | false };

/**
 * The whole-table reads behind the console's header figures: every user,
 * whatever the range, and the range's runs (twice the range, so the deltas
 * have a prior window to compare with).
 *
 * Both page through the entire table, so each runs only where something draws
 * it — the caller says where with `enabled`. Elsewhere the header reads the
 * last answer still in the cache, or the backend's stats. A backend aggregate
 * (one request for the counts and the bucketed series) is the real fix; this
 * only stops paying for it on tabs that don't show it.
 */
export function useAdminHeaderMetrics<Users extends Paged, Activity extends Paged>({
  rangeDays,
  allUsers,
  activity,
}: {
  rangeDays: number;
  allUsers: WholeTableRead;
  activity: WholeTableRead;
}): { allUsersQuery: UseQueryResult<Users>; overviewActivityQuery: UseQueryResult<Activity> } {
  const queryClient = useQueryClient();

  const allUsersQuery = useQuery<Users>({
    queryKey: ["/api/admin/users/all"],
    queryFn: () => readEveryPage((page) => apiClient.getAdminUsers({ days: ALL_USERS_DAYS, page, size: 100 })),
    enabled: allUsers.enabled,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: allUsers.refetchInterval,
    refetchOnWindowFocus: true,
  });

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- queryClient is the provider's cache, not an input
  const overviewActivityQuery = useQuery<Activity>({
    queryKey: ["/api/admin/activity/overview", rangeDays],
    // Backend caps `size` at 100 (more 422s), so the range comes page by page,
    // a batch at a time; on a first load each batch shows as it lands.
    queryFn: ({ queryKey }) => {
      const days = Math.min(rangeDays * 2, BACKEND_MAX_DAYS);
      return readEveryPage(
        (page) => apiClient.getAdminActivity({ page, size: 100, days }),
        streamFirstLoad<Activity>(queryClient, queryKey),
      );
    },
    enabled: activity.enabled,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: activity.refetchInterval,
    refetchOnWindowFocus: true,
  });

  return { allUsersQuery, overviewActivityQuery };
}
