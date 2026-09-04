/**
 * The divergence report's rows as an admin reads them: a person (kind-0 name
 * and picture, npub beneath), what they pay for versus what they're on, a
 * status chip, a date, an error — and, where the server has one, the action.
 * Rows read every field tolerantly: a lagging server may omit some.
 */
import { Loader2, Plus, RefreshCw, User, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/tones";
import { formatBillingDate } from "@/lib/plans";
import { npubFromPubkey } from "@/lib/shareId";
import type {
  AbandonedCheckoutRow,
  ExhaustedEventRow,
  FailingSyncRow,
  PolicyMismatchRow,
  RetiredPlanSubscriberRow,
  StaleSyncRow,
  UnmappedPlanRow,
  UnrecognisedStatusRow,
} from "@/services/api";

export type ProfileBits = { name?: string; picture?: string };

export function statusTone(status: string): Tone {
  if (status === "active" || status === "trial") return "success";
  if (status === "pending" || status === "past_due" || status === "paused") return "warning";
  return "neutral";
}

function shortNpub(pubkey: string): { short: string; full: string } {
  try {
    const full = npubFromPubkey(pubkey);
    return { short: `${full.slice(0, 12)}…${full.slice(-5)}`, full };
  } catch {
    return { short: `${pubkey.slice(0, 8)}…`, full: pubkey };
  }
}

/** The same identity cell the roster uses: picture, name, npub beneath. */
export function PersonCell({ pubkey, profile }: { pubkey: string; profile?: ProfileBits }) {
  const who = shortNpub(pubkey);
  return (
    <span className="flex min-w-0 items-center gap-2" title={profile?.name ? `${profile.name} — ${who.full}` : who.full}>
      <Avatar className="h-6 w-6 shrink-0">
        {profile?.picture ? <AvatarImage src={profile.picture} alt={profile?.name || "Subscriber"} className="object-cover" /> : null}
        <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
          {profile?.name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
        </AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="max-w-[180px] truncate text-sm font-medium text-slate-800 dark:text-slate-100">{profile?.name || who.short}</span>
        {profile?.name && <span className="max-w-[180px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">{who.short}</span>}
      </span>
    </span>
  );
}

export function ResyncButton({ kind, pubkey, busy, onResync }: { kind: string; pubkey: string; busy: boolean; onResync: (pubkey: string) => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onResync(pubkey)}
      title="Re-read this subscriber from Flash now and reapply what it grants"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-brand-accent/40 hover:text-brand-deep disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
      data-testid={`billing-divergence-resync-${kind}-${pubkey.slice(0, 8)}`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Resync
    </button>
  );
}

const rowClass = "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-white/60 px-2.5 py-2 dark:bg-slate-900/40";
const meta = "text-xs text-slate-500 dark:text-slate-400";

export function PolicyMismatchRowView({
  kind,
  row,
  profile,
  policyName,
  busy,
  onResync,
}: {
  kind: "policy_mismatch" | "admin_overrides";
  row: PolicyMismatchRow;
  profile?: ProfileBits;
  policyName: (id: number | null | undefined) => string;
  busy: boolean;
  onResync?: (pubkey: string) => void;
}) {
  const pk8 = row.pubkey?.slice(0, 8) ?? "";
  return (
    <li className={rowClass} data-testid={`billing-${kind === "policy_mismatch" ? "mismatch" : "override"}-${pk8}`}>
      <PersonCell pubkey={row.pubkey ?? ""} profile={profile} />
      <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${meta}`}>
        {row.flash_status && <Chip tone={statusTone(row.flash_status)} size="sm">{row.flash_status}</Chip>}
        <span>
          Pays for <span className="font-medium text-slate-700 dark:text-slate-200">{policyName(row.granted_scheduling_id)}</span>
          {" · on "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{policyName(row.scheduling_id)}</span>
        </span>
        {row.scheduling_source && <span className="text-slate-400 dark:text-slate-500">set by {row.scheduling_source}</span>}
      </span>
      {onResync && row.pubkey && <ResyncButton kind={kind} pubkey={row.pubkey} busy={busy} onResync={onResync} />}
    </li>
  );
}

export function StaleSyncRowView({ row, profile, busy, onResync }: { row: StaleSyncRow; profile?: ProfileBits; busy: boolean; onResync: (pubkey: string) => void }) {
  const pk8 = row.pubkey?.slice(0, 8) ?? "";
  return (
    <li className={rowClass} data-testid={`billing-stale-${pk8}`}>
      <PersonCell pubkey={row.pubkey ?? ""} profile={profile} />
      <span className={`flex items-center gap-2 ${meta}`}>
        {row.flash_status && <Chip tone={statusTone(row.flash_status)} size="sm">{row.flash_status}</Chip>}
        <span>Last read {row.last_synced_at ? formatBillingDate(row.last_synced_at) : "never"}</span>
      </span>
      {row.pubkey && <ResyncButton kind="stale_syncs" pubkey={row.pubkey} busy={busy} onResync={onResync} />}
    </li>
  );
}

export function FailingSyncRowView({ row, profile, busy, onResync }: { row: FailingSyncRow; profile?: ProfileBits; busy: boolean; onResync: (pubkey: string) => void }) {
  const pk8 = row.pubkey?.slice(0, 8) ?? "";
  return (
    <li className={rowClass} data-testid={`billing-failing-${pk8}`}>
      <PersonCell pubkey={row.pubkey ?? ""} profile={profile} />
      <span className={`min-w-0 flex-1 ${meta}`}>
        <span className="font-mono text-[11px] text-red-600 dark:text-red-400 break-all">{row.last_sync_error ?? "read failed"}</span>
        {row.last_synced_at && <span className="ml-2 text-slate-400 dark:text-slate-500">last good read {formatBillingDate(row.last_synced_at)}</span>}
      </span>
      {row.pubkey && <ResyncButton kind="failing_syncs" pubkey={row.pubkey} busy={busy} onResync={onResync} />}
    </li>
  );
}

export function UnrecognisedStatusRowView({ row }: { row: UnrecognisedStatusRow }) {
  return (
    <li className={rowClass} data-testid={`billing-unrecognised-${row.flash_status}`}>
      <span className="flex items-center gap-2">
        <Chip tone="warning" size="sm">{row.flash_status ?? "?"}</Chip>
        <span className="text-sm text-slate-700 dark:text-slate-200">
          {row.subscribers ?? 0} {row.subscribers === 1 ? "subscriber" : "subscribers"} held on their current tier
        </span>
      </span>
    </li>
  );
}

export function AbandonedCheckoutRowView({ row, profile, flashUrl }: { row: AbandonedCheckoutRow; profile?: ProfileBits; flashUrl: (id: string) => string }) {
  const pk8 = row.pubkey?.slice(0, 8) ?? "";
  return (
    <li className={rowClass} data-testid={`billing-abandoned-${pk8}`}>
      <PersonCell pubkey={row.pubkey ?? ""} profile={profile} />
      <span className={`flex items-center gap-2 ${meta}`}>
        <span>Started {row.sync_error_since ? formatBillingDate(row.sync_error_since) : "—"}, never paid</span>
        {row.flash_subscription_id && (
          <a href={flashUrl(row.flash_subscription_id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-link hover:underline">
            Flash <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </span>
    </li>
  );
}

export function RetiredPlanRowView({ row, profile, flashUrl, policyName }: { row: RetiredPlanSubscriberRow; profile?: ProfileBits; flashUrl: (id: string) => string; policyName: (id: number | null | undefined) => string }) {
  const pk8 = row.pubkey?.slice(0, 8) ?? "";
  return (
    <li className={rowClass} data-testid={`billing-retired-${pk8}`}>
      <PersonCell pubkey={row.pubkey ?? ""} profile={profile} />
      <span className={`flex flex-wrap items-center gap-2 ${meta}`}>
        {row.flash_status && <Chip tone={statusTone(row.flash_status)} size="sm">{row.flash_status}</Chip>}
        <span>Renewing on a retired plan · grants {policyName(row.granted_scheduling_id)}</span>
      </span>
      {row.flash_subscription_id && (
        <a
          href={flashUrl(row.flash_subscription_id)}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-accent/40 hover:text-brand-deep dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
          data-testid={`billing-retired-flash-${pk8}`}
        >
          View in Flash <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </li>
  );
}

export function ExhaustedEventRowView({ row, children }: { row: ExhaustedEventRow; children?: React.ReactNode }) {
  return (
    <li className={rowClass} data-testid={`billing-exhausted-${row.id}`}>
      <span className={`flex flex-wrap items-center gap-2 ${meta}`}>
        <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{row.event ?? "event"}</span>
        <span>#{row.id}</span>
        <Chip tone="neutral" size="sm">{row.attempts ?? "?"} attempts</Chip>
        {row.process_error && <span className="font-mono text-[11px] text-red-600 dark:text-red-400">{row.process_error}</span>}
      </span>
      {children}
    </li>
  );
}

/** A paying signup on a plan with no mapping: the ids to map, and the button that maps them. */
export function UnmappedPlanRowView({
  row,
  profile,
  flashUrl,
  onCreateMapping,
}: {
  row: UnmappedPlanRow;
  profile?: ProfileBits;
  flashUrl: (id: string) => string;
  onCreateMapping: (row: UnmappedPlanRow) => void;
}) {
  return (
    <li className={rowClass} data-testid={`billing-unmapped-${row.id}`}>
      <span className="flex min-w-0 flex-col gap-1">
        {row.external_ref && row.external_ref.length === 64 ? (
          <PersonCell pubkey={row.external_ref} profile={profile} />
        ) : (
          <span className="text-sm text-slate-700 dark:text-slate-200">{row.event ?? "event"} #{row.id}</span>
        )}
        <span className={`flex flex-wrap items-center gap-x-2 ${meta}`}>
          <span>
            service <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{row.flash_service_id ?? "?"}</span>
            {" · plan "}
            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{row.flash_plan_id ?? "?"}</span>
          </span>
          {row.created_at && <span>{formatBillingDate(row.created_at)}</span>}
          {row.flash_subscription_id && (
            <a href={flashUrl(row.flash_subscription_id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-link hover:underline">
              Flash <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onCreateMapping(row)}
        disabled={!row.flash_service_id || !row.flash_plan_id}
        title="Map this Flash plan to a scheduling policy; the event replays on the next sweep"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-primary px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        data-testid={`billing-unmapped-create-${row.id}`}
      >
        <Plus className="h-3 w-3" /> Create mapping
      </button>
    </li>
  );
}
