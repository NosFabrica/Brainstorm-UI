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
import { useSubscription } from "@/hooks/useSubscription";
import { resolveCheckout } from "@/lib/checkout";
import { PAID_TIER, TIERS, formatPrice, liveFeatures } from "@/lib/plans";

/**
 * The hand-off to Flash's payment page.
 *
 * ## Why this does NOT ask for an email
 *
 * It used to, on the theory that capturing the address before the redirect was
 * the only way to tie a payment back to an account. Two things killed that:
 *
 * 1. Flash's page cannot be pre-filled — it contains no `URLSearchParams`, no
 *    `location.search`, no query-string reading of any kind, so no parameter of
 *    any name will ever populate it. Asking here therefore meant typing the same
 *    address twice, on two different pages, to buy one thing.
 * 2. Nothing consumed what we collected. It went to localStorage and stopped.
 *
 * So the field was pure friction on the one screen where friction costs the
 * most. The binding belongs on the server instead: record a pending checkout
 * against the pubkey when this opens, and match the webhook's email to it on
 * arrival (docs/payments/FLASH-INTEGRATION.md). That is one entry rather than
 * two, and a firmer link than hoping two typed strings agree.
 *
 * ## Why a new tab
 *
 * Flash publishes no return URL. A redirect would strand people on their domain
 * when they finish; a tab keeps Brainstorm alive behind it, so focus coming back
 * is our "payment finished" signal (`useSubscription` refetches on focus). It
 * also leaves Flash's real domain in the address bar, which is where it belongs
 * while someone types card details.
 *
 * `window.open` runs directly in the click handler so popup blockers allow it —
 * do not move it behind an await.
 */
export function SupporterCheckout({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tier, refetch } = useSubscription();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) setSent(false);
  }, [open]);

  // Once they're back and it's landed, get out of the way.
  useEffect(() => {
    if (sent && tier === PAID_TIER) onOpenChange(false);
  }, [sent, tier, onOpenChange]);

  const target = resolveCheckout(PAID_TIER, { rail: "card" });
  const price = formatPrice(PAID_TIER);
  const perks = liveFeatures(PAID_TIER);

  const go = () => {
    setSent(true);
    // Directly in the handler — see the note above about popup blockers.
    if (target.external) window.open(target.url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="supporter-checkout">
        {!sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Become a supporter</DialogTitle>
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
