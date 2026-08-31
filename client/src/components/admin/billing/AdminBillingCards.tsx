import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  FileJson,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Ban,
  User,
  XCircle,
} from "lucide-react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  apiClient,
  type AdminBillingDivergenceSection,
  type AdminBillingSubscription,
} from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/tones";
import { npubFromPubkey } from "@/lib/shareId";

const SUBS_KEY = ["/api/admin/billing/subscriptions"];
const DIVERGENCE_KEY = ["/api/admin/billing/divergence"];

/**
 * Money still lives in Flash — invoices, refunds and cancellation. Block is the
 * one write this tab owns, and it deliberately does *not* touch the charge.
 */
const FLASH_VAULT_URL = "https://dev.vault.paywithflash.com";
const FLASH_DASHBOARD_URL = `${FLASH_VAULT_URL}/subscriptions`;

/** Deep link to one subscription's detail page in the Flash dashboard. */
function flashSubscriptionUrl(subscriptionId: string): string {
  return `${FLASH_VAULT_URL}/subscriptions/active/${subscriptionId}`;
}

/** Flash's statuses are an open set — color the ones we know, never crash on new ones. */
function statusTone(status: string): Tone {
  if (status === "active" || status === "trial") return "success";
  if (status === "pending" || status === "past_due" || status === "paused") return "warning";
  if (status === "canceled" || status === "expired") return "neutral";
  return "neutral";
}

/**
 * The server's EntitlementReason, in words. Most of these are *decisions*, not
 * errors — "held" and "unknown_plan" mean it looked and deliberately left the
 * tier alone, which is easy to misread as the call having done nothing.
 */
const RESYNC_REASONS: Record<string, string> = {
  granted: "Flash says they're entitled; the paid tier is applied.",
  revoked: "The subscription has ended — they're back on the default tier.",
  held: "Nothing certain enough to act on (dunning, or a cancellation still inside its paid period). Tier left as-is.",
  blocked: "They're blocked from paid entitlement, so nothing was granted.",
  admin_override: "An admin assignment holds this tier; billing didn't take it away.",
  no_reference: "The subscription carries no reference to a user.",
  unknown_user: "No account matches this pubkey.",
  unknown_plan: "Flash's plan isn't mapped to an entitlement here — map it under plans.",
  unknown_subscription: "Flash has no subscription for this user.",
  reference_mismatch: "Flash's record names a different user. Nothing was changed — worth investigating.",
  busy: "Something else is reconciling this user right now. Try again shortly.",
};

