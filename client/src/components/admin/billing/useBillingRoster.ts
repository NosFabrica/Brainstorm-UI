import { readEveryPage } from "@/components/admin/useAdminHeaderMetrics";
import { apiClient, type AdminBillingSubscription, type SchedulingItem } from "@/services/api";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { flashRecordKey, recordFromBody } from "./FlashFactsStrip";
import { DIVERGENCE_KEY, FLASH_SERVICES_KEY, POLICIES_KEY, SUBS_KEY } from "./queryKeys";
import { type SortState, type SortKey } from "./rosterShared";

/** The roster's page size: the backend's own cap. */
export const PAGE_SIZE = 100;
const NO_SUBS: AdminBillingSubscription[] = [];

/**
 * The subscriber roster and what it reads: the server's page, or every page
 * while a search, filter or sort is on (there is no server-side search); the
 * divergence report; the scheduling policies; Flash's services, and each
 * subscriber's service from their Flash record.
 */
export function useBillingRoster(active: boolean) {
  // One page at a time; filters and sort stay in component state across pages.
  const [page, setPage] = useState(1);
  const subsQuery = useQuery({
    queryKey: [...SUBS_KEY, page],
    queryFn: () => apiClient.getAdminBillingSubscriptions(page, PAGE_SIZE),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });
  const divergenceQuery = useQuery({
    queryKey: DIVERGENCE_KEY,
    queryFn: () => apiClient.getAdminBillingDivergence(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  // Scheduling policies by id — the report names policies by id only.
  const policiesQuery = useQuery<SchedulingItem[]>({
    queryKey: POLICIES_KEY,
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  // Flash keeps one service per environment, so a subscriber's service says
  // whether they came in through production or staging (Benjamin, 2026-09-09:
  // "right now we can't tell where the users are coming from"). The roster
  // row carries no service; the Flash record each row reads does.
  const servicesQuery = useQuery({
    queryKey: FLASH_SERVICES_KEY,
    queryFn: () => apiClient.getAdminBillingFlashServices(),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const serviceNames = useMemo(
    () => new Map((servicesQuery.data ?? []).map((svc) => [svc.id, svc.name])),
    [servicesQuery.data],
  );
  const policyName = (id: number | null | undefined): string => {
    if (id == null) return "—";
    return policiesQuery.data?.find((p) => p.id === id)?.name ?? `policy #${id}`;
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortState>(null);
  // A search, a filter or a sort reads every page: over the page on screen it
  // missed everyone else while the count claimed the whole roster. There is no
  // server-side search on this list.
  const viewingAll =
    search.trim() !== "" || statusFilter !== "all" || sourceFilter !== "all" || serviceFilter !== "all" || !!sort;
  const allSubsQuery = useQuery({
    queryKey: [...SUBS_KEY, "every-page"],
    queryFn: () => readEveryPage((p) => apiClient.getAdminBillingSubscriptions(p, PAGE_SIZE)),
    enabled: active && viewingAll,
    staleTime: 60_000,
    retry: 1,
  });
  // Until every page is in, the page on screen stands in (and says so).
  const allLoaded = viewingAll && !!allSubsQuery.data;
  const rosterItems = (allLoaded ? allSubsQuery.data?.items : subsQuery.data?.items) ?? NO_SUBS;
  // A new search starts from the first page of its results.
  useEffect(() => {
    setPage(1);
  }, [viewingAll, search, statusFilter, sourceFilter, serviceFilter, sort]);
  // The same query the rows run (same key, one fetch). The rows ask for their
  // own as they near the screen; every row's is asked for here only when the
  // service switch or sort needs them all. Otherwise this reads what is cached.
  const needsEveryRecord = serviceFilter !== "all" || sort?.key === "service";
  const recordQueries = useQueries({
    queries: rosterItems.map((s) => ({
      queryKey: flashRecordKey(s.pubkey),
      queryFn: async () => (await apiClient.getAdminBillingFlashRecordForSubscriber(s.pubkey)) ?? null,
      staleTime: 5 * 60_000,
      retry: false,
      enabled: needsEveryRecord,
    })),
  });
  const serviceOf = useMemo(
    () =>
      new Map<string, string | null | undefined>(
        rosterItems.map((s, i) => {
          const q = recordQueries[i];
          return [
            s.pubkey,
            q?.isPending ? undefined : (recordFromBody(q?.data, s.flash_subscription_id)?.serviceId ?? null),
          ];
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterItems, recordQueries.map((q) => `${q.isPending}:${q.dataUpdatedAt}`).join("|")],
  );
  const serviceLabelOf = (id: string | null | undefined): string =>
    id ? (serviceNames.get(id) ?? `${id.slice(0, 8)}…`) : "";
  // The switch lists the account's services (one per environment) plus any
  // service a row names that the list does not — and only when there is a
  // choice to make.
  const serviceOptions = useMemo(() => {
    const ids = new Set<string>((servicesQuery.data ?? []).map((svc) => svc.id));
    for (const id of serviceOf.values()) if (id) ids.add(id);
    return Array.from(ids)
      .map((id) => ({ id, label: serviceLabelOf(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicesQuery.data, serviceOf, serviceNames]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return {
    page,
    setPage,
    subsQuery,
    divergenceQuery,
    policiesQuery,
    serviceNames,
    policyName,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sourceFilter,
    setSourceFilter,
    serviceFilter,
    setServiceFilter,
    sort,
    viewingAll,
    allLoaded,
    rosterItems,
    serviceOf,
    serviceLabelOf,
    serviceOptions,
    toggleSort,
  };
}
