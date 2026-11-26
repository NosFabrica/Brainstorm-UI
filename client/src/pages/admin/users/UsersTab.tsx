import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { type SchedulingItem } from "@/services/api";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState, useMemo, useCallback, useDeferredValue } from "react";
import { AdminSearchInput } from "@/components/admin/users/AdminSearchInput";
import { type BulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { type AdminUserListItem } from "../types";
import { LookupOnboardDialog } from "./LookupOnboardDialog";
import { filterUsers } from "./filterUsers";
import { type UsersDirectory } from "./useUsersDirectory";
import { KpiFilterBadge } from "./KpiFilterBadge";
import { TriggerConfirmDialog } from "./TriggerConfirmDialog";
import { UserCards } from "./UserCards";
import { UsersBulkBar } from "./UsersBulkBar";
import { type UserRowsProps, UsersTable } from "./UsersTable";

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
    userPage,
    setUserPage,
    pageSize,
    kpiFilter,
    setKpiFilter,
    setExpandedRows,
    setHighlightedPubkey,
    selectedUserPubkeys,
    lookupOpen,
    setLookupOpen,
    activeNameSearch,
    adminUsersQuery,
    adminUsersList,
    adminUsersTotal,
    adminUsersTotalPages,
    handlePageSizeChange,
  } = directory;
  const { lastResult: bulkLastResult } = bulk;
  const { toast } = useToast();
  const [triggerConfirmPubkey, setTriggerConfirmPubkey] = useState<string | null>(null);

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

  const rowsProps: UserRowsProps = {
    directory,
    bulk,
    triggering: triggeringPubkeys,
    filteredUsersList,
    clientFilteredUsers,
    userProfiles,
    schedulingPolicies,
    setTriggerConfirmPubkey,
    onPublishTrustedLists,
  };

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
          <UsersBulkBar
            directory={directory}
            bulk={bulk}
            filteredUsersList={filteredUsersList}
            clientFilteredUsers={clientFilteredUsers}
          />
        )}

        {kpiFilter && <KpiFilterBadge kpiFilter={kpiFilter} onClear={() => setKpiFilter(null)} />}

        <UsersTable {...rowsProps} />

        {/* Mobile: stacked user cards (the wide table is md+ only) */}
        <UserCards {...rowsProps} />

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

      <TriggerConfirmDialog
        pubkey={triggerConfirmPubkey}
        setPubkey={setTriggerConfirmPubkey}
        onConfirm={triggerGraperank}
      />
    </>
  );
}
