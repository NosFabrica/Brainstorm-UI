import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  Users2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import {
  apiClient,
  type CreateSchedulingBody,
  type SchedulingItem,
  type UpdateSchedulingBody,
} from "@/services/api";
import { formatDuration } from "@/lib/schedulingDurations";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PolicyFormDialog } from "./PolicyFormDialog";
import { UserResultRow } from "./UserResultRow";
import { UserTierPicker } from "./UserTierPicker";
import { AssignUsersDialog } from "./AssignUsersDialog";
import { usePolicyMembers, type PolicyMember } from "./usePolicyMembers";

const POLICIES_KEY = ["/api/admin/scheduling"];
const STATS_KEY = ["/api/admin/scheduling/stats"];
const USERS_KEY = ["/api/admin/users"];
const CLIENT_PAGE = 25;

type DialogState = { mode: "create" | "edit"; initial?: SchedulingItem };
type MemberSort = "recent" | "oldest" | "az";

/**
 * Rough next-run estimate: last published + the tier's interval. The scheduler
 * ultimately decides based on queue/priority, so this is only an estimate.
 */
function nextRunLabel(lastPublished: string | null, intervalSeconds: number): string {
  if (!lastPublished) return "on next cycle";
  const last = new Date(lastPublished).getTime();
  if (!Number.isFinite(last)) return "on next cycle";
  const deltaSec = Math.round((last + intervalSeconds * 1000 - Date.now()) / 1000);
  if (deltaSec <= 0) return "due now";
  return `in ${formatDuration(deltaSec)}`;
}

/**
 * Inline user management for a single policy, rendered inside an expanded table
 * row: the assigned-user list (enriched with avatars + names + per-user tier
 * controls) plus an "Add users" button that opens the rich AssignUsersDialog.
 */
