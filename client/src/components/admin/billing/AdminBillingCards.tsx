import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { apiClient, type AdminBillingSubscription } from "@/services/api";
import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/tones";
import { npubFromPubkey } from "@/lib/shareId";

const SUBS_KEY = ["/api/admin/billing/subscriptions"];

/**
 * Where write actions live. We deliberately don't build manage/cancel/comp
 * here (conservative scope: only what the server's read endpoint provides) —
 * admins resolve anything hands-on in the Flash dashboard itself.
 */
const FLASH_DASHBOARD_URL = "https://dev.vault.paywithflash.com/subscriptions";

/** Flash's statuses are an open set — color the ones we know, never crash on new ones. */
function statusTone(status: string): Tone {
  if (status === "active" || status === "trial") return "success";
  if (status === "pending" || status === "past_due" || status === "paused") return "warning";
  if (status === "canceled" || status === "expired") return "neutral";
  return "neutral";
}

function fmtDate(iso: string | null): string {
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

/**
 * The admin Billing tab's two cards: every subscription the server sees via
 * Flash's API (view-only), and — separately — the ref-less "bypass" signups
 * that came through Flash's plain link and therefore aren't attached to any
 * account. Those need an admin's eyes; resolution is manual, in Flash.
 */
export function AdminBillingCards({ active }: { active: boolean }) {
  const query = useQuery({
    queryKey: SUBS_KEY,
    queryFn: () => apiClient.getAdminBillingSubscriptions(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });

  const subs = query.data ?? [];
  const attributed = subs.filter((s) => s.ref);
  const unattributed = subs.filter((s) => !s.ref);

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading subscriptions…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="py-6 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-error">
        Couldn't load subscriptions — the server's billing endpoint may not be live yet.
        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {(query.error as Error)?.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subscribers — attributed to an account via the checkout `ref`. */}
      <div>
        {attributed.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-empty">
            No attributed subscriptions yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]" data-testid="table-billing-subscribers">
              <thead>
                <tr className="border-b border-brand-accent/10">
                  <th className={th}>Subscriber</th>
                  <th className={th}>Plan</th>
                  <th className={th}>Status</th>
                  <th className={th}>Period ends</th>
                  <th className={th}>Next billing</th>
                  <th className={th}>Since</th>
                </tr>
              </thead>
              <tbody>
                {attributed.map((s) => {
                  const who = shortNpub(s.ref as string);
                  return (
                    <tr key={s.subscription_id} className="border-b border-brand-accent/5" data-testid={`billing-sub-${s.subscription_id}`}>
                      <td className={`${td} font-mono text-xs`} title={who.full}>{who.short}</td>
                      <td className={td}>{s.plan_name ?? s.plan_id ?? "—"}</td>
                      <td className={td}><Chip tone={statusTone(s.status)} size="sm">{s.status}</Chip></td>
                      <td className={`${td} tabular-nums`}>{fmtDate(s.current_period_end)}</td>
                      <td className={`${td} tabular-nums`}>{fmtDate(s.next_billing_date)}</td>
                      <td className={`${td} tabular-nums`}>{fmtDate(s.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {/* Bypass signups — paid, but attached to no account. */}
      <div
        className="rounded-xl border border-amber-200/60 dark:border-amber-400/20 bg-amber-50/50 dark:bg-amber-400/[0.06] px-4 py-3"
        data-testid="card-billing-unattributed"
      >
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Unattributed subscriptions</h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Signups through Flash's plain link carry no <code>ref</code>, so they aren't connected to any
          account and get no Priority scheduling. Resolve manually in the Flash dashboard.
        </p>
        {unattributed.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-unattributed-empty">
            None — every signup is attributed.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {unattributed.map((s) => (
              <li key={s.subscription_id} className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <span className="font-mono text-xs">{s.subscription_id}</span>
                <span>{s.plan_name ?? s.plan_id ?? "—"}</span>
                <Chip tone={statusTone(s.status)} size="sm">{s.status}</Chip>
                <span className="text-xs text-slate-400 dark:text-slate-500">since {fmtDate(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
