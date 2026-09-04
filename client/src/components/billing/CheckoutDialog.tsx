import { useEffect, useState } from "react";
import { productName } from "@/lib/plans";
import { Loader2, ExternalLink } from "lucide-react";
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
import { PlanPicker } from "@/components/billing/PlanPicker";
import type { BillingPlan } from "@/services/subscription";

/**
 * The hand-off to Flash's payment page.
 *
 * ## It is the picker, in a dialog
 *
 * The dialog and /pricing were always answering one question — what's on offer
 * — so they share `PlanPicker`. Open it with a `plan` and it confirms that one
 * row; open it with none and it shows everything purchasable. Either way the
 * row's own button is what starts checkout, which is what keeps `window.open`
 * inside the click.
 *
 * ## Identity is one query parameter
 *
 * The checkout URL comes from GET /billing/plans, complete except `ref` — we
 * append the signed-in hex pubkey, Flash echoes it back on the redirect, and
 * that's the entire binding (UI-HANDOFF.md). Checkout is idempotent on `ref`:
 * an existing subscriber who clicks again is redirected back, not charged
 * twice.
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
export function CheckoutDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected from /pricing. Null opens the full purchasable list. */
  plan?: BillingPlan | null;
}) {
  const { policy, plan: held, refetch } = useSubscription();
  const { plans } = useBillingPlans();
  const me = useActiveAccountDisplay();
  const qc = useQueryClient();
  const [sent, setSent] = useState<BillingPlan | null>(null);

  useEffect(() => {
    if (open) setSent(null);
  }, [open]);

  // Once they're back and it's landed, get out of the way.
  useEffect(() => {
    if (sent && policy && policy.id === sent.policyId) onOpenChange(false);
  }, [sent, policy, onOpenChange]);

  const offered = plan ? [plan] : (plans ?? []).filter((p) => p.checkoutUrl);
  const sentTarget = sent ? resolveCheckout(sent, me?.pubkey) : null;
  // Nothing to open: no signed-in pubkey to bind the payment to, or no row
  // carrying a checkout_url. Say so rather than navigating — a fake checkout
  // page is a worse lie than an empty state.
  const canBuy = !!me?.pubkey && offered.some((p) => p.checkoutUrl);

  const go = (chosen: BillingPlan) => {
    const target = resolveCheckout(chosen, me?.pubkey);
    setSent(chosen);
    // Directly in the handler — see the note above about popup blockers.
    let w: Window | null = null;
    if (target.external) w = window.open(target.url, "_blank", "noopener,noreferrer");
    // Mark stale WITHOUT refetching. A plain invalidate refetches immediately
    // — this query is active, the dialog itself reads it — which answers "free"
    // before they have paid and, worse, resets dataUpdatedAt so the query is
    // fresh again for the whole staleTime. That is exactly the window the focus
    // backstop exists for, so the plain call defeats the thing it was added for.
    void qc.invalidateQueries({ queryKey: ["/user/subscription"], refetchType: "none" });
    startCheckoutPoll(qc, { checkoutWindow: w });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="checkout-dialog">
        {!sent ? (
          <>
            <DialogHeader>
              <DialogTitle>{plan ? `Get ${productName(plan)}` : "Choose a plan"}</DialogTitle>
              <DialogDescription>
                Cancel any time — you keep it to the end of the period you've paid for.
              </DialogDescription>
            </DialogHeader>

            <PlanPicker
              plans={offered}
              currentPolicyId={policy?.id ?? null}
              currentPlanId={held?.planId ?? null}
              onChoose={go}
              className="mt-3"
            />

            {!canBuy && (
              <Alert variant="warning" className="mt-4" data-testid="checkout-unconfigured">
                <AlertDescription className="text-sm">
                  Payments aren't set up in this environment, so there's nothing
                  to open. The rest of the flow still works.
                </AlertDescription>
              </Alert>
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Opens in a new tab. Pay by card, or by Lightning — you'll connect
              your wallet there, so have it handy. Payment is handled by Flash —
              your card details never reach Brainstorm.
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
              {sentTarget?.external && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => window.open(sentTarget.url, "_blank", "noopener,noreferrer")}
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
              {productName(sent)} starts as soon as the payment clears — usually a
              minute or two, though Lightning can take about ten minutes. If it
              still hasn't shown up after that, get in touch and we'll sort it out.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
