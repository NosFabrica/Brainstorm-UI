import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { UserTierPicker } from "@/components/admin/scheduling/UserTierPicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type SchedulingItem } from "@/services/api";
import {
  Users,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  Square,
  CheckSquare,
  MinusSquare,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { Fragment } from "react";
import { useLocation } from "wouter";
import { type BulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { CopyButton } from "../CopyButton";
import { SortHeader } from "../SortHeader";
import { isFailedStatus } from "../failures";
import { formatTimestamp, timeAgo } from "../format";
import { getUserHealth } from "../metrics";
import { type AdminUserListItem } from "../types";
import { UserHistoryRow } from "./UserHistoryRow";
import { type UsersDirectory } from "./useUsersDirectory";

/** What the directory's table and its phone cards both draw from. */
export type UserRowsProps = {
  directory: UsersDirectory;
  bulk: BulkRetrigger;
  /** People with a run in flight, from any control. */
  triggering: ReadonlySet<string>;
  /** Every row that matches: the backend's page, or every match when the tab filters itself. */
  filteredUsersList: AdminUserListItem[];
  /** The page on screen (`pageOfUsers`), the same for the table and the phone cards. */
  pageRows: AdminUserListItem[];
  userProfiles: Map<string, { name?: string; picture?: string }>;
  schedulingPolicies: SchedulingItem[];
  setTriggerConfirmPubkey: (pubkey: string) => void;
  onPublishTrustedLists: (pubkey: string) => void;
};

/** The directory's table (md and up): a row a user, opening on their run history. */
export function UsersTable({
  directory,
  bulk,
  triggering: triggeringPubkeys,
  filteredUsersList,
  pageRows,
  userProfiles,
  schedulingPolicies,
  setTriggerConfirmPubkey,
  onPublishTrustedLists,
}: UserRowsProps) {
  const {
    userSearch,
    userSort,
    expandedRows,
    setExpandedRows,
    highlightedPubkey,
    selectedUserPubkeys,
    setSelectedUserPubkeys,
    adminUsersQuery,
    adminUsersList,
    handleSort,
  } = directory;
  const { running: bulkRunning, statuses: bulkStatuses } = bulk;
  const [, navigate] = useLocation();
  return (
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
                  const visiblePks = pageRows.map((u) => u.pubkey);
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
              pageRows.map((u, i) => {
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
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">{u.scheduling_name}</span>
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
  );
}
