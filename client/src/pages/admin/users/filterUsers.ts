import { matchUsersByName, type ProfileBits } from "@/components/admin/users/matchUsersByName";
import { isFailedStatus } from "../failures";
import type { AdminUserListItem, KpiFilter } from "../types";
import { isNameSearch } from "./useUsersDirectory";

/** Whether a user's latest run fits a header card's filter. */
export function matchesKpiFilter(u: AdminUserListItem, kpiFilter: KpiFilter): boolean {
  if (kpiFilter === "scored") return u.latest_status?.toLowerCase() === "success";
  if (kpiFilter === "sp_adopters") return u.latest_ta_status?.toLowerCase() === "success";
  if (kpiFilter === "queue") return u.latest_status?.toLowerCase() !== "success" && !isFailedStatus(u.latest_status);
  if (kpiFilter === "failed") return isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status);
  return true;
}

/**
 * The directory's rows. A name search or a header card's filter narrows every
 * user (`allUsers`, loaded whole), and the tab pages the result itself;
 * otherwise the rows are the backend's page (`pageUsers`), already searched by
 * pubkey.
 */
export function filterUsers({
  search,
  kpiFilter,
  allUsers,
  pageUsers,
  profiles,
}: {
  search: string;
  kpiFilter: KpiFilter | null;
  allUsers: AdminUserListItem[];
  pageUsers: AdminUserListItem[];
  profiles: ReadonlyMap<string, ProfileBits>;
}): AdminUserListItem[] {
  const trimmed = search.trim();
  const nameSearch = trimmed && isNameSearch(trimmed);
  let list = nameSearch || kpiFilter ? allUsers : pageUsers;
  if (nameSearch) {
    const matched = new Set(matchUsersByName(list, profiles, trimmed).map((m) => m.pubkey));
    list = list.filter((u) => matched.has(u.pubkey));
  }
  if (kpiFilter) list = list.filter((u) => matchesKpiFilter(u, kpiFilter));
  return list;
}

/**
 * The page on screen, and what the pager counts. The table, the phone cards,
 * the bulk bar and the pager all read this one answer: when the tab filters
 * itself (a name search or a header card's filter: `clientFiltered`), it pages
 * `list` here; otherwise `list` is already the backend's page and the totals
 * are the backend's.
 */
export function pageOfUsers({
  list,
  clientFiltered,
  page,
  pageSize,
  backendTotal,
  backendPages,
}: {
  list: AdminUserListItem[];
  clientFiltered: boolean;
  page: number;
  pageSize: number;
  backendTotal: number;
  backendPages: number;
}): { rows: AdminUserListItem[]; total: number; totalPages: number } {
  if (!clientFiltered) return { rows: list, total: backendTotal, totalPages: backendPages };
  return {
    rows: list.slice(page * pageSize, (page + 1) * pageSize),
    total: list.length,
    totalPages: Math.max(1, Math.ceil(list.length / pageSize)),
  };
}
