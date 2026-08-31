import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, X } from "lucide-react";
import { FEATURES } from "@/config/featureFlags";
import {
  setMockSubscription,
  clearMockSubscription,
} from "@/services/subscription";

/**
 * Walkthrough control for the subscription lifecycle.
 *
 * Payments run on the mock seam until the backend and Flash webhooks ship, which
 * means every state a subscriber can be in is reachable TODAY — there was just
 * no way to reach them in a meeting short of typing localStorage commands into
 * the console. This is that way: a small floating panel that flips the mock and
 * lets the whole room watch the account menu, Insights, Settings → Billing and
 * the pricing page react.
 *
 * Renders ONLY in mock mode (`!FEATURES.subscriptionApi`), so it removes itself
 * the day payments become real — the flag that turns on real billing is the
 * same flag that turns this off. Not gated to dev builds on purpose: staging
 * runs mock mode too, and staging is where the team looks.
 *
 * There is no rail state: Flash's subscription object carries no payment-method
 * field, so the contract dropped it rather than shipping a permanent null.
 */
const STATES: {
  key: string;
  label: string;
  hint: string;
  apply: () => void;
}[] = [
  {
    key: "free",
    label: "Free",
    hint: "the default — nothing stored",
    apply: () => clearMockSubscription(),
  },
  {
    key: "paid",
    label: "Priority",
    hint: "paid, renews in 30 days",
    apply: () => setMockSubscription(true, "active"),
  },
  {
    key: "past-due",
    label: "Payment due",
    hint: "a renewal failed; grace running",
    apply: () => setMockSubscription(true, "past_due"),
  },
  {
    key: "cancelling",
    label: "Cancelling",
    hint: "still active; ends tomorrow",
    apply: () => setMockSubscription(true, "active", 1),
  },
  {
    key: "canceled",
    label: "Cancelled",
    hint: "access until period end",
    apply: () => setMockSubscription(true, "canceled"),
  },
];

export function DemoSubscriptionSwitcher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const qc = useQueryClient();

  if (FEATURES.subscriptionApi) return null;

  const applyState = (s: (typeof STATES)[number]) => {
    s.apply();
    setActive(s.key);
    // The subscription query everywhere keys on this — one invalidation and the
    // account menu, Insights, Settings and pricing all re-render together,
    // which is the point of the demo.
    void qc.invalidateQueries({ queryKey: ["/user/subscription"] });
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden" data-testid="demo-sub-switcher">
      {open ? (
        <div className="w-64 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <FlaskConical className="h-3.5 w-3.5" /> Demo: subscription
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close demo switcher"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {STATES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => applyState(s)}
                data-testid={`demo-state-${s.key}`}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  active === s.key
                    ? "bg-brand-primary/10 ring-1 ring-brand-primary/30"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{s.label}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{s.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
            Mock only — disappears when real billing ships. No money moves.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="demo-sub-switcher-open"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 shadow-lg backdrop-blur hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
        >
          <FlaskConical className="h-3.5 w-3.5" /> Demo
        </button>
      )}
    </div>
  );
}
