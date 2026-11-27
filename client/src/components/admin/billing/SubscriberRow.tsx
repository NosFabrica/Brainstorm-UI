import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNearViewport } from "@/hooks/useNearViewport";
import { formatBillingCadence, formatBillingDate } from "@/lib/plans";
import { apiClient, type AdminBillingSubscription } from "@/services/api";
import {
  AlertTriangle,
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
} from "lucide-react";
import { useRef } from "react";
import { useFlashSubscriptionRecord } from "./FlashFactsStrip";
import { failureLabel, sourceLabel, statusLabel } from "./billingEventCopy";
import { describeCycles } from "./flashRecord";
import { type ProfileBits, statusTone, flashSubscriptionUrl, shortNpub, td } from "./rosterShared";

/** The "…" that opens a row's verbs, spinning while one of them is in flight. */
export function RowActionsTrigger({
  label,
  busy,
  testId,
  small = false,
}: {
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
        className={`shrink-0 ${small ? "p-1" : "p-1.5"} rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300`}
        aria-label={label}
        data-testid={testId}
      >
        {busy ? <Loader2 className={`${size} animate-spin`} /> : <MoreHorizontal className={size} />}
      </button>
    </DropdownMenuTrigger>
  );
}

export function SubscriberRow({
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
  serviceNames,
}: {
  s: AdminBillingSubscription;
  /** Flash service id → name from the account's services list; empty while that list is unavailable. */
  serviceNames: Map<string, string>;
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
  // One Flash read per row, and only once the row comes near the screen: a
  // page is 100 rows and there is no batch read.
  const rowRef = useRef<HTMLTableRowElement>(null);
  const near = useNearViewport(rowRef, "300px");
  const flash = useFlashSubscriptionRecord(
    s.pubkey,
    (pk) => apiClient.getAdminBillingFlashRecordForSubscriber(pk),
    s.flash_subscription_id,
    near,
  );
  // What the subscription grants vs what the user is actually in — the
  // payments→scheduler connection this tab exists to make visible.
  const scheduling = s.granted_scheduling_name ?? s.scheduling_name ?? "—";
  return (
    <tr
      ref={rowRef}
      className="border-b border-slate-200 transition-colors hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/60"
      data-testid={`billing-sub-${s.pubkey.slice(0, 8)}`}
    >
      <td className={td} title={profile?.name ? `${profile.name} — ${who.full}` : who.full}>
        <span className="flex min-w-0 items-center gap-2">
          <Avatar className="h-6 w-6 shrink-0">
            {profile?.picture ? (
              <AvatarImage src={profile.picture} alt={profile?.name || "Subscriber"} className="object-cover" />
            ) : null}
            <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
              {profile?.name?.charAt(0)?.toUpperCase() || (
                <User className="h-3 w-3 text-slate-300 dark:text-slate-600" />
              )}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col leading-tight">
            <a
              href={`/p/${who.full}`}
              target="_blank"
              rel="noopener"
              className="max-w-[160px] truncate font-medium hover:text-brand-link hover:underline"
              title="Open their public profile"
            >
              {profile?.name || who.short}
            </a>
            {profile?.name && (
              <span className="max-w-[160px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                {who.short}
              </span>
            )}
          </span>
        </span>
      </td>
      <td className={td} data-testid={`billing-status-${s.pubkey.slice(0, 8)}`}>
        <span className="flex flex-col items-start gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <Chip tone={statusTone(s.flash_status)} size="sm">
              {statusLabel(s.flash_status)}
            </Chip>
            {s.billing_blocked && (
              <Chip tone="danger" size="sm" data-testid={`billing-blocked-${s.pubkey.slice(0, 8)}`}>
                blocked
              </Chip>
            )}
          </span>
          {/* The status column cannot say this by itself: a cancelled subscriber
              stays `active` until the date lands. Said only while it still
              matters — an expired row's end has already passed. */}
          {s.cancel_effective_date && (s.flash_status === "active" || s.flash_status === "trial") && (
            <span
              className="text-[11px] text-amber-600 dark:text-amber-400"
              data-testid={`billing-ends-${s.pubkey.slice(0, 8)}`}
            >
              Ends {formatBillingDate(s.cancel_effective_date)}
            </span>
          )}
        </span>
      </td>
      {/* Which Flash service — production or staging — the subscription lives
          on, off the Flash record this row already reads. */}
      <td className={td} data-testid={`billing-service-${s.pubkey.slice(0, 8)}`}>
        {flash.pending ? (
          <span className="text-slate-300 dark:text-slate-600">…</span>
        ) : flash.record?.serviceId ? (
          (serviceNames.get(flash.record.serviceId) ?? (
            <span className="font-mono text-[11px]" title={flash.record.serviceId}>
              {flash.record.serviceId.slice(0, 8)}…
            </span>
          ))
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className={td}>{scheduling}</td>
      <td className={td} data-testid={`billing-source-${s.pubkey.slice(0, 8)}`}>
        {sourceLabel(s.scheduling_source)}
      </td>
      {/* Dates keep to one line: on a phone the grid widens and scrolls rather
          than every row growing to twice its height. */}
      <td className={`${td} whitespace-nowrap tabular-nums`} data-testid={`billing-period-${s.pubkey.slice(0, 8)}`}>
        {/* The paid period as a span; the end alone read as a deadline. */}
        {s.current_period_start ? (
          <span>
            <span className="text-slate-400 dark:text-slate-500">{formatBillingDate(s.current_period_start)} → </span>
            {formatBillingDate(s.current_period_end)}
          </span>
        ) : (
          formatBillingDate(s.current_period_end)
        )}
      </td>
      {/* The cadence and which billing period they are on — Flash's record
          says, read once per row and cached; "—" where Flash has no such
          subscription (Benjamin: "add in the cycle and interval after period"). */}
      <td className={td} data-testid={`billing-interval-${s.pubkey.slice(0, 8)}`}>
        {flash.pending ? (
          <span className="text-slate-300 dark:text-slate-600">…</span>
        ) : (
          (formatBillingCadence(flash.record?.billingInterval) ?? (
            <span className="text-slate-400 dark:text-slate-500">—</span>
          ))
        )}
      </td>
      <td
        className={`${td} tabular-nums`}
        title={flash.record ? (describeCycles(flash.record) ?? undefined) : undefined}
        data-testid={`billing-cycle-${s.pubkey.slice(0, 8)}`}
      >
        {flash.pending ? (
          <span className="text-slate-300 dark:text-slate-600">…</span>
        ) : (
          (flash.record?.currentPeriodNumber ?? <span className="text-slate-400 dark:text-slate-500">—</span>)
        )}
      </td>
      {/* What answers "when is this person charged again" — a renewal that is
          due looks nothing like one that has silently stopped. */}
      <td className={`${td} whitespace-nowrap tabular-nums`} data-testid={`billing-nextbill-${s.pubkey.slice(0, 8)}`}>
        {s.next_billing_date ? (
          formatBillingDate(s.next_billing_date)
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className={`${td} whitespace-nowrap tabular-nums`} data-testid={`billing-synced-${s.pubkey.slice(0, 8)}`}>
        <span className="inline-flex items-center gap-1.5">
          {formatBillingDate(s.last_synced_at)}
          {s.last_sync_error && (
            <span title={s.last_sync_error}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="sync error" />
            </span>
          )}
        </span>
        {/* The error in words, not just a triangle. */}
        {s.last_sync_error && (
          <span
            className="mt-0.5 block max-w-[220px] truncate text-[10px] text-amber-600 dark:text-amber-400"
            title={s.last_sync_error}
            data-testid={`billing-sync-error-${s.pubkey.slice(0, 8)}`}
          >
            {failureLabel(s.last_sync_error)}
          </span>
        )}
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
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Actions
            </DropdownMenuLabel>
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
                <FileJson className="mr-2 h-3.5 w-3.5" /> Flash's record
              </span>
              <span className="pl-[22px] text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Exactly what Flash says right now, beside what we stored. Read-only — it changes nothing.
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
                Re-reads this subscription from Flash and re-applies the tier. Use it when a webhook was missed or the
                row looks stale. Safe to repeat; it may deliberately change nothing.
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
                {paused ? <PlayCircle className="mr-2 h-3.5 w-3.5" /> : <PauseCircle className="mr-2 h-3.5 w-3.5" />}
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
                Ends the subscription in Flash. Depending on the account's cancellation policy they may keep their tier
                until the paid period ends — the confirmation says when.
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
