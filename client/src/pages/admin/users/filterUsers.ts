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
