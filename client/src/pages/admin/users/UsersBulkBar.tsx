import { ALL_USERS_DAYS } from "@/components/admin/useAdminHeaderMetrics";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/services/api";
import { RefreshCw, Loader2, CheckSquare } from "lucide-react";
import { useState } from "react";
import { type BulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { BulkResultBanner } from "../BulkResultBanner";
import { type AdminUserListItem } from "../types";
import { type UsersDirectory } from "./useUsersDirectory";

const SELECT_ALL_MATCHING_CAP = 200;

/**
 * Under the directory's header while rows are picked or a bulk run has
 * finished: the selection (and "Select all matching", up to 200), its
 * re-trigger and progress, and the last run's result.
 */
export function UsersBulkBar({
  directory,
  bulk,
  filteredUsersList,
  clientFilteredUsers,
  usersPage,
}: {
  directory: UsersDirectory;
  bulk: BulkRetrigger;
  filteredUsersList: AdminUserListItem[];
  clientFilteredUsers: boolean;
  /** The page on screen and the matching total (`pageOfUsers`). */
  usersPage: { rows: AdminUserListItem[]; total: number };
}) {
  const { userSort, kpiFilter, selectedUserPubkeys, setSelectedUserPubkeys, debouncedSearch, activeNameSearch } =
    directory;
  const { running: bulkRunning, statuses: bulkStatuses } = bulk;
  const { toast } = useToast();
  const [fetchingMatching, setFetchingMatching] = useState(false);
  return (
    <div className="space-y-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800/60 sm:px-5">
      {selectedUserPubkeys.size > 0 &&
        (() => {
          const dedupePubkeys = Array.from(selectedUserPubkeys);
          const liveCount = bulkRunning
            ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
            : 0;
          const liveTotal = bulkRunning ? bulkStatuses.size : 0;
          const liveFailed = bulkRunning ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length : 0;
          const clientFiltered = clientFilteredUsers;
          const matchingTotal = usersPage.total;
          const visibleCount = usersPage.rows.length;
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
                  onClick={() => void handleSelectAllMatching()}
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
  );
}
