import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setMockSubscription } from "@/services/subscription";
import { useSubscription } from "@/hooks/useSubscription";
import { hasSessionToken } from "@/services/api";
import { TIER_ORDER, TIERS, type TierId } from "@/lib/plans";

/**
 * QA-only floating control to flip the MOCK subscription tier and watch the
 * pricing/billing/gating UI update. Mounted only in mock mode (the real API flag
 * off) — see App.tsx. Does nothing once VITE_FEATURE_SUBSCRIPTION_API is on.
 */
export function DevSubscriptionSwitcher() {
  const qc = useQueryClient();
  const { tier } = useSubscription();
  const [open, setOpen] = useState(false);

  if (!hasSessionToken()) return null;

  const set = (t: TierId) => {
    setMockSubscription(t);
    qc.invalidateQueries({ queryKey: ["/user/subscription"] });
  };

  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 60 }} data-testid="dev-tier-switcher">
      {open ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-2.5 shadow-lg backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Dev · mock tier</span>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-amber-500 hover:text-amber-700" aria-label="Close">✕</button>
          </div>
          <div className="flex gap-1">
            {TIER_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set(t)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                  tier === t ? "border-amber-500 bg-amber-500 text-white" : "border-amber-200 bg-white text-amber-700 hover:bg-amber-100"
                }`}
                data-testid={`dev-tier-${t}`}
              >
                {TIERS[t].name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-[11px] font-bold text-amber-700 shadow-lg backdrop-blur"
        >
          tier: {TIERS[tier].name}
        </button>
      )}
    </div>
  );
}
