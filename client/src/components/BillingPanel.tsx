import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Repeat, Loader2, Receipt } from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";
import { useSubscription } from "@/hooks/useSubscription";
import { cancelSubscription } from "@/services/subscription";
import { TIERS, type SubscriptionStatus } from "@/lib/plans";

const STATUS_META: Record<SubscriptionStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  grace: { label: "Grace period", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  past_due: { label: "Payment due", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  canceled: { label: "Canceled", cls: "bg-slate-100 border-slate-200 text-slate-600" },
  none: { label: "—", cls: "bg-slate-100 border-slate-200 text-slate-500" },
};

/**
 * The current-plan panel shared by the standalone /billing page and the
 * Settings → Billing tab. Reads live state from `useSubscription` (mock until
 * the backend ships) and cancels via the subscription seam.
 */
export function BillingPanel() {
  const { tier, status, currentPeriodEnd, rail } = useSubscription();
  const info = TIERS[tier];
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPaid = tier !== "grapevine";
  const canCancel = isPaid && (status === "active" || status === "grace" || status === "past_due");
  const renewal = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const doCancel = async () => {
    setBusy(true);
    try {
      await cancelSubscription();
      await qc.invalidateQueries({ queryKey: ["/user/subscription"] });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="billing-panel">
      {/* Current plan */}
      <div className="rounded-2xl border border-[#7c86ff]/15 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Current plan</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900" data-testid="billing-tier">{info.name}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[status].cls}`} data-testid="billing-status">
                {STATUS_META[status].label}
              </span>
            </div>
          </div>
          <div className="text-right">
            {isPaid ? (
              <>
                <div className="inline-flex items-baseline gap-1 text-lg font-bold text-slate-900 tabular-nums">
                  {info.satsPerMonth.toLocaleString()}
                  <span className="text-xs font-semibold text-amber-600 inline-flex items-center gap-0.5"><FlashIcon className="h-3 w-3" />sats</span>
                  <span className="text-xs font-normal text-slate-400">/ mo</span>
                </div>
                <div className="text-xs text-slate-400">{info.usdApprox}</div>
              </>
            ) : (
              <div className="text-lg font-bold text-slate-900">Free</div>
            )}
          </div>
        </div>

        {isPaid && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {renewal && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                {status === "canceled" ? "Ends" : "Renews"} {renewal}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5 text-indigo-500" />
              {rail === "card" ? "Card" : "Lightning · PayWithFlash"}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#6366f1] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4f46e5]"
            data-testid="billing-change-plan"
          >
            {isPaid ? "Change plan" : "See plans"}
          </Link>

          {canCancel && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-red-200 hover:text-red-600"
              data-testid="billing-cancel"
            >
              Cancel subscription
            </button>
          )}
          {canCancel && confirming && (
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={doCancel}
                disabled={busy}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                data-testid="billing-cancel-confirm"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirm cancel
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-sm font-medium text-slate-400 hover:text-slate-600"
              >
                Keep plan
              </button>
            </div>
          )}
        </div>

        {status === "canceled" && renewal && (
          <p className="mt-3 text-xs text-amber-700">
            Your subscription is canceled and access ends on {renewal}. Re-subscribe anytime.
          </p>
        )}
      </div>

      {/* Receipts — populated by the backend later */}
      <div className="rounded-2xl border border-[#7c86ff]/15 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Receipt className="h-4 w-4 text-slate-400" /> Payment history
        </div>
        <p className="mt-2 text-sm text-slate-400" data-testid="billing-receipts-empty">
          {isPaid ? "Receipts appear here after each Lightning payment settles." : "No payments yet — you're on the free plan."}
        </p>
      </div>
    </div>
  );
}
