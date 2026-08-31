import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import {
  apiClient,
  type AdminBillingDivergenceSection,
  type AdminBillingSubscription,
} from "@/services/api";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/tones";
import { npubFromPubkey } from "@/lib/shareId";

const SUBS_KEY = ["/api/admin/billing/subscriptions"];
const DIVERGENCE_KEY = ["/api/admin/billing/divergence"];

/**
 * Where write actions live. The server exposes resync/block/plan-mapping
 * verbs, but v1 keeps the tab view-only — admins act in the Flash dashboard
 * (or via the server's /docs) until the team asks for buttons.
 */
const FLASH_DASHBOARD_URL = "https://dev.vault.paywithflash.com/subscriptions";

/** Flash's statuses are an open set — color the ones we know, never crash on new ones. */
function statusTone(status: string): Tone {
  if (status === "active" || status === "trial") return "success";
  if (status === "pending" || status === "past_due" || status === "paused") return "warning";
  if (status === "canceled" || status === "expired") return "neutral";
  return "neutral";
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

function SubscriberRow({ s }: { s: AdminBillingSubscription }) {
  const who = shortNpub(s.pubkey);
  // What the subscription grants vs what the user is actually in — the
  // payments→scheduler connection this tab exists to make visible.
  const scheduling = s.granted_scheduling_name ?? s.scheduling_name ?? "—";
  return (
    <tr className="border-b border-brand-accent/5" data-testid={`billing-sub-${s.pubkey.slice(0, 8)}`}>
      <td className={`${td} font-mono text-xs`} title={who.full}>{who.short}</td>
      <td className={td}>
        <span className="inline-flex items-center gap-1.5">
          <Chip tone={statusTone(s.flash_status)} size="sm">{s.flash_status}</Chip>
          {s.billing_blocked && (
            <Chip tone="danger" size="sm" data-testid={`billing-blocked-${s.pubkey.slice(0, 8)}`}>blocked</Chip>
          )}
        </span>
      </td>
      <td className={td}>
        {scheduling}
        <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500">via {s.scheduling_source}</span>
      </td>
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
  const divergenceEntries = Object.entries(divergence).filter(([, s]) => s.count > 0);

  return (
    <div className="space-y-6">
      {/* Subscriber roster — attributed by construction (pubkey-keyed). */}
      <div>
        {items.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-empty">
            No subscribers yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" data-testid="table-billing-subscribers">
              <thead>
                <tr className="border-b border-brand-accent/10">
                  <th className={th}>Subscriber</th>
                  <th className={th}>Status</th>
                  <th className={th}>Scheduling</th>
                  <th className={th}>Period ends</th>
                  <th className={th}>Last synced</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <SubscriberRow key={s.pubkey} s={s} />
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
            {Object.entries(row)
              .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
              .join("  ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
