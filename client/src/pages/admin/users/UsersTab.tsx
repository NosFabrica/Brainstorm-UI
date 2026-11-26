import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { UserTierPicker } from "@/components/admin/scheduling/UserTierPicker";
import { ALL_USERS_DAYS } from "@/components/admin/useAdminHeaderMetrics";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { type SchedulingItem, apiClient } from "@/services/api";
import {
  Users,
  Shield,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  RefreshCw,
  Eye,
  Play,
  Loader2,
  Square,
  CheckSquare,
  MinusSquare,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { useState, useMemo, useCallback, useDeferredValue, Fragment } from "react";
import { useLocation } from "wouter";
import { AdminSearchInput } from "@/components/admin/users/AdminSearchInput";
import { type BulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { BulkResultBanner } from "../BulkResultBanner";
import { CopyButton } from "../CopyButton";
import { SortHeader } from "../SortHeader";
import { isFailedStatus } from "../failures";
import { formatTimestamp, timeAgo } from "../format";
import { getUserHealth } from "../metrics";
import { type AdminUserListItem } from "../types";
import { LookupOnboardDialog } from "./LookupOnboardDialog";
import { UserHistoryRow } from "./UserHistoryRow";
import { filterUsers } from "./filterUsers";
import { type UsersDirectory } from "./useUsersDirectory";

const SELECT_ALL_MATCHING_CAP = 200;

/**
 * The Users tab: the user database, searched by name or key, filtered by a
 * header card, paged; Lookup / Onboard; bulk and single re-triggers.
 */
export function UsersTab({
  directory,
  bulk,
  triggering: triggeringPubkeys,
  allUsers,
  allUsersComplete,
  userProfiles,
  schedulingPolicies,
  triggerGraperank,
  onPublishTrustedLists,
}: {
  directory: UsersDirectory;
  bulk: BulkRetrigger;
  /** People with a run in flight, from any control. */
  triggering: ReadonlySet<string>;
  /** Every user, as far as loaded: a name search or a header card's filter narrows these. */
  allUsers: AdminUserListItem[];
  allUsersComplete: boolean;
  userProfiles: Map<string, { name?: string; picture?: string }>;
  schedulingPolicies: SchedulingItem[];
  triggerGraperank: (pubkey: string) => Promise<void>;
  /** The row menu's "Publish trusted lists": the Trusted Lists tab, opened on this person. */
  onPublishTrustedLists: (pubkey: string) => void;
}) {
  const {
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
    adminUsersList,
    adminUsersTotal,
    adminUsersTotalPages,
    handleSort,
    handlePageSizeChange,
  } = directory;
  const { running: bulkRunning, statuses: bulkStatuses, lastResult: bulkLastResult } = bulk;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [triggerConfirmPubkey, setTriggerConfirmPubkey] = useState<string | null>(null);
  const [fetchingMatching, setFetchingMatching] = useState(false);

  // A header card's filter or a name search narrows every user (loaded
  // whole), paged here; otherwise the directory is the backend's page.
  const clientFilteredUsers = activeNameSearch || !!kpiFilter;
  // Deferred: a long directory filters without holding up the box being typed in.
  const deferredUserSearch = useDeferredValue(userSearch);
  const filteredUsersList = useMemo(
    () =>
      filterUsers({
        search: deferredUserSearch,
        kpiFilter,
        allUsers,
        pageUsers: adminUsersList,
        profiles: userProfiles,
      }),
    [adminUsersList, allUsers, kpiFilter, deferredUserSearch, userProfiles],
  );
  const totalPages = clientFilteredUsers
    ? Math.max(1, Math.ceil(filteredUsersList.length / pageSize))
    : adminUsersTotalPages;

  const jumpToUser = useCallback(
    (pubkey: string, displayName?: string) => {
      setUserSearch(pubkey);
      setUserPage(0);
      setKpiFilter(null);
      setLookupOpen(false);
      setHighlightedPubkey(pubkey);
      setExpandedRows(new Set([pubkey]));
      setTimeout(() => setHighlightedPubkey(null), 2500);
      const name = displayName || userProfiles.get(pubkey)?.name;
      toast({ title: "Jumped to user", description: name ? `Showing ${name}` : `Showing ${pubkey.slice(0, 16)}...` });
    },
    [
      toast,
      userProfiles,
      setUserSearch,
      setUserPage,
      setKpiFilter,
      setLookupOpen,
      setHighlightedPubkey,
      setExpandedRows,
    ],
  );

  return (
    <>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="panel-users"
      >
        <div className="flex flex-col gap-3 border-b border-brand-accent/10 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3
              className="text-sm font-bold text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              User Database
            </h3>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {(clientFilteredUsers ? filteredUsersList.length : adminUsersTotal).toLocaleString()} users
                {activeNameSearch && userSearch.trim() ? " (filtered)" : ""}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Page {userPage + 1} of {totalPages}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <AdminSearchInput
                value={userSearch}
                onCommit={(text) => {
                  setUserSearch(text);
                  setUserPage(0);
                }}
                onClear={() => {
                  setUserSearch("");
                  setUserPage(0);
                  setHighlightedPubkey(null);
                  setExpandedRows(new Set());
                }}
                placeholder="Search name, pubkey, npub..."
                className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 pr-7 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                testId="input-user-search"
                clearTestId="button-clear-search"
              />
            </div>
            <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger
                className="h-8 w-20 rounded-xl border-slate-200 text-xs dark:border-slate-800"
                data-testid="select-page-size"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <LookupOnboardDialog
              open={lookupOpen}
              setOpen={setLookupOpen}
              users={allUsersComplete ? allUsers : adminUsersList}
              usersComplete={allUsersComplete}
              profiles={userProfiles}
              jumpToUser={jumpToUser}
            />
          </div>
        </div>

        {(selectedUserPubkeys.size > 0 || (bulkLastResult && bulkLastResult.source !== "activity")) && (
          <div className="space-y-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800/60 sm:px-5">
            {selectedUserPubkeys.size > 0 &&
              (() => {
                const dedupePubkeys = Array.from(selectedUserPubkeys);
                const liveCount = bulkRunning
                  ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
                  : 0;
                const liveTotal = bulkRunning ? bulkStatuses.size : 0;
                const liveFailed = bulkRunning
                  ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length
                  : 0;
                const clientFiltered = clientFilteredUsers;
                const matchingTotal = clientFiltered ? filteredUsersList.length : adminUsersTotal;
                const visibleCount = (
                  clientFilteredUsers
                    ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                    : filteredUsersList
                ).length;
                const filtersActive = activeNameSearch || !!debouncedSearch || !!kpiFilter;
                const canSelectAllMatching = filtersActive && matchingTotal > visibleCount;
                const matchingLabelSuffix = kpiFilter && !activeNameSearch ? " in cache" : "";
                const handleSelectAllMatching = async () => {
                  const cap = Math.min(matchingTotal, SELECT_ALL_MATCHING_CAP);
                  if (clientFiltered) {
                    setSelectedUserPubkeys(new Set(filteredUsersList.slice(0, cap).map((u) => u.pubkey)));
                    return;
                  }
                  try {
                    setFetchingMatching(true);
                    const resp = await apiClient.getAdminUsers({
                      search: debouncedSearch || undefined,
                      sort: userSort.key,
                      order: userSort.dir,
                      days: ALL_USERS_DAYS,
                      page: 1,
                      size: cap,
                    });
                    setSelectedUserPubkeys(
                      new Set((resp.items ?? []).slice(0, cap).map((u: { pubkey: string }) => u.pubkey)),
                    );
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : "Unknown error";
                    toast({
                      title: "Failed to fetch matching users",
                      description: msg,
                      variant: "destructive",
                    });
                  } finally {
                    setFetchingMatching(false);
                  }
                };
                return (
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10"
                    data-testid="bulk-toolbar-users"
                  >
                    <CheckSquare className="h-4 w-4 text-brand-deep" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {dedupePubkeys.length} selected
                    </span>
                    {canSelectAllMatching && (
                      <button
                        onClick={handleSelectAllMatching}
                        disabled={bulkRunning || fetchingMatching}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-deep hover:underline disabled:opacity-40"
                        data-testid="button-bulk-select-all-matching-users"
                      >
                        {fetchingMatching && <Loader2 className="h-3 w-3 animate-spin" />}
                        Select all {Math.min(matchingTotal, SELECT_ALL_MATCHING_CAP)} matching
                        {matchingLabelSuffix}
                        {matchingTotal > SELECT_ALL_MATCHING_CAP ? ` (capped at ${SELECT_ALL_MATCHING_CAP})` : ""}
                      </button>
                    )}
                    {bulkRunning && (
                      <span
                        className="text-[10px] font-medium text-amber-700 dark:text-amber-300"
                        data-testid="bulk-progress-users"
                      >
                        {liveCount} of {liveTotal} triggered… {liveFailed > 0 ? `${liveFailed} failed` : ""}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => bulk.ask({ pubkeys: dedupePubkeys, source: "users" })}
                        disabled={bulkRunning || dedupePubkeys.length === 0}
                        className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                        data-testid="button-bulk-retrigger-users"
                      >
                        {bulkRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Re-trigger {dedupePubkeys.length} user{dedupePubkeys.length !== 1 ? "s" : ""}
                      </Button>
                      <button
                        onClick={() => setSelectedUserPubkeys(new Set())}
                        disabled={bulkRunning}
                        className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                        data-testid="button-bulk-clear-users"
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                );
              })()}
            <BulkResultBanner bulk={bulk} source="users" />
          </div>
        )}

        {kpiFilter && (
          <div
            className="flex items-center gap-2 border-b border-brand-accent/10 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10 sm:px-5"
            data-testid="kpi-filter-badge"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Filtered:
            </span>
            <Chip
              size="sm"
              tone={
                kpiFilter === "scored"
                  ? "emerald"
                  : kpiFilter === "sp_adopters"
                    ? "indigo"
                    : kpiFilter === "failed"
                      ? "red"
                      : "amber"
              }
              className="gap-1.5 px-2.5 py-1 font-bold uppercase tracking-wider"
            >
              {kpiFilter === "scored" && (
                <>
                  <UserCheck className="h-3 w-3" /> Scored Users
                </>
              )}
              {kpiFilter === "sp_adopters" && (
                <>
                  <Shield className="h-3 w-3" /> SP Adopters
                </>
              )}
              {kpiFilter === "queue" && (
                <>
                  <Clock className="h-3 w-3" /> In Queue
                </>
              )}
              {kpiFilter === "failed" && (
                <>
                  <AlertTriangle className="h-3 w-3" /> Failed
                </>
              )}
            </Chip>
            <button
              onClick={() => setKpiFilter(null)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
              data-testid="button-clear-kpi-filter"
            >
              <XCircle className="h-3 w-3" />
              Clear filter
            </button>
          </div>
        )}

        <div className="hidden md:block">
          <ScrollableTable>
            <table
              className="w-full min-w-[900px] border-collapse border border-slate-200 text-left dark:border-slate-800"
              data-testid="table-users"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                  <th className="sticky left-0 z-20 w-8 border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle dark:border-slate-800 dark:bg-slate-900">
                    {(() => {
                      const visible = clientFilteredUsers
                        ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                        : filteredUsersList;
                      const visiblePks = visible.map((u) => u.pubkey);
                      const selectedCount = visiblePks.filter((pk) => selectedUserPubkeys.has(pk)).length;
                      const allSelected = visiblePks.length > 0 && selectedCount === visiblePks.length;
                      const someSelected = selectedCount > 0 && !allSelected;
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) {
                              setSelectedUserPubkeys((prev) => {
                                const next = new Set(prev);
                                for (const pk of visiblePks) next.delete(pk);
                                return next;
                              });
                            } else {
                              setSelectedUserPubkeys((prev) => {
                                const next = new Set(prev);
                                for (const pk of visiblePks) next.add(pk);
                                return next;
                              });
                            }
                          }}
                          className="inline-flex items-center justify-center"
                          title={allSelected ? "Deselect all on page" : "Select all on page"}
                          data-testid="checkbox-users-select-all"
                          disabled={visiblePks.length === 0}
                        >
                          {allSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                          ) : someSelected ? (
                            <MinusSquare className="h-3.5 w-3.5 text-brand-deep" />
                          ) : (
                            <Square
                              className={`h-3.5 w-3.5 ${visiblePks.length ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                            />
                          )}
                        </button>
                      );
                    })()}
                  </th>
                  <th className="sticky left-8 z-20 w-12 border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle dark:border-slate-800 dark:bg-slate-900"></th>
                  <th className="sticky left-20 z-20 whitespace-nowrap border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle shadow-[8px_0_10px_-8px_rgba(15,23,42,0.15)] dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Person
                    </span>
                  </th>
                  <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Status
                    </span>
                  </th>
                  <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Tier
                    </span>
                  </th>
                  <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                    <SortHeader label="Runs" sortKey="times_calculated" currentSort={userSort} onSort={handleSort} />
                  </th>
                  <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                    <SortHeader label="Last run" sortKey="last_triggered" currentSort={userSort} onSort={handleSort} />
                  </th>
                  <th className="sticky right-0 z-20 whitespace-nowrap bg-slate-50 px-2 py-2.5 text-center align-middle shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)] dark:bg-slate-900">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                      Loading users...
                    </td>
                  </tr>
                ) : adminUsersQuery.isError ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-sm text-red-400">
                      Failed to load users. Check your admin access.
                    </td>
                  </tr>
                ) : adminUsersList.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      {userSearch ? "No users match your search" : "No user data available"}
                    </td>
                  </tr>
                ) : filteredUsersList.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      No users match the current filter
                    </td>
                  </tr>
                ) : (
                  (clientFilteredUsers
                    ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                    : filteredUsersList
                  ).map((u, i) => {
                    const isExpanded = expandedRows.has(u.pubkey);
                    const prof = userProfiles.get(u.pubkey);
                    let npub: string;
                    try {
                      npub = nip19.npubEncode(u.pubkey);
                    } catch {
                      npub = u.pubkey;
                    }
                    const isTriggering = triggeringPubkeys.has(u.pubkey);
                    return (
                      <Fragment key={u.pubkey}>
                        <tr
                          className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/60 ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : ""}`}
                          onClick={() => {
                            setExpandedRows((prev) => {
                              const next = new Set(prev);
                              if (next.has(u.pubkey)) next.delete(u.pubkey);
                              else next.add(u.pubkey);
                              return next;
                            });
                          }}
                          data-testid={`row-user-${i}`}
                        >
                          <td
                            className="sticky left-0 z-10 w-8 border-r border-slate-100 bg-white px-2 py-2.5 group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUserPubkeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(u.pubkey)) next.delete(u.pubkey);
                                else next.add(u.pubkey);
                                return next;
                              });
                            }}
                          >
                            {(() => {
                              const isSelected = selectedUserPubkeys.has(u.pubkey);
                              const bs = bulkStatuses.get(u.pubkey);
                              return (
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center"
                                  data-testid={`checkbox-user-${i}`}
                                  title={isSelected ? "Deselect" : "Select"}
                                >
                                  {bs === "running" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                                  ) : bs === "success" ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                  ) : bs === "failed" ? (
                                    <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                  ) : isSelected ? (
                                    <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                  ) : (
                                    <Square className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                  )}
                                </button>
                              );
                            })()}
                          </td>
                          <td className="sticky left-8 z-10 w-12 border-r border-slate-100 bg-white px-2 py-2.5 group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900">
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const health = getUserHealth(u.latest_status, u.latest_ta_status, u.times_calculated);
                                const colors = {
                                  green: "bg-emerald-400",
                                  amber: "bg-amber-400",
                                  red: "bg-red-400",
                                  gray: "bg-slate-300",
                                };
                                const titles = {
                                  green: "Healthy",
                                  amber: "Partial failure",
                                  red: "Failing",
                                  gray: "No calculations",
                                };
                                return (
                                  <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${colors[health]}`}
                                    title={titles[health]}
                                    data-testid={`health-dot-${i}`}
                                  />
                                );
                              })()}
                              <ChevronDown
                                className={`h-3 w-3 text-slate-400 transition-transform dark:text-slate-500 ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </div>
                          </td>
                          <td
                            className="sticky left-20 z-10 border-r border-slate-100 bg-white px-2 py-2.5 shadow-[8px_0_10px_-8px_rgba(15,23,42,0.15)] group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900"
                            data-testid={`cell-profile-${i}`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Avatar className="h-6 w-6 shrink-0">
                                {prof?.picture ? (
                                  <AvatarImage src={prof.picture} alt={prof.name || "User"} className="object-cover" />
                                ) : null}
                                <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                                  {prof?.name?.charAt(0)?.toUpperCase() || (
                                    <Users className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                                  )}
                                </AvatarFallback>
                              </Avatar>
                              <span className="min-w-0">
                                <span className="block max-w-[140px] truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                                  {prof?.name || npub.slice(0, 12) + "…"}
                                </span>
                                <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                                  {npub.slice(0, 12)}…{npub.slice(-4)}
                                  <CopyButton text={npub} />
                                </span>
                              </span>
                            </div>
                          </td>
                          <td
                            className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                            data-testid={`cell-status-${i}`}
                          >
                            {(() => {
                              const run = u.latest_status?.toLowerCase();
                              const pub = u.latest_ta_status?.toLowerCase();
                              const runFailed = isFailedStatus(u.latest_status);
                              const pubFailed = isFailedStatus(u.latest_ta_status);
                              const chip = (tone: "emerald" | "red" | "slate", text: string) => (
                                <span
                                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    tone === "emerald"
                                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                      : tone === "red"
                                        ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                        : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                  }`}
                                >
                                  {text}
                                </span>
                              );
                              if (runFailed || pubFailed)
                                return (
                                  <div className="flex items-center gap-1">
                                    {chip("red", runFailed ? "calculation failed" : "publishing failed")}
                                    <span
                                      title="Failed — click the row to see the error"
                                      data-testid={runFailed ? `icon-status-failed-${i}` : `icon-ta-status-failed-${i}`}
                                    >
                                      <AlertTriangle className="h-3 w-3 text-red-500" />
                                    </span>
                                  </div>
                                );
                              if (run === "success" && pub === "success") return chip("emerald", "scored · published");
                              if (run === "success") return chip("emerald", "scored");
                              if (!run) return chip("slate", "pending");
                              return chip("slate", u.latest_status ?? "pending");
                            })()}
                          </td>
                          <td
                            className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {schedulingPolicies.length > 0 ? (
                              <UserTierPicker
                                pubkey={u.pubkey}
                                schedulingId={u.scheduling_id}
                                schedulingName={u.scheduling_name}
                                policies={schedulingPolicies}
                                displayName={prof?.name}
                                picture={prof?.picture}
                              />
                            ) : (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {u.scheduling_name}
                              </span>
                            )}
                          </td>
                          <td
                            className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                            data-testid={`cell-times-calc-${i}`}
                          >
                            <span className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                              {u.times_calculated}
                            </span>
                          </td>
                          <td
                            className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                            data-testid={`cell-last-triggered-${i}`}
                          >
                            <div>
                              <span className="block text-[10px] text-slate-600 dark:text-slate-300">
                                {formatTimestamp(u.last_triggered)}
                              </span>
                              {timeAgo(u.last_triggered) && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {timeAgo(u.last_triggered)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="sticky right-0 z-10 bg-white px-2 py-2.5 text-center shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-900">
                            <UserActionsMenu
                              pubkey={u.pubkey}
                              triggering={isTriggering}
                              triggerDisabled={bulkRunning || bulkStatuses.get(u.pubkey) === "running"}
                              onTrigger={() => setTriggerConfirmPubkey(u.pubkey)}
                              onView={() => {
                                window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                                navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                              }}
                              onPublishTrustedLists={() => onPublishTrustedLists(u.pubkey)}
                              dictionary={{
                                taPubkey: u.ta_pubkey,
                                name: prof?.name || `${npub.slice(0, 12)}…`,
                              }}
                              testIdSuffix={i}
                            />
                          </td>
                        </tr>
                        {(isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status)) && !isExpanded && (
                          <tr
                            className="border-b border-red-100 bg-red-50/40 dark:border-red-500/25 dark:bg-red-500/10"
                            data-testid={`row-failure-summary-${i}`}
                          >
                            <td colSpan={8} className="px-3 py-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                                <span className="text-[10px] font-medium text-red-800 dark:text-red-300">
                                  {isFailedStatus(u.latest_status) && isFailedStatus(u.latest_ta_status)
                                    ? "GrapeRank and TA Attestation both failed on the most recent run."
                                    : isFailedStatus(u.latest_status)
                                      ? "GrapeRank calculation failed on the most recent run."
                                      : "TA Attestation failed on the most recent run."}
                                </span>
                                <span className="text-[10px] text-red-600/80 dark:text-red-400/80">
                                  Open the error history to see the full message.
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedRows((prev) => {
                                      const next = new Set(prev);
                                      next.add(u.pubkey);
                                      return next;
                                    });
                                  }}
                                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/15"
                                  data-testid={`button-view-error-history-${i}`}
                                >
                                  <Eye className="h-3 w-3" /> View error history
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {isExpanded && (
                          <UserHistoryRow
                            pubkey={u.pubkey}
                            npub={npub}
                            taPubkey={u.ta_pubkey}
                            schedulingName={u.scheduling_name}
                          />
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollableTable>
        </div>

        {/* Mobile: stacked user cards (the wide table is md+ only) */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 md:hidden" data-testid="cards-users">
          {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
              Loading users...
            </div>
          ) : adminUsersQuery.isError ? (
            <div className="px-4 py-10 text-center text-sm text-red-400">
              Failed to load users. Check your admin access.
            </div>
          ) : adminUsersList.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              {userSearch ? "No users match your search" : "No user data available"}
            </div>
          ) : filteredUsersList.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              No users match the current filter
            </div>
          ) : (
            (activeNameSearch
              ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
              : filteredUsersList
            ).map((u, i) => {
              const prof = userProfiles.get(u.pubkey);
              let npub: string;
              try {
                npub = nip19.npubEncode(u.pubkey);
              } catch {
                npub = u.pubkey;
              }
              const isTriggering = triggeringPubkeys.has(u.pubkey);
              const isSelected = selectedUserPubkeys.has(u.pubkey);
              const bs = bulkStatuses.get(u.pubkey);
              const health = getUserHealth(u.latest_status, u.latest_ta_status, u.times_calculated);
              const healthColors = {
                green: "bg-emerald-400",
                amber: "bg-amber-400",
                red: "bg-red-400",
                gray: "bg-slate-300",
              } as const;
              return (
                <div
                  key={u.pubkey}
                  className={`p-3 ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : "bg-white dark:bg-slate-900"}`}
                  data-testid={`card-user-${i}`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedUserPubkeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.pubkey)) next.delete(u.pubkey);
                          else next.add(u.pubkey);
                          return next;
                        })
                      }
                      className="mt-0.5 shrink-0"
                      title={isSelected ? "Deselect" : "Select"}
                      data-testid={`card-checkbox-user-${i}`}
                    >
                      {bs === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                      ) : bs === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : bs === "failed" ? (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : isSelected ? (
                        <CheckSquare className="h-4 w-4 text-brand-deep" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                    <Avatar className="h-9 w-9 shrink-0">
                      {prof?.picture ? (
                        <AvatarImage src={prof.picture} alt={prof.name || "User"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                        {prof?.name?.charAt(0)?.toUpperCase() || (
                          <Users className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${healthColors[health]}`} />
                        <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {prof?.name || npub.slice(0, 12) + "..."}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="truncate font-mono text-[10px] text-brand-primary/80">
                          {npub.slice(0, 16)}...{npub.slice(-4)}
                        </span>
                        <CopyButton text={npub} />
                      </div>
                    </div>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {schedulingPolicies.length > 0 ? (
                        <UserTierPicker
                          pubkey={u.pubkey}
                          schedulingId={u.scheduling_id}
                          schedulingName={u.scheduling_name}
                          policies={schedulingPolicies}
                          displayName={prof?.name}
                          picture={prof?.picture}
                        />
                      ) : (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{u.scheduling_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {u.latest_status && (
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${u.latest_status.toLowerCase() === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300" : isFailedStatus(u.latest_status) ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}
                      >
                        {u.latest_status}
                      </span>
                    )}
                    {u.latest_ta_status && (
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${u.latest_ta_status.toLowerCase() === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300" : isFailedStatus(u.latest_ta_status) ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}
                      >
                        TA {u.latest_ta_status}
                      </span>
                    )}
                    <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                      {u.times_calculated} calcs
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      · Updated {timeAgo(u.last_updated) || formatTimestamp(u.last_updated)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-end">
                    <UserActionsMenu
                      pubkey={u.pubkey}
                      triggering={isTriggering}
                      triggerDisabled={bulkRunning || bulkStatuses.get(u.pubkey) === "running"}
                      onTrigger={() => setTriggerConfirmPubkey(u.pubkey)}
                      onView={() => {
                        window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                        navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                      }}
                      onPublishTrustedLists={() => onPublishTrustedLists(u.pubkey)}
                      dictionary={{
                        taPubkey: u.ta_pubkey,
                        name: prof?.name || `${npub.slice(0, 12)}…`,
                      }}
                      testIdSuffix={`card-${i}`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/60 sm:gap-3 sm:px-5">
          {adminUsersQuery.isFetching && (
            <div className="ml-auto flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-slate-400 dark:text-slate-500" />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Refreshing...</span>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/60 sm:px-5"
            data-testid="pagination-users"
          >
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Page {userPage + 1} of {totalPages} (
              {(activeNameSearch ? filteredUsersList.length : adminUsersTotal).toLocaleString()} total)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={userPage === 0}
                onClick={() => setUserPage((p) => p - 1)}
                className="no-default-hover-elevate no-default-active-elevate"
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={userPage >= totalPages - 1}
                onClick={() => setUserPage((p) => p + 1)}
                className="no-default-hover-elevate no-default-active-elevate"
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={triggerConfirmPubkey !== null}
        onOpenChange={(open) => {
          if (!open) setTriggerConfirmPubkey(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Confirm GrapeRank Trigger
            </DialogTitle>
            <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
              You are about to manually trigger a GrapeRank calculation. Please review the details below before
              confirming.
            </DialogDescription>
          </DialogHeader>
          {triggerConfirmPubkey && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  What happens when you confirm
                </p>
                <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                  <li>A GrapeRank calculation request is sent to the Brainstorm server for this user's pubkey</li>
                  <li>
                    The server crawls the user's Nostr social graph — follows, mutes, and interactions — to compute
                    personalized scores
                  </li>
                  <li>
                    This is <span className="font-semibold">resource-intensive</span> and may take several minutes
                    depending on graph size
                  </li>
                  <li>
                    Progress and results will appear in the <span className="font-semibold">Activity tab</span> once
                    processing begins
                  </li>
                  <li>If a calculation is already running for this user, a duplicate request may be queued</li>
                </ul>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-500/25 dark:bg-blue-500/10">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Good to know
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  GrapeRank scores are calculated relative to the user's own social graph. Each user's network is
                  unique. Triggering this does not affect other users' scores.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Target Pubkey
                </p>
                <p
                  className="break-all font-mono text-xs text-slate-800 dark:text-slate-200"
                  data-testid="text-trigger-confirm-pubkey"
                >
                  {triggerConfirmPubkey}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTriggerConfirmPubkey(null)}
                  className="no-default-hover-elevate no-default-active-elevate text-xs"
                  data-testid="button-cancel-trigger"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const pk = triggerConfirmPubkey;
                    setTriggerConfirmPubkey(null);
                    triggerGraperank(pk);
                  }}
                  className="no-default-hover-elevate no-default-active-elevate gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                  data-testid="button-confirm-trigger"
                >
                  <Play className="h-3.5 w-3.5" />
                  Confirm Trigger
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
