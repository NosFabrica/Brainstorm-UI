import { useEffect, useState } from "react";
import { Loader2, ExternalLink, ArrowRight, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/useSubscription";
import { useBillingPlans } from "@/hooks/useBillingPlans";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { resolveCheckout } from "@/lib/checkout";
import { startCheckoutPoll } from "@/lib/checkoutPoll";
import { PAID_TIER, TIERS, formatPrice, liveFeatures, recalcFeatureLabel } from "@/lib/plans";

/**
 * The hand-off to Flash's payment page.
 *
 * ## Identity is one query parameter
 *
 * The checkout URL comes from GET /billing/plans, complete except `ref` — we
 * append the signed-in hex pubkey, Flash echoes it back on the redirect, and
 * that's the entire binding (UI-HANDOFF.md). The email-correlation design this
 * replaced is gone. Checkout is idempotent on `ref`: an existing subscriber
 * who clicks again is redirected back, not charged twice.
 *
 * ## Return is belt and braces
 *
 * Flash redirects to /billing/return (primary). This dialog also invalidates
 * the subscription query when it opens Flash — so the focus refetch actually
 * fires (it never does inside the staleTime window; handoff A3) — and starts
 * the in-flight poll (lib/checkoutPoll), which survives this dialog closing
 * because Lightning `pending` can take ~10 minutes.
 *
 * `window.open` runs directly in the click handler so popup blockers allow it —
 * do not move it behind an await.
 */
export function PriorityCheckout({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tier, refetch } = useSubscription();
  const { planFor, recalcDays } = useBillingPlans();
  const me = useActiveAccountDisplay();
  const qc = useQueryClient();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) setSent(false);
  }, [open]);

  // Once they're back and it's landed, get out of the way.
  useEffect(() => {
    if (sent && tier === PAID_TIER) onOpenChange(false);
  }, [sent, tier, onOpenChange]);

  const target = resolveCheckout(planFor(PAID_TIER), me?.pubkey);
  const price = formatPrice(PAID_TIER);
  // The interval line renders from the LIVE cadence; static labels are fallbacks.
  const perks = [
    { key: "recalc-live", label: recalcFeatureLabel(recalcDays(PAID_TIER), recalcDays("free")) },
    ...liveFeatures(PAID_TIER).filter((f) => !f.interval),
  ];

  const go = () => {
    setSent(true);
    // Directly in the handler — see the note above about popup blockers.
    let w: Window | null = null;
    if (target.external) w = window.open(target.url, "_blank", "noopener,noreferrer");
    // A3: mark the query stale so the focus refetch really fires; A4: poll.
    void qc.invalidateQueries({ queryKey: ["/user/subscription"] });
    startCheckoutPoll(qc, { checkoutWindow: w });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="priority-checkout">
        {!sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Get Priority</DialogTitle>
              <DialogDescription>
                {price} a month. Cancel any time.
              </DialogDescription>
            </DialogHeader>

            <ul className="mt-3 space-y-2" data-testid="checkout-perks">
              {perks.map((f) => (
                <li
                  key={f.key}
                  className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {f.label}
                </li>
              ))}
            </ul>

            {!target.external && (
              <Alert variant="warning" className="mt-4" data-testid="checkout-unconfigured">
                <AlertDescription className="text-sm">
                  Payments aren't set up in this environment, so there's nothing
                  to open. The rest of the flow still works.
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="mt-4 w-full gap-1.5"
              onClick={go}
              data-testid="button-continue-to-payment"
            >
              Continue to payment <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Opens in a new tab. Payment is handled by Flash — your card details
              never reach Brainstorm.
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Finishing up in the other tab</DialogTitle>
              <DialogDescription>
                Complete the payment there, then come back — this page updates on
                its own.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for the payment to come through…
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {target.external && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.open(target.url, "_blank", "noopener,noreferrer")}
                  data-testid="button-reopen-payment"
                >
                  <ExternalLink className="h-4 w-4" /> Reopen payment page
                </Button>
              )}
              <Button variant="ghost" onClick={() => refetch()} data-testid="button-check-again">
                Check again
              </Button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {TIERS[PAID_TIER].name} starts as soon as the payment clears. If it
              doesn't show up within a few minutes, get in touch and we'll sort it
              out.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
