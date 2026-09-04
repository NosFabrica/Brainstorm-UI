import type React from "react";
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
  CalendarX,
  PauseCircle,
  PlayCircle,
  User,
  UserCheck,
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatBillingDate } from "@/lib/plans";
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
  type AdminBillingSubscriptionAction,
} from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { tone, type Tone } from "@/lib/tones";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { orderedSections, subscriptionIdsByEventId, type DivergenceMeta, type DivergenceTier, type OrderedSection } from "./divergenceSections";

import type { SchedulingItem } from "@/services/api";
import { DIVERGENCE_KEY, POLICIES_KEY, SUBS_KEY } from "./queryKeys";
import {
  AbandonedCheckoutRowView,
  FailingSyncRowView,
  PolicyMismatchRowView,
  RetiredPlanRowView,
  StaleSyncRowView,
  UnrecognisedStatusRowView,
  ExhaustedEventRowView,
  type ProfileBits as DivergenceProfileBits,
} from "./DivergenceRows";

/**
 * Invoices and refunds still live in Flash; cancelling and pausing no longer do.
 * The links out stay regardless — acting on a subscription is a different
 * question from seeing what Flash actually says about it.
 *
 * Subscribers are untouched by any of this: they still manage their own
 * subscription through Flash's portal.
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
const ENTITLEMENT_REASONS: Record<string, string> = {
  granted: "Flash says they're entitled; the paid tier is applied.",
  revoked: "The subscription has ended — they're back on the default tier.",
  held: "Nothing certain enough to act on (dunning, or a cancellation still inside its paid period). Tier left as-is.",
  blocked: "They're blocked from paid entitlement, so nothing was granted.",
  admin_override: "An admin assignment holds this tier; billing didn't take it away.",
  attributed: "It was already attributed to them — they hold the tier, so nothing needed to change.",
  no_reference: "The subscription carries no reference to a user.",
  unknown_user: "No account matches this pubkey.",
  unknown_plan: "Flash's plan isn't mapped to an entitlement here — map it under plans.",
  unknown_subscription: "Flash has no subscription for this user.",
  reference_mismatch: "Flash's record names a different user. Nothing was changed — worth investigating.",
  busy: "Something else is reconciling this user right now. Try again shortly.",
};

function entitlementReasonText(reason: string): string {
  return ENTITLEMENT_REASONS[reason] ?? `Server reported "${reason}".`;
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
 *
 * One dialog, two handles: a subscriber is looked up by pubkey, an unresolved
 * signup only by its Flash id — which is also the only way to see what state
 * that signup is actually in, since the report row carries no status.
 */
type FlashRecordTarget = {
  /** Keeps one record's cached body apart from another's. */
  key: string;
  /** How the dialog names it: an npub for a person, the id for a signup. */
  label: string;
  read: () => Promise<unknown>;
};

function FlashRecordDialog({
  target,
  onClose,
}: {
  target: FlashRecordTarget | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["/api/admin/billing/flash-record", target?.key],
    queryFn: () => target!.read(),
    enabled: !!target,
    // Every read spends our Flash quota, so don't re-ask on a reopen or a retry.
    staleTime: 60_000,
    retry: false,
    gcTime: 0,
  });
  const rows = (query.data as { subscriptions?: unknown[] } | undefined)?.subscriptions;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
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
            Exactly what Flash returned for {target?.label ?? ""} — every row, not
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

/**
 * Confirm a consequential write, naming who it lands on — the same shape
 * `UserTierPicker` uses on the Users tab: avatar, the profile name when kind-0
 * gave us one, and the npub otherwise. Never the raw hex, which nobody can
 * recognize and everybody can mistype.
 *
 * A signup that named nobody has no person to name, so it falls back to the
 * Flash subscription id — the only handle such a row has.
 *
 * The gate is that the action lives only on the confirm button: opening the
 * dialog does nothing at all.
 */
type ConfirmSubject = {
  /** Who it lands on, when there is somebody. */
  pubkey?: string | null;
  /** Stands in for a person when there is none. */
  handle?: string;
  profile?: ProfileBits;
};