function resyncReasonText(reason: string): string {
  return RESYNC_REASONS[reason] ?? `Server reported "${reason}".`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

/** "npub1abc…wxyz" — enough to recognize, full value in the title attribute. */
function shortNpub(pubkey: string): { short: string; full: string } {
  try {
    const npub = npubFromPubkey(pubkey);
    return { short: `${npub.slice(0, 12)}…${npub.slice(-4)}`, full: npub };
  } catch {
    return { short: `${pubkey.slice(0, 8)}…`, full: pubkey };
  }
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const td = "px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200";

type ProfileBits = { name?: string; picture?: string };

type SortKey = "subscriber" | "status" | "scheduling" | "source" | "period" | "synced";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** Same affordance as the Users tab's SortHeader: label + direction chevrons. */
function BillingSortHeader({ label, sortKey, sort, onSort }: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      className="flex items-center gap-1 uppercase tracking-wide font-semibold hover:text-slate-800 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-billing-${sortKey}`}
    >
      {label}
      {active ? (
        sort!.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

/**
 * Kind-0 enrichment for the roster, same seam the scheduling admin uses
 * (usePolicyMembers): render immediately with npubs, fill names/avatars in
 * as profiles arrive. Best-effort — a relay miss just leaves the npub.
 */
function useRosterProfiles(pubkeys: string[]): Map<string, ProfileBits> {
  const [profiles, setProfiles] = useState<Map<string, ProfileBits>>(new Map());
  const key = pubkeys.join(",");
  useEffect(() => {
    const targets = key ? key.split(",") : [];
    if (!targets.length) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchProfileMap(targets);
        if (cancelled) return;
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const pk of targets) {
            const c = map.get(pk);
            if (c) next.set(pk, { name: c.display_name || c.name, picture: c.picture });
          }
          return next;
        });
      } catch {
        /* best-effort — npubs stay */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return profiles;
}

/** Search matches who they are (name/npub/pubkey) or what they're granted; filters are exact. */
function filterAndSort(
  items: AdminBillingSubscription[],
  profiles: Map<string, ProfileBits>,
  search: string,
  statusFilter: string,
  sourceFilter: string,
  sort: SortState,
): AdminBillingSubscription[] {
  const q = search.trim().toLowerCase();
  let out = items.filter((s) => {
    if (statusFilter !== "all" && s.flash_status !== statusFilter) return false;
    if (sourceFilter !== "all" && s.scheduling_source !== sourceFilter) return false;
    if (!q) return true;
    const name = profiles.get(s.pubkey)?.name?.toLowerCase() ?? "";
    const scheduling = (s.granted_scheduling_name ?? s.scheduling_name ?? "").toLowerCase();
    return (
      name.includes(q) ||
      shortNpub(s.pubkey).full.toLowerCase().includes(q) ||
      s.pubkey.toLowerCase().includes(q) ||
      scheduling.includes(q)
    );
  });
  if (sort) {
    const value = (s: AdminBillingSubscription): string => {
      switch (sort.key) {
        case "subscriber":
          return (profiles.get(s.pubkey)?.name ?? shortNpub(s.pubkey).full).toLowerCase();
        case "status":
          return s.flash_status;
        case "scheduling":
          return (s.granted_scheduling_name ?? s.scheduling_name ?? "").toLowerCase();
        case "source":
          return s.scheduling_source;
        // ISO timestamps sort correctly as strings; missing dates sink to the bottom.
        case "period":
          return s.current_period_end ?? "";
        case "synced":
          return s.last_synced_at ?? "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => value(a).localeCompare(value(b)) * dir);
  }
  return out;
}

/**
 * What Flash itself says, beside what we stored. The divergence report claims
 * the two disagree; this is where that claim is checked at the source, without
 * a shell or a live API key.
 *
 * Read-only — it applies no entitlement and touches no stored row — and the
 * body is Flash's own, so the extra rows a resync would disambiguate away are
 * visible here.
 */
function FlashRecordDialog({
  subscriber,
  onClose,
}: {
  subscriber: AdminBillingSubscription | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["/api/admin/billing/flash-record", subscriber?.pubkey],
    queryFn: () => apiClient.getAdminBillingFlashRecordForSubscriber(subscriber!.pubkey),
    enabled: !!subscriber,
    // Every read spends our Flash quota, so don't re-ask on a reopen or a retry.
    staleTime: 60_000,
    retry: false,
    gcTime: 0,
  });
  const rows = (query.data as { subscriptions?: unknown[] } | undefined)?.subscriptions;

  return (
    <Dialog open={!!subscriber} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="dialog-billing-flash-record">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Flash's record
            {Array.isArray(rows) && (
              <Chip tone={rows.length > 1 ? "warning" : "neutral"} size="sm">
                {rows.length} {rows.length === 1 ? "row" : "rows"}
              </Chip>
            )}
          </DialogTitle>
          <DialogDescription>
            Exactly what Flash returned for{" "}
            {subscriber ? shortNpub(subscriber.pubkey).short : ""} — every row, not
            just the one entitlement uses. Nothing was changed by looking.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Asking Flash…
          </div>
        ) : query.isError ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-flash-record-error">
            {(query.error as Error)?.message}
          </p>
        ) : (
          <pre
            className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 font-mono text-xs text-slate-700 dark:text-slate-200"
            data-testid="billing-flash-record-json"
          >
            {JSON.stringify(query.data, null, 2)}
          </pre>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-billing-flash-record-close">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscriberRow({
  s,
  profile,
  busy,
  onBlock,
  onUnblock,
  onResync,
  onViewFlashRecord,
}: {
  s: AdminBillingSubscription;
  profile?: ProfileBits;
  busy: boolean;
  onBlock: (s: AdminBillingSubscription) => void;
  onUnblock: (s: AdminBillingSubscription) => void;
  onResync: (s: AdminBillingSubscription) => void;
  onViewFlashRecord: (s: AdminBillingSubscription) => void;
}) {
  const who = shortNpub(s.pubkey);
  // What the subscription grants vs what the user is actually in — the
  // payments→scheduler connection this tab exists to make visible.
  const scheduling = s.granted_scheduling_name ?? s.scheduling_name ?? "—";
  return (
    <tr className="border-b border-brand-accent/5" data-testid={`billing-sub-${s.pubkey.slice(0, 8)}`}>
      <td className={td} title={profile?.name ? `${profile.name} — ${who.full}` : who.full}>
        <span className="flex items-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 shrink-0">
            {profile?.picture ? (
              <AvatarImage src={profile.picture} alt={profile?.name || "Subscriber"} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
              {profile?.name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
            </AvatarFallback>
          </Avatar>
          <span className="flex flex-col min-w-0 leading-tight">
            <span className="truncate max-w-[160px] font-medium">{profile?.name || who.short}</span>
            {profile?.name && (
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{who.short}</span>
            )}
          </span>
        </span>
      </td>
      <td className={td}>
        <span className="inline-flex items-center gap-1.5">
          <Chip tone={statusTone(s.flash_status)} size="sm">{s.flash_status}</Chip>
          {s.billing_blocked && (
            <Chip tone="danger" size="sm" data-testid={`billing-blocked-${s.pubkey.slice(0, 8)}`}>blocked</Chip>
          )}
        </span>
      </td>
      <td className={td}>{scheduling}</td>
      <td className={td} data-testid={`billing-source-${s.pubkey.slice(0, 8)}`}>{s.scheduling_source}</td>
      <td className={`${td} tabular-nums`}>{fmtDate(s.current_period_end)}</td>
      <td className={`${td} tabular-nums`}>
        <span className="inline-flex items-center gap-1.5">
          {fmtDate(s.last_synced_at)}
          {s.last_sync_error && (
            <span title={s.last_sync_error}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="sync error" />
            </span>
          )}
        </span>
      </td>
      <td className={`${td} text-right`}>
        {/* Admin verbs live here. View-in-Flash and block/unblock are wired;
            resync is still server-side only, shown disabled so admins know it's
            coming rather than falling into a void. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Subscription actions"
              data-testid={`billing-actions-${s.pubkey.slice(0, 8)}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Actions</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!s.flash_subscription_id}
              onSelect={() => {
                if (s.flash_subscription_id)
                  window.open(flashSubscriptionUrl(s.flash_subscription_id), "_blank", "noopener,noreferrer");
              }}
              data-testid="billing-action-view-flash"
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" /> View in Flash
            </DropdownMenuItem>
            {/* Sits beside the deep link because it answers the same question
                without leaving the tab or holding a Flash login. */}
            <DropdownMenuItem
              onSelect={() => onViewFlashRecord(s)}
              className="flex-col items-start gap-0.5"
              data-testid="billing-action-flash-record"
            >
              <span className="flex items-center">
                <FileJson className="mr-2 h-3.5 w-3.5" /> Flash's raw record
              </span>
              <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Exactly what Flash says right now, beside what we stored. Read-only —
                it changes nothing.
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Each write says what it does inline — these verbs are rare enough
                that nobody remembers, and both have non-obvious edges (resync
                can legitimately change nothing; block keeps charging). */}
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => onResync(s)}
              className="flex-col items-start gap-0.5"
              data-testid="billing-action-resync"
            >
              <span className="flex items-center">
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Resync from Flash
              </span>
              <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Re-reads this subscription from Flash and re-applies the tier. Use it when
                a webhook was missed or the row looks stale. Safe to repeat; it may
                deliberately change nothing.
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => (s.billing_blocked ? onUnblock(s) : onBlock(s))}
              className={`flex-col items-start gap-0.5 ${s.billing_blocked ? "" : "text-red-600 dark:text-red-400"}`}
              data-testid="billing-action-block"
            >
              <span className="flex items-center">
                <Ban className="mr-2 h-3.5 w-3.5" /> {s.billing_blocked ? "Unblock billing" : "Block billing"}
              </span>
              <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {s.billing_blocked
                  ? "Lets them be granted again. Doesn't re-grant by itself — the next Flash event or a resync does."
                  : "Withholds the paid tier however they pay, and takes back a tier billing granted. The subscription keeps charging until it's cancelled in Flash."}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

/**
 * The admin Billing tab: the server's subscriber roster (pubkey-keyed — every
 * row is attributed by construction), and its divergence report — "everything
 * nobody has settled": disagreements between Flash and what users actually
 * receive, including signups that couldn't be matched to an account.
 */
export function AdminBillingCards({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const subsQuery = useQuery({
    queryKey: SUBS_KEY,
    queryFn: () => apiClient.getAdminBillingSubscriptions(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  const divergenceQuery = useQuery({
    queryKey: DIVERGENCE_KEY,
    queryFn: () => apiClient.getAdminBillingDivergence(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  // Before the early returns — hook order must not change between renders.
  const profiles = useRosterProfiles((subsQuery.data?.items ?? []).map((s) => s.pubkey));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sort, setSort] = useState<SortState>(null);
  const [confirmBlock, setConfirmBlock] = useState<AdminBillingSubscription | null>(null);
  const [flashRecordFor, setFlashRecordFor] = useState<AdminBillingSubscription | null>(null);
  const [busyPk, setBusyPk] = useState<string | null>(null);
  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function runAction(pubkey: string, fn: () => Promise<void>) {
    setBusyPk(pubkey);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: SUBS_KEY });
      await queryClient.invalidateQueries({ queryKey: DIVERGENCE_KEY });
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyPk(null);
    }
  }

  const handleResync = (s: AdminBillingSubscription) =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.resyncAdminBillingSubscription(s.pubkey);
      toast({
        // `applied: false` is a normal answer, not a failure — say which it was
        // rather than leaving the admin to guess from an unchanged row.
        title: out.applied ? "Re-applied from Flash" : "Nothing changed",
        description: resyncReasonText(out.reason),
      });
    });

  const handleSetBlock = (s: AdminBillingSubscription, blocked: boolean) =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.setAdminBillingBlock(s.pubkey, blocked);
      toast({
        title: blocked ? "Billing blocked" : "Billing unblocked",
        description: blocked
          ? out.revoked
            ? "Their billing-granted tier was taken back. Flash is still charging them — cancel or refund there."
            : "No billing-granted tier to take back. Flash is still charging them — cancel or refund there."
          : "They can be granted again. The next Flash event or a resync applies it.",
      });
    });

  if (subsQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading subscriptions…
      </div>
    );
  }

  if (subsQuery.isError) {
    return (
      <div className="py-6 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-error">
        Couldn't load subscriptions — the server's billing endpoint may not be live yet.
        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {(subsQuery.error as Error)?.message}
        </div>
      </div>
    );
  }

  const { items, total } = subsQuery.data;
  const divergence = divergenceQuery.data ?? {};

  const filtered = filterAndSort(items, profiles, search, statusFilter, sourceFilter, sort);
  const statuses = Array.from(new Set(items.map((s) => s.flash_status))).sort();
  const sources = Array.from(new Set(items.map((s) => s.scheduling_source))).sort();
  const filtering = search.trim() !== "" || statusFilter !== "all" || sourceFilter !== "all";
  const divergenceEntries = Object.entries(divergence).filter(([, s]) => s.count > 0);

  return (
    <div className="space-y-6">
      {/* Subscriber roster — attributed by construction (pubkey-keyed). */}
      <div>
        {items.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                placeholder="Search name, npub, scheduling…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 pr-7 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/40"
                data-testid="input-billing-search"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  data-testid="button-billing-clear-search"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-billing-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-32 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-billing-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtering && (
              <span className="text-xs text-slate-400 dark:text-slate-500" data-testid="billing-filter-count">
                {filtered.length} of {items.length}
              </span>
            )}
          </div>
        )}
        {items.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-empty">
            No subscribers yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-no-match">
            No subscribers match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" data-testid="table-billing-subscribers">
              <thead>
                <tr className="border-b border-brand-accent/10">
                  <th className={th}><BillingSortHeader label="Subscriber" sortKey="subscriber" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Scheduling" sortKey="scheduling" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Source" sortKey="source" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Period ends" sortKey="period" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}><BillingSortHeader label="Last synced" sortKey="synced" sort={sort} onSort={toggleSort} /></th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SubscriberRow
                    key={s.pubkey}
                    s={s}
                    profile={profiles.get(s.pubkey)}
                    busy={busyPk === s.pubkey}
                    onBlock={setConfirmBlock}
                    onUnblock={(sub) => handleSetBlock(sub, false)}
                    onResync={handleResync}
                    onViewFlashRecord={setFlashRecordFor}
                  />
                ))}
              </tbody>
            </table>
            {total > items.length && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Showing {items.length} of {total}.
              </p>
            )}
          </div>
        )}
        <a
          href={FLASH_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-link hover:underline"
          data-testid="link-flash-dashboard"
        >
          Invoices, refunds and management live in the Flash dashboard
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Divergence — the server's "everything nobody has settled" report. */}
      <div
        className="rounded-xl border border-amber-200/60 dark:border-amber-400/20 bg-amber-50/50 dark:bg-amber-400/[0.06] px-4 py-3"
        data-testid="card-billing-divergence"
      >
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Needs attention</h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Disagreements between Flash and what users receive — unmatched signups included. Resolve in
          the Flash dashboard or via the server's admin tools.
        </p>
        {divergenceQuery.isError ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-error">
            Couldn't load the divergence report.
          </p>
        ) : divergenceEntries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-empty">
            Nothing unsettled — Flash and the scheduler agree.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {divergenceEntries.map(([kind, section]) => (
              <DivergenceBlock key={kind} kind={kind} section={section} />
            ))}
          </div>
        )}
      </div>

      <FlashRecordDialog subscriber={flashRecordFor} onClose={() => setFlashRecordFor(null)} />

      {/* Blocking is confirmed because of the part that surprises people: the
          money keeps moving. Unblocking isn't — it only re-opens a door. */}
      <Dialog open={!!confirmBlock} onOpenChange={(o) => !o && setConfirmBlock(null)}>
        <DialogContent data-testid="dialog-billing-block-confirm">
          <DialogHeader>
            <DialogTitle>Block billing for this subscriber?</DialogTitle>
            <DialogDescription>
              {confirmBlock
                ? `“${shortNpub(confirmBlock.pubkey).short}” will be withheld from paid entitlement no matter what they pay, and any tier billing granted them is taken back now. This does not cancel or refund anything — Flash keeps charging them until you cancel it there.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBlock(null)} data-testid="button-billing-block-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const sub = confirmBlock;
                setConfirmBlock(null);
                if (sub) await handleSetBlock(sub, true);
              }}
              data-testid="button-billing-block-confirm"
            >
              Block billing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Rows are server-defined free-form objects — render the values, don't guess a schema. */
function DivergenceBlock({ kind, section }: { kind: string; section: AdminBillingDivergenceSection }) {
  return (
    <div data-testid={`billing-divergence-${kind}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          {kind.replaceAll("_", " ")}
        </span>
        <Chip tone="warning" size="sm">{section.count}</Chip>
        {section.truncated && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">list capped — more exist</span>
        )}
      </div>
      <ul className="mt-1 space-y-1">
        {section.rows.map((row, i) => (
          <li key={i} className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
            {Object.entries(row).map(([k, v], j) => (
              <span key={k}>
                {j > 0 && "  "}
                {k === "flash_subscription_id" && typeof v === "string" && v ? (
                  <>
                    {k}=
                    <a
                      href={flashSubscriptionUrl(v)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-link hover:underline"
                    >
                      {v}
                    </a>
                  </>
                ) : (
                  `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
