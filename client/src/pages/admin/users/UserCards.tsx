import type { UserRowsProps } from "./UsersTable";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import { UserTierPicker } from "@/components/admin/scheduling/UserTierPicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, CheckCircle2, XCircle, Loader2, Square, CheckSquare } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useLocation } from "wouter";
import { CopyButton } from "../CopyButton";
import { isFailedStatus } from "../failures";
import { formatTimestamp, timeAgo } from "../format";
import { getUserHealth } from "../metrics";

/** The directory on a phone: a card a user (the wide table is md+ only). */
export function UserCards({
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
    highlightedPubkey,
    selectedUserPubkeys,
    setSelectedUserPubkeys,
    adminUsersQuery,
    adminUsersList,
  } = directory;
  const { running: bulkRunning, statuses: bulkStatuses } = bulk;
  const [, navigate] = useLocation();
  return (
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
        pageRows.map((u, i) => {
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
  );
}