function ConfirmSubscriptionAction({
  subject,
  kind,
  title,
  confirmLabel,
  confirmDisabled = false,
  destructive = true,
  dismissLabel = "Keep it",
  onDismiss,
  onConfirm,
  children,
}: {
  /** Null closes the dialog — there is nothing to confirm without a subject. */
  subject: ConfirmSubject | null;
  kind: "cancel" | "pause" | "resume" | "attribute" | "dismiss";
  title: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  destructive?: boolean;
  dismissLabel?: string;
  onDismiss: () => void;
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const profile = subject?.profile;
  const who = subject?.pubkey ? shortNpub(subject.pubkey) : null;
  const name = profile?.name || who?.short;
  return (
    <Dialog open={!!subject} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="sm:max-w-md" data-testid={`dialog-billing-${kind}-confirm`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <span
                className="flex items-center gap-2 mb-2"
                data-testid={`billing-${kind}-confirm-who`}
              >
                {who ? (
                  <>
                    <Avatar className="h-7 w-7 shrink-0">
                      {profile?.picture ? (
                        <AvatarImage src={profile.picture} alt={name || "Subscriber"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
                        {profile?.name?.charAt(0)?.toUpperCase() || <User className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                  </>
                ) : (
                  <span className="font-mono text-xs break-all text-slate-900 dark:text-slate-100">
                    {subject?.handle}
                  </span>
                )}
              </span>
              {children}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDismiss} data-testid={`button-billing-${kind}-dismiss`}>
            {dismissLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={confirmDisabled}
            onClick={() => void onConfirm()}
            data-testid={`button-billing-${kind}-confirm`}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The "…" that opens a row's verbs, spinning while one of them is in flight. */
function RowActionsTrigger({ label, busy, testId, small = false }: {
  label: string;
  busy: boolean;
  testId: string;
  small?: boolean;
}) {
  const size = small ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={`shrink-0 ${small ? "p-1" : "p-1.5"} rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors`}
        aria-label={label}
        data-testid={testId}
      >
        {busy ? <Loader2 className={`${size} animate-spin`} /> : <MoreHorizontal className={size} />}
      </button>
    </DropdownMenuTrigger>
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
  onCancel,
  onPause,
  onResume,
}: {
  s: AdminBillingSubscription;
  profile?: ProfileBits;
  busy: boolean;
  onBlock: (s: AdminBillingSubscription) => void;
  onUnblock: (s: AdminBillingSubscription) => void;
  onResync: (s: AdminBillingSubscription) => void;
  onViewFlashRecord: (s: AdminBillingSubscription) => void;
  onCancel: (s: AdminBillingSubscription) => void;
  onPause: (s: AdminBillingSubscription) => void;
  onResume: (s: AdminBillingSubscription) => void;
}) {
  const who = shortNpub(s.pubkey);
  const paused = s.flash_status === "paused";
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
      <td className={`${td} tabular-nums`}>
        {formatBillingDate(s.current_period_end)}
        {/* The status column cannot say this: a cancelled subscriber stays
            `active` until the date lands. */}
        {s.cancel_effective_date && (
          <span className="ml-1.5 inline-flex" data-testid={`billing-ends-${s.pubkey.slice(0, 8)}`}>
            <Chip tone="warning" size="sm">Ends {formatBillingDate(s.cancel_effective_date)}</Chip>
          </span>
        )}
      </td>
      <td className={`${td} tabular-nums`}>
        <span className="inline-flex items-center gap-1.5">
          {formatBillingDate(s.last_synced_at)}
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
          <RowActionsTrigger
            label="Subscription actions"
            busy={busy}
            testId={`billing-actions-${s.pubkey.slice(0, 8)}`}
          />
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
            {/* Pause and cancel reach Flash itself, so both are gated on us
                actually holding a subscription id to reach it with. */}
            <DropdownMenuItem
              disabled={busy || !s.flash_subscription_id}
              onSelect={() => (paused ? onResume(s) : onPause(s))}
              className="flex-col items-start gap-0.5"
              data-testid="billing-action-pause"
            >
              <span className="flex items-center">
                {paused ? (
                  <PlayCircle className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <PauseCircle className="mr-2 h-3.5 w-3.5" />
                )}
                {paused ? "Resume subscription" : "Pause subscription"}
              </span>
              <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {paused
                  ? "Puts the subscription back to active in Flash; billing and their paid tier resume."
                  : "Suspends the subscription in Flash. Their paid tier comes off while it's paused, and nothing is charged."}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy || !s.flash_subscription_id}
              onSelect={() => onCancel(s)}
              className="flex-col items-start gap-0.5 text-red-600 dark:text-red-400"
              data-testid="billing-action-cancel"
            >
              <span className="flex items-center">
                <CalendarX className="mr-2 h-3.5 w-3.5" /> Cancel subscription
              </span>
              <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Ends the subscription in Flash. On this account that takes effect at the
                end of the paid period, so they keep their tier until then.
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
                  : "Withholds the paid tier however they pay, and takes back a tier billing granted. The subscription keeps charging until somebody cancels it."}
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
  // Scheduling policies by id — the report names policies by id only.
  const policiesQuery = useQuery<SchedulingItem[]>({
    queryKey: POLICIES_KEY,
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: active,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const policyName = (id: number | null | undefined): string => {
    if (id == null) return "—";
    return policiesQuery.data?.find((p) => p.id === id)?.name ?? `policy #${id}`;
  };
  const [attributeFor, setAttributeFor] = useState<string | null>(null);
  const [attributeKeyInput, setAttributeKeyInput] = useState("");
  // Either common form is accepted here; only hex ever leaves. Decoding in the
  // client means a mistyped key is refused before it costs a round trip, and
  // the server never has to know npub exists.
  const attributePubkey = decodeShareId(attributeKeyInput)?.pubkey ?? null;
  // Before the early returns — hook order must not change between renders. The
  // candidate rides along with the roster so the person about to be granted is
  // named the same way everyone else is.
  // The report's people ride along too, so a fault row shows who, not a hex.
  const reportPubkeys = Object.values(divergenceQuery.data ?? {}).flatMap((section) =>
    (section?.rows ?? []).map((r) => (r as { pubkey?: unknown }).pubkey).filter((pk): pk is string => typeof pk === "string" && pk.length === 64),
  );
  const profiles = useRosterProfiles([
    ...(subsQuery.data?.items ?? []).map((s) => s.pubkey),
    ...reportPubkeys,
    ...(attributePubkey ? [attributePubkey] : []),
  ]);
  const [dismissFor, setDismissFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sort, setSort] = useState<SortState>(null);
  const [confirmBlock, setConfirmBlock] = useState<AdminBillingSubscription | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<AdminBillingSubscription | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmPause, setConfirmPause] = useState<AdminBillingSubscription | null>(null);
  const [confirmResume, setConfirmResume] = useState<AdminBillingSubscription | null>(null);
  const [flashRecordFor, setFlashRecordFor] = useState<FlashRecordTarget | null>(null);
  // Keyed by whatever handle the row has: a pubkey for a subscriber, a Flash
  // subscription id for a signup that named nobody.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function runAction(handle: string, fn: () => Promise<void>, failureTitle = "Action failed") {
    setBusyKey(handle);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: SUBS_KEY });
      await queryClient.invalidateQueries({ queryKey: DIVERGENCE_KEY });
    } catch (e) {
      toast({
        title: failureTitle,
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
    }
  }

  const handleResync = (s: AdminBillingSubscription) => handleResyncPubkey(s.pubkey);
  const handleResyncPubkey = (pubkey: string) =>
    runAction(pubkey, async () => {
      const out = await apiClient.resyncAdminBillingSubscription(pubkey);
      toast({
        // `applied: false` is a normal answer, not a failure — say which it was
        // rather than leaving the admin to guess from an unchanged row.
        title: out.applied ? "Re-applied from Flash" : "Nothing changed",
        description: entitlementReasonText(out.reason),
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

  /** Reads `cancellation_scheduled`, never the status — see the type's note. */
  function cancelOutcomeToast(out: AdminBillingSubscriptionAction) {
    if (!out.cancellation_scheduled) {
      toast({
        title: "Nothing was scheduled",
        description:
          "Flash accepted the request but reports no cancellation on this subscription. Check Flash's raw record before trying again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: out.cancel_effective_date ? "Cancellation scheduled" : "Subscription cancelled",
      description:
        (out.cancel_effective_date
          ? `Flash still reports them "${out.flash_status}" until it takes effect on ${formatBillingDate(out.cancel_effective_date)} — that is what end-of-period cancellation looks like, not a failure. They keep their tier until then. `
          : "Flash ended it immediately. ") + tierNote(out),
    });
  }

  /**
   * What happened to their tier, which is a separate question from what
   * happened in Flash. `reread_failed` means the write landed and the re-read
   * that follows it did not — saying nothing would leave an operator believing
   * the roster is current when it is a step behind.
   */
  function tierNote(out: AdminBillingSubscriptionAction): string {
    if (out.reason === "reread_failed")
      return "We couldn't re-read them from Flash afterwards, so their tier and the roster are a step behind — resync when Flash is back.";
    return out.applied
      ? "Their tier has been re-read from Flash and updated."
      : "Their tier was left as it was — the roster shows why.";
  }

  const handleCancel = (s: AdminBillingSubscription, reason: string) =>
    runAction(s.pubkey, async () => {
      cancelOutcomeToast(await apiClient.cancelAdminBillingSubscription(s.pubkey, reason));
    });

  const handleSetStatus = (s: AdminBillingSubscription, status: "paused" | "active") =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.setAdminBillingSubscriptionStatus(s.pubkey, status);
      toast({
        title: status === "paused" ? "Subscription paused" : "Subscription resumed",
        description: `Flash reports them "${out.flash_status}". ${tierNote(out)}`,
      });
    });

  /**
   * Attributing can legitimately grant nothing — a blocked user, a
   * subscription that has already lapsed. That is an answer, not a failure, so
   * it is reported as one, with the server's own reason for it.
   */
  const handleAttribute = (subscriptionId: string, pubkey: string) =>
    runAction(subscriptionId, async () => {
      const out = await apiClient.attributeAdminBillingUnresolved(subscriptionId, pubkey);
      toast({
        title: out.applied ? "Signup attributed" : "Attributed, but nothing was granted",
        description: out.applied
          ? "It now belongs to them and the plan's tier is applied — they're in the roster above."
          : `${out.entitlement_reason ? entitlementReasonText(out.entitlement_reason) : "No tier was applied."} The signup is settled either way, so it leaves this report.`,
      });
    }, "Nothing was changed");

  /** A roster row as the confirm dialog wants it: who, plus their kind-0. */
  const subjectOf = (s: AdminBillingSubscription | null): ConfirmSubject | null =>
    s ? { pubkey: s.pubkey, profile: profiles.get(s.pubkey) } : null;

  const handleDismiss = (subscriptionId: string) =>
    runAction(subscriptionId, async () => {
      await apiClient.dismissAdminBillingUnresolved(subscriptionId);
      toast({
        title: "Signup dismissed",
        description:
          "Written off as nobody's — nothing was granted and this leaves the report. Flash still holds the payment; cancel or refund there if it needs it.",
      });
    }, "Nothing was changed");

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
  // Faults first, the record below, anything this build doesn't know last.
  const sections = orderedSections(divergence);
  const faults = sections.filter((x) => x.tier === "fault");
  const record = sections.filter((x) => x.tier === "record");
  // An exhausted event borrows the Flash id its signup row carries.
  const handlesByEventId = subscriptionIdsByEventId(divergence);
  const signupActions = {
    onViewFlashRecord: (id: string) =>
      setFlashRecordFor({ key: id, label: id, read: () => apiClient.getAdminBillingFlashRecordForUnresolved(id) }),
    onAttribute: (id: string) => {
      setAttributeKeyInput("");
      setAttributeFor(id);
    },
    onDismiss: setDismissFor,
  };
  const renderSection = (x: OrderedSection) =>
    x.kind === "unresolved_signups" ? (
      <UnresolvedSignupsBlock
        key={x.kind}
        meta={x.meta}
        section={x.section}
        busyId={busyKey}
        {...signupActions}
      />
    ) : (
      <DivergenceBlock
        key={x.kind}
        kind={x.kind}
        meta={x.meta}
        tier={x.tier}
        section={x.section}
        profiles={profiles}
        policyName={policyName}
        busyKey={busyKey}
        onResync={handleResyncPubkey}
        handlesByEventId={handlesByEventId}
        signupActions={signupActions}
      />
    );

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
                    busy={busyKey === s.pubkey}
                    onBlock={setConfirmBlock}
                    onUnblock={(sub) => handleSetBlock(sub, false)}
                    onResync={handleResync}
                    onViewFlashRecord={(sub) =>
                      setFlashRecordFor({
                        key: sub.pubkey,
                        label: shortNpub(sub.pubkey).short,
                        read: () => apiClient.getAdminBillingFlashRecordForSubscriber(sub.pubkey),
                      })
                    }
                    onCancel={(sub) => {
                      setCancelReason("");
                      setConfirmCancel(sub);
                    }}
                    onPause={setConfirmPause}
                    onResume={setConfirmResume}
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
          Everything nobody has settled between Flash and what users receive. Faults first — a paying
          subscriber on the wrong cadence, a payment going nowhere — then what's worth knowing but isn't
          broken. Most of this is for knowing; act where a button is offered, or in Flash.
        </p>
        {divergenceQuery.isError ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-error">
            Couldn't load the divergence report.
          </p>
        ) : sections.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-empty">
            Nothing unsettled — Flash and the scheduler agree.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            <DivergenceTierGroup tier="fault" sections={faults} render={renderSection} />
            <DivergenceTierGroup tier="record" sections={record} render={renderSection} />
          </div>
        )}
      </div>

      <FlashRecordDialog target={flashRecordFor} onClose={() => setFlashRecordFor(null)} />

      {/* Attributing grants a tier, so it is confirmed like any other grant —
          and the person is shown, not just the key that was pasted. */}
      <ConfirmSubscriptionAction
        subject={
          attributeFor
            ? {
                pubkey: attributePubkey,
                handle: attributeFor,
                profile: attributePubkey ? profiles.get(attributePubkey) : undefined,
              }
            : null
        }
        kind="attribute"
        title="Attribute this signup to someone?"
        confirmLabel="Attribute signup"
        confirmDisabled={!attributePubkey}
        destructive={false}
        dismissLabel="Cancel"
        onDismiss={() => setAttributeFor(null)}
        onConfirm={async () => {
          const id = attributeFor;
          const pubkey = attributePubkey;
          setAttributeFor(null);
          if (id && pubkey) await handleAttribute(id, pubkey);
        }}
      >
        <>
          Grants whatever <span className="font-mono text-[11px] break-all">{attributeFor}</span>{" "}
          pays for, exactly as a webhook naming them would have. Who actually paid is
          visible only in Flash's dashboard, so check there before granting.
          <Input
            value={attributeKeyInput}
            onChange={(e) => setAttributeKeyInput(e.target.value)}
            placeholder="npub1… or hex pubkey"
            className="mt-3 font-mono text-xs"
            data-testid="input-billing-attribute-pubkey"
          />
          {attributeKeyInput.trim() !== "" && !attributePubkey && (
            <span
              className={`mt-1.5 block text-[11px] ${tone("danger").text}`}
              data-testid="billing-attribute-key-invalid"
            >
              That isn't a key we can read. Paste an npub or a 64-character hex pubkey.
            </span>
          )}
        </>
      </ConfirmSubscriptionAction>

      {/* No person to name — the provider's own card tests are the common case
          here, and the subscription id is all such a row has. */}
      <ConfirmSubscriptionAction
        subject={dismissFor ? { handle: dismissFor } : null}
        kind="dismiss"
        title="Write this signup off as nobody's?"
        confirmLabel="Dismiss signup"
        onDismiss={() => setDismissFor(null)}
        onConfirm={async () => {
          const id = dismissFor;
          setDismissFor(null);
          if (id) await handleDismiss(id);
        }}
      >
        Grants nothing and clears it from this report, so the sweep stops re-checking
        it. It does not cancel or refund anything — Flash took the money and that stays
        there.
      </ConfirmSubscriptionAction>

      {/* Every write that reaches Flash names the person before it happens, the
          same way a manual tier change does. */}
      <ConfirmSubscriptionAction
        subject={subjectOf(confirmCancel)}
        kind="cancel"
        title="Cancel this subscription in Flash?"
        confirmLabel="Cancel subscription"
        onDismiss={() => setConfirmCancel(null)}
        onConfirm={async () => {
          const sub = confirmCancel;
          const reason = cancelReason;
          setConfirmCancel(null);
          if (sub) await handleCancel(sub, reason);
        }}
      >
        <>
          Ends their subscription in Flash. On this account cancellation takes effect at
          the end of the paid period, so they keep their tier until it lapses — and
          Flash will still report them active until then. Nothing here refunds anything.
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional) — recorded in Flash"
            className="mt-3"
            data-testid="input-billing-cancel-reason"
          />
        </>
      </ConfirmSubscriptionAction>

      <ConfirmSubscriptionAction
        subject={subjectOf(confirmPause)}
        kind="pause"
        title="Pause this subscription in Flash?"
        confirmLabel="Pause subscription"
        onDismiss={() => setConfirmPause(null)}
        onConfirm={async () => {
          const sub = confirmPause;
          setConfirmPause(null);
          if (sub) await handleSetStatus(sub, "paused");
        }}
      >
        Suspends billing in Flash and takes their paid tier off while it is paused.
        Resuming puts both back.
      </ConfirmSubscriptionAction>

      {/* Resuming is confirmed too, unlike unblocking: it restarts a charge,
          and that is money moving on somebody's card. */}
      <ConfirmSubscriptionAction
        subject={subjectOf(confirmResume)}
        kind="resume"
        title="Resume this subscription in Flash?"
        confirmLabel="Resume subscription"
        destructive={false}
        onDismiss={() => setConfirmResume(null)}
        onConfirm={async () => {
          const sub = confirmResume;
          setConfirmResume(null);
          if (sub) await handleSetStatus(sub, "active");
        }}
      >
        Puts the subscription back to active in Flash. Billing starts again on its
        normal schedule, and their paid tier comes back.
      </ConfirmSubscriptionAction>

      {/* Blocking is confirmed because of the part that surprises people: the
          money keeps moving. Unblocking isn't — it only re-opens a door. */}
      <Dialog open={!!confirmBlock} onOpenChange={(o) => !o && setConfirmBlock(null)}>
        <DialogContent data-testid="dialog-billing-block-confirm">
          <DialogHeader>
            <DialogTitle>Block billing for this subscriber?</DialogTitle>
            <DialogDescription>
              {confirmBlock
                ? `“${shortNpub(confirmBlock.pubkey).short}” will be withheld from paid entitlement no matter what they pay, and any tier billing granted them is taken back now. This does not cancel or refund anything — Flash keeps charging them until the subscription is cancelled.`
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

/** A tier of the report: Faults or For the record. Says so when empty. */
function DivergenceTierGroup({
  tier,
  sections,
  render,
}: {
  tier: DivergenceTier;
  sections: OrderedSection[];
  render: (x: OrderedSection) => React.ReactNode;
}) {
  const fault = tier === "fault";
  return (
    <div data-testid={`billing-divergence-${fault ? "faults" : "record"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${fault ? "text-amber-700 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
          {fault ? "Faults" : "For the record"}
        </span>
        <span className={`h-px flex-1 ${fault ? "bg-amber-200/60 dark:bg-amber-400/20" : "bg-slate-200/70 dark:bg-slate-700/60"}`} />
      </div>
      {sections.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          {fault ? "No faults — nothing is wrong for anyone paying." : "Nothing to note."}
        </p>
      ) : (
        <div className="mt-2 space-y-3">{sections.map(render)}</div>
      )}
    </div>
  );
}

/** The section's heading: its title, meaning, count and truncation admission. */
function DivergenceHeading({
  kind,
  meta,
  tier,
  section,
}: {
  kind: string;
  meta: DivergenceMeta | null;
  tier: DivergenceTier;
  section: AdminBillingDivergenceSection;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          {meta?.title ?? kind.replaceAll("_", " ")}
        </span>
        <Chip tone={tier === "fault" ? "warning" : "neutral"} size="sm">{section.count}</Chip>
        {section.truncated && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">list capped — more exist</span>
        )}
      </div>
      {meta?.meaning && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{meta.meaning}</p>
      )}
    </div>
  );
}

/** One free-form row, verbatim. The Flash id is the one value that links out. */
function DivergenceRow({ row }: { row: Record<string, unknown> }) {
  return (
    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
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
    </span>
  );
}

/** A section's rows. Kinds this build knows get typed rows (below); anything
 *  else renders its values verbatim rather than guessing a schema. */
function DivergenceBlock({
  kind,
  meta,
  tier,
  section,
  profiles,
  policyName,
  busyKey,
  onResync,
  handlesByEventId,
  signupActions,
}: {
  kind: string;
  meta: DivergenceMeta | null;
  tier: DivergenceTier;
  section: AdminBillingDivergenceSection;
  profiles: Map<string, DivergenceProfileBits>;
  policyName: (id: number | null | undefined) => string;
  busyKey: string | null;
  onResync: (pubkey: string) => void;
  handlesByEventId: Map<number, string>;
  signupActions: SignupActions;
}) {
  const person = (row: Record<string, unknown>) => (typeof row.pubkey === "string" ? profiles.get(row.pubkey) : undefined);
  const busy = (row: Record<string, unknown>) => typeof row.pubkey === "string" && busyKey === row.pubkey;
  const typed = (row: Record<string, unknown>, i: number) => {
    switch (kind) {
      case "policy_mismatch":
      case "admin_overrides":
        return (
          <PolicyMismatchRowView
            key={i}
            kind={kind}
            row={row as never}
            profile={person(row)}
            policyName={policyName}
            busy={busy(row)}
            onResync={kind === "policy_mismatch" ? onResync : undefined}
          />
        );
      case "stale_syncs":
        return <StaleSyncRowView key={i} row={row as never} profile={person(row)} busy={busy(row)} onResync={onResync} />;
      case "failing_syncs":
        return <FailingSyncRowView key={i} row={row as never} profile={person(row)} busy={busy(row)} onResync={onResync} />;
      case "unrecognised_statuses":
        return <UnrecognisedStatusRowView key={i} row={row as never} />;
      case "abandoned_checkouts":
        return <AbandonedCheckoutRowView key={i} row={row as never} profile={person(row)} flashUrl={flashSubscriptionUrl} />;
      case "retired_plan_subscribers":
        return <RetiredPlanRowView key={i} row={row as never} profile={person(row)} flashUrl={flashSubscriptionUrl} policyName={policyName} />;
      case "exhausted_events": {
        const eventId = typeof row.id === "number" ? row.id : null;
        const handle = eventId != null ? handlesByEventId.get(eventId) : undefined;
        return (
          <ExhaustedEventRowView key={i} row={row as never}>
            {handle ? (
              <SignupActionsMenu id={handle} busy={busyKey === handle} testIdPrefix={`billing-exhausted-actions-${eventId}`} itemPrefix="billing-exhausted-action" {...signupActions} />
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">no signup to settle — see the Flash dashboard</span>
            )}
          </ExhaustedEventRowView>
        );
      }
      default:
        return (
          <li key={i}>
            <DivergenceRow row={row} />
          </li>
        );
    }
  };
  return (
    <div data-testid={`billing-divergence-${kind}`}>
      <DivergenceHeading kind={kind} meta={meta} tier={tier} section={section} />
      <ul className="mt-1.5 space-y-1">{section.rows.map(typed)}</ul>
    </div>
  );
}

/**
 * The one divergence section an admin can settle from here, rather than only
 * read: a payment that named nobody, to be attached to the person who made it
 * or written off.
 *
 * Both verbs, or neither is any use — the payment provider's own card tests
 * are dismissals, and they would otherwise sit in the report forever.
 *
 * The row itself carries no status, amount or dates: the server holds only the
 * delivery, and Flash's payload has no contact details in it at all. So the
 * raw record and the link out are the surface, not an extra — an unresolved
 * signup can perfectly well be one Flash has already cancelled, and this is
 * the only place that shows.
 */
function UnresolvedSignupsBlock({
  meta,
  section,
  busyId,
  onViewFlashRecord,
  onAttribute,
  onDismiss,
}: {
  meta: DivergenceMeta | null;
  section: AdminBillingDivergenceSection;
  busyId: string | null;
  onViewFlashRecord: (subscriptionId: string) => void;
  onAttribute: (subscriptionId: string) => void;
  onDismiss: (subscriptionId: string) => void;
}) {
  return (
    <div data-testid="billing-divergence-unresolved_signups">
      <DivergenceHeading kind="unresolved_signups" meta={meta} tier="fault" section={section} />
      <ul className="mt-1.5 space-y-1.5">
        {section.rows.map((row, i) => {
          const id =
            typeof row.flash_subscription_id === "string" ? row.flash_subscription_id : "";
          const busy = !!id && busyId === id;
          return (
            <li key={id || i} className="flex items-start gap-2" data-testid={`billing-unresolved-${id}`}>
              <DivergenceRow row={row} />
              {id && (
                <SignupActionsMenu
                  id={id}
                  busy={busy}
                  testIdPrefix={`billing-unresolved-actions-${id}`}
                  itemPrefix="billing-unresolved-action"
                  onViewFlashRecord={onViewFlashRecord}
                  onAttribute={onAttribute}
                  onDismiss={onDismiss}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type SignupActions = {
  onViewFlashRecord: (subscriptionId: string) => void;
  onAttribute: (subscriptionId: string) => void;
  onDismiss: (subscriptionId: string) => void;
};

/** The three things an admin can do with a signup that named nobody — shared
 *  by the signup rows and the exhausted events that borrow their handle. */
function SignupActionsMenu({
  id,
  busy,
  testIdPrefix,
  itemPrefix,
  onViewFlashRecord,
  onAttribute,
  onDismiss,
}: SignupActions & { id: string; busy: boolean; testIdPrefix: string; itemPrefix: string }) {
  return (
    <DropdownMenu>
      <RowActionsTrigger label="Signup actions" busy={busy} testId={testIdPrefix} small />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Actions
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => onViewFlashRecord(id)}
          className="flex-col items-start gap-0.5"
          data-testid={`${itemPrefix}-flash-record`}
        >
          <span className="flex items-center">
            <FileJson className="mr-2 h-3.5 w-3.5" /> Flash's raw record
          </span>
          <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            What state this signup is actually in — it may already be cancelled. Read-only; it changes nothing.
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onAttribute(id)}
          className="flex-col items-start gap-0.5"
          data-testid={`${itemPrefix}-attribute`}
        >
          <span className="flex items-center">
            <UserCheck className="mr-2 h-3.5 w-3.5" /> Attribute to a person
          </span>
          <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Attaches this payment to an account and grants whatever its plan grants — the same way a webhook naming them would have.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onDismiss(id)}
          className="flex-col items-start gap-0.5 text-red-600 dark:text-red-400"
          data-testid={`${itemPrefix}-dismiss`}
        >
          <span className="flex items-center">
            <Ban className="mr-2 h-3.5 w-3.5" /> Dismiss as nobody's
          </span>
          <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Clears it from this report without granting anything. Doesn't cancel or refund — that stays in Flash, which took the money.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