function PolicyUsersInline({
  policy,
  policies,
}: {
  policy: SchedulingItem;
  policies: SchedulingItem[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { members, total, truncated, isLoading, isError, enriching } =
    usePolicyMembers(policy.id);

  const [assignOpen, setAssignOpen] = useState(false);
  const [removingPk, setRemovingPk] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PolicyMember | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MemberSort>("recent");
  const [neverOnly, setNeverOnly] = useState(false);
  const [page, setPage] = useState(1);

  const usersKey = ["/api/admin/scheduling", policy.id, "users"];
  const defaultPolicy = policies.find((p) => p.is_default);
  const defaultId = defaultPolicy?.id;
  const defaultName = defaultPolicy?.name ?? "default";

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setPage(1);
  }, [query, sort, neverOnly]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      if (neverOnly && m.lastPublished != null) return false;
      if (!q) return true;
      return (
        (m.name?.toLowerCase().includes(q) ?? false) ||
        m.npub.toLowerCase().includes(q) ||
        m.pubkey.toLowerCase().includes(q)
      );
    });
    const ts = (v: string | null) => (v ? new Date(v).getTime() : null);
    return [...list].sort((a, b) => {
      if (sort === "az") {
        const an = a.name?.trim();
        const bn = b.name?.trim();
        if (an && bn) return an.localeCompare(bn, undefined, { sensitivity: "base" });
        if (an) return -1;
        if (bn) return 1;
        return a.npub.localeCompare(b.npub);
      }
      const at = ts(a.lastPublished);
      const bt = ts(b.lastPublished);
      if (at == null && bt == null) return 0;
      if (at == null) return 1; // never-published sorts last
      if (bt == null) return -1;
      return sort === "recent" ? bt - at : at - bt;
    });
  }, [members, query, sort, neverOnly]);

  const pages = Math.max(1, Math.ceil(filtered.length / CLIENT_PAGE));
  const clampedPage = Math.min(page, pages);
  const pageItems = filtered.slice(
    (clampedPage - 1) * CLIENT_PAGE,
    clampedPage * CLIENT_PAGE,
  );

  function refetchUsers() {
    queryClient.invalidateQueries({ queryKey: usersKey });
    queryClient.invalidateQueries({ queryKey: STATS_KEY });
  }

  async function handleRemove(pubkey: string) {
    if (defaultId == null) return;
    setRemovingPk(pubkey);
    try {
      await apiClient.assignUserScheduling(pubkey, defaultId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersKey }),
        queryClient.invalidateQueries({ queryKey: POLICIES_KEY }),
        queryClient.invalidateQueries({ queryKey: STATS_KEY }),
        queryClient.invalidateQueries({ queryKey: USERS_KEY }),
      ]);
      toast({ title: "Moved to the default tier" });
    } catch (e) {
      toast({
        title: "Couldn't remove user",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRemovingPk(null);
    }
  }

  const showToolbar = total > 0;
  const filteredLabel =
    !query.trim() && !neverOnly
      ? `${total} user${total === 1 ? "" : "s"}`
      : `${filtered.length} of ${total}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Assigned users
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {total}
            {truncated ? "+" : ""} total
          </span>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-brand-deep hover:bg-brand-primary text-white no-default-hover-elevate no-default-active-elevate"
          onClick={() => setAssignOpen(true)}
          data-testid={`add-users-${policy.id}`}
        >
          <Plus className="h-3.5 w-3.5" /> Add users
        </Button>
      </div>

      {showToolbar && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, npub, or hex…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/40"
              data-testid={`search-users-${policy.id}`}
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as MemberSort)}>
            <SelectTrigger className="w-full sm:w-44 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Last published (newest)</SelectItem>
              <SelectItem value="oldest">Last published (oldest)</SelectItem>
              <SelectItem value="az">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setNeverOnly((v) => !v)}
            aria-pressed={neverOnly}
            className={`h-8 px-3 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
              neverOnly
                ? "bg-brand-deep text-white border-brand-deep"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Never published
          </button>
        </div>
      )}

      {showToolbar && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span className="tabular-nums">{filteredLabel}</span>
          {enriching && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> resolving names…
            </span>
          )}
        </div>
      )}

      {isError ? (
        <p className="text-xs text-red-500">Failed to load users.</p>
      ) : isLoading ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5" role="status">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading users…
        </p>
      ) : total === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No users assigned yet. Use “Add users” to put people on this tier.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No users match your search.</p>
      ) : (
        <div className="space-y-1">
          {pageItems.map((m) => {
            const lastLabel = m.lastPublished
              ? `Last published ${new Date(m.lastPublished).toLocaleDateString()}`
              : "Never published";
            const nextLabel = nextRunLabel(m.lastPublished, policy.schedule_interval_seconds);
            return (
              <UserResultRow
                key={m.pubkey}
                pubkey={m.pubkey}
                npub={m.npub}
                name={m.name}
                picture={m.picture}
                subtitle={
                  <span title="Next run is estimated from the tier interval; the scheduler may adjust it based on queue and priority.">
                    {lastLabel}
                    <span className="text-slate-300 dark:text-slate-600"> · </span>
                    Next ~ {nextLabel}
                  </span>
                }
                trailing={
                  <>
                    <UserTierPicker
                      pubkey={m.pubkey}
                      schedulingId={policy.id}
                      schedulingName={policy.name}
                      policies={policies}
                      onChanged={refetchUsers}
                    />
                    <button
                      type="button"
                      aria-label="Move to default tier"
                      disabled={
                        removingPk === m.pubkey || defaultId == null || policy.is_default
                      }
                      title={
                        policy.is_default
                          ? "This is the default tier"
                          : `Move to the default “${defaultName}” tier`
                      }
                      onClick={() => setConfirmRemove(m)}
                      className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors"
                    >
                      {removingPk === m.pubkey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-slate-400">
          <button
            type="button"
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <span className="tabular-nums">
            Page {clampedPage} of {pages}
          </span>
          <button
            type="button"
            disabled={clampedPage >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      <AssignUsersDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        policyId={policy.id}
        policyName={policy.name}
        onAssigned={() => queryClient.invalidateQueries({ queryKey: usersKey })}
      />

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move user to the default tier?</DialogTitle>
            <DialogDescription>
              {confirmRemove
                ? `“${confirmRemove.name || confirmRemove.npub.slice(0, 16) + "…"}” will move from “${policy.name}” to the default “${defaultName}” tier. They stay in scheduled sync — just on the default cadence.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              className="bg-brand-deep hover:bg-brand-primary text-white no-default-hover-elevate no-default-active-elevate"
              onClick={async () => {
                const pk = confirmRemove?.pubkey;
                setConfirmRemove(null);
                if (pk) await handleRemove(pk);
              }}
            >
              Move to {defaultName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SchedulingCard({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<SchedulingItem[]>({
    queryKey: POLICIES_KEY,
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: active,
  });
  const policies = data ?? [];

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState<Record<number, boolean>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SchedulingItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleExpand(id: number) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.deleteSchedulingPolicy(confirmDelete.id);
      await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      setConfirmDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  function clearPending(id: number) {
    setPendingEnabled((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  async function handleToggleEnabled(p: SchedulingItem) {
    const next = !(pendingEnabled[p.id] ?? p.enabled);
    setPendingEnabled((m) => ({ ...m, [p.id]: next }));
    try {
      await apiClient.updateSchedulingPolicy(p.id, { enabled: next });
      await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      clearPending(p.id);
    } catch (e) {
      clearPending(p.id); // revert to server truth
      toast({
        title: "Couldn't update policy",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handleSubmit(body: CreateSchedulingBody | UpdateSchedulingBody) {
    const editing = dialog?.mode === "edit" && dialog.initial;
    setSubmitting(true);
    try {
      if (editing) {
        await apiClient.updateSchedulingPolicy(dialog!.initial!.id, body);
      } else {
        await apiClient.createSchedulingPolicy(body as CreateSchedulingBody);
      }
      await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      setDialog(null);
      toast({ title: editing ? "Policy updated" : "Policy created" });
    } catch (e) {
      toast({
        title: editing ? "Update failed" : "Create failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {policies.length > 0
            ? `${policies.length} tier${policies.length === 1 ? "" : "s"} · expand a row to manage its users`
            : "Define tiers for automatic GrapeRank recalculation"}
        </p>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-brand-deep hover:bg-brand-primary text-white no-default-hover-elevate no-default-active-elevate"
          onClick={() => setDialog({ mode: "create" })}
          data-testid="button-new-policy"
        >
          <Plus className="h-3.5 w-3.5" />
          New policy
        </Button>
      </div>

      {isError ? (
        <div className="text-center py-10">
          <p className="text-sm text-slate-500 dark:text-slate-400">Failed to load scheduling policies.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 py-6" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading scheduling policies…
        </p>
      ) : policies.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">No scheduling policies.</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Create a tier to control how often GrapeRank recalculates.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[760px]" data-testid="table-scheduling-policies">
            <thead>
              <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Policy
                </th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Priority
                </th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Interval
                </th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Manual quota
                </th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Users
                </th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Enabled
                </th>
                <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const isExpanded = expandedId === p.id;
                const on = pendingEnabled[p.id] ?? p.enabled;
                return (
                  <Fragment key={p.id}>
                    <tr
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 transition-colors"
                      data-testid={`row-policy-${p.id}`}
                    >
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          aria-label={isExpanded ? "Collapse row" : "Expand row"}
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpand(p.id)}
                          className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-brand-deep hover:bg-brand-accent/10 transition-colors"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                            {p.name}
                          </span>
                          {p.is_default && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-brand-accent/10 text-brand-deep border border-brand-accent/20">
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-[13px] tabular-nums text-slate-700 dark:text-slate-200">
                        {p.priority}
                      </td>
                      <td
                        className="px-2 py-2.5 text-[13px] text-slate-700 dark:text-slate-200"
                        title={`${p.schedule_interval_seconds}s`}
                      >
                        {formatDuration(p.schedule_interval_seconds)}
                      </td>
                      <td
                        className="px-2 py-2.5 text-[13px] text-slate-700 dark:text-slate-200 whitespace-nowrap"
                        title={`${p.manual_quota_window_seconds}s window`}
                      >
                        {p.manual_quota_limit} / {formatDuration(p.manual_quota_window_seconds)}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleExpand(p.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-brand-deep bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/20 transition-colors"
                        >
                          <Users2 className="h-3 w-3" /> Manage
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={on}
                            onCheckedChange={() => handleToggleEnabled(p)}
                            aria-label={`Toggle ${p.name}`}
                            className="data-[state=checked]:!bg-brand-deep"
                          />
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 w-14">
                            {on ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label="Edit"
                            title="Edit policy"
                            onClick={() => setDialog({ mode: "edit", initial: p })}
                            className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-brand-deep hover:bg-brand-accent/10 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete"
                            disabled={p.is_default}
                            title={
                              p.is_default
                                ? "The default policy can't be deleted"
                                : "Delete policy"
                            }
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDelete(p);
                            }}
                            className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400 disabled:cursor-not-allowed transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr data-testid={`row-policy-users-${p.id}`}>
                        <td colSpan={8} className="px-4 py-4 bg-slate-50/60 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/60">
                          <PolicyUsersInline policy={p} policies={policies} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <PolicyFormDialog
          open
          mode={dialog.mode}
          initial={dialog.initial}
          submitting={submitting}
          onOpenChange={(o) => !o && setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scheduling policy</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `Delete "${confirmDelete.name}"? This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              Delete policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
