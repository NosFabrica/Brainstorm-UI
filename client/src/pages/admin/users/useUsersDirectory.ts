import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ALL_USERS_DAYS } from "@/components/admin/useAdminHeaderMetrics";
import { apiClient } from "@/services/api";
import { BOOST_INTERVAL_MS, NONE, POLL_USERS_MS } from "../constants";
import type { AdminSortKey, AdminUsersPage, KpiFilter, PageSizeOption, SortState } from "../types";

/** A name, rather than a pubkey or npub (or a piece of one), which the backend's search can't match. */
export function isNameSearch(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (t.startsWith("npub")) return false;
  if (/^[0-9a-fA-F]{8,64}$/.test(t)) return false;
  return true;
}

/**
 * The Users tab's directory: the backend's page of users for the committed
 * search, sort and page, and what the tab shows of it — a header card's
 * filter, the rows open, the row lit after a jump, the rows picked, whether
 * Lookup is open.
 *
 * The console holds it, not the tab: the directory's page is read on every
 * tab (System Health reports it, the header's names start from it), other tabs
 * open a person here, and the search and selection outlast a visit elsewhere.
 * Typing stays in the search box (AdminSearchInput), so a keystroke re-renders
 * neither.
 */
export function useUsersDirectory({
  isAdmin,
  onUsersTab,
  isBoostActive,
}: {
  isAdmin: boolean;
  onUsersTab: boolean;
  isBoostActive: boolean;
}) {
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<SortState>({ key: "last_triggered", dir: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    const params = new URLSearchParams(window.location.search);
    const hl = params.get("highlight");
    return hl ? new Set([hl]) : new Set();
  });
  const [highlightedPubkey, setHighlightedPubkey] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight") || null;
  });
  const [selectedUserPubkeys, setSelectedUserPubkeys] = useState<Set<string>>(new Set());
  const [lookupOpen, setLookupOpen] = useState(false);

  // `userSearch` is committed by the search box once typing pauses
  // (AdminSearchInput), so the backend's pubkey search reads it as is; a name
  // is matched against every user, and never sent.
  const debouncedSearch = isNameSearch(userSearch.trim()) ? "" : userSearch.trim();
  const activeNameSearch = isNameSearch(userSearch.trim());

  const adminUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users", debouncedSearch, userSort.key, userSort.dir, userPage, pageSize],
    queryFn: () =>
      apiClient.getAdminUsers({
        search: debouncedSearch || undefined,
        sort: userSort.key,
        order: userSort.dir,
        days: ALL_USERS_DAYS,
        page: userPage + 1,
        size: pageSize,
      }),
    enabled: isAdmin,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: onUsersTab ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_USERS_MS) : false,
    refetchOnWindowFocus: "always",
  });
  const adminUsersData = adminUsersQuery.data;

  const handleSort = useCallback((key: AdminSortKey) => {
    setUserSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
    setUserPage(0);
  }, []);

  const handlePageSizeChange = useCallback((val: string) => {
    setPageSize(parseInt(val, 10) as PageSizeOption);
    setUserPage(0);
  }, []);

  /** Searched to one person, their row open and lit for a moment: a link from another tab. */
  const focusUser = (pubkey: string) => {
    setUserSearch(pubkey);
    setKpiFilter(null);
    setUserPage(0);
    setExpandedRows(new Set([pubkey]));
    setHighlightedPubkey(pubkey);
    setTimeout(() => setHighlightedPubkey(null), 2500);
  };

  return {
    userSearch,
    setUserSearch,
    userSort,
    userPage,
    setUserPage,
    pageSize,
    kpiFilter,
    setKpiFilter,
    expandedRows,
    setExpandedRows,
    highlightedPubkey,
    setHighlightedPubkey,
    selectedUserPubkeys,
    setSelectedUserPubkeys,
    lookupOpen,
    setLookupOpen,
    debouncedSearch,
    activeNameSearch,
    adminUsersQuery,
    adminUsersList: adminUsersData?.items ?? NONE,
    adminUsersTotal: adminUsersData?.total ?? 0,
    adminUsersTotalPages: adminUsersData?.pages ?? 1,
    handleSort,
    handlePageSizeChange,
    focusUser,
  };
}

export type UsersDirectory = ReturnType<typeof useUsersDirectory>;
