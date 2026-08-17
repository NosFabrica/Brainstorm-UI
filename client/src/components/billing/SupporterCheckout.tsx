import { useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink, Mail, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSubscription } from "@/hooks/useSubscription";
import { resolveCheckout } from "@/lib/checkout";
import { rememberBillingEmail } from "@/services/billingIdentity";
import { PAID_TIER, TIERS, formatPrice } from "@/lib/plans";

/**
 * The step between "Become a supporter" and Flash's payment page.
 *
 * ## Why this screen exists at all
 *
 * It looks like a nicety and isn't. Flash's hosted signup collects an email and
 * nothing else — it has no external-id field, and it ignores every documented
 * pre-fill parameter (all three forms were probed against the live page and all
 * returned empty). So the ONLY thing tying a payment back to a Brainstorm
 * account is that the address someone types at Flash matches one we already
 * know. Capturing it here, and showing it back to them on the way out, is the
 * whole binding mechanism.
 *
 * Hence the copy: the address isn't decoration, and people have to know it has
 * to match. See docs/payments/FLASH-INTEGRATION.md.
 *
 * ## Why a new tab
 *
 * Flash publishes no return URL. A full-page redirect would strand people on
 * their domain when they finish. Opening a tab keeps Brainstorm alive behind it,
 * so the browser handing focus back is our "payment finished" signal
 * (`useSubscription` refetches on focus). It also leaves Flash's real domain in
 * the address bar, which is where it belongs while someone types card details.
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
  const [user] = useCurrentUser();
  const { tier, refetch } = useSubscription();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  // Pre-fill from the profile's NIP-05 when it looks like an address. Most
  // people's NIP-05 is a real mailbox; when it isn't, they just type over it.
  const suggested = useMemo(() => {
    const nip05 = (user as { nip05?: string } | null)?.nip05 ?? "";
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nip05) ? nip05 : "";
  }, [user]);

  useEffect(() => {
    if (open) {
      setEmail((e) => e || suggested);
      setSent(false);
    }
  }, [open, suggested]);

  // Once they're back and the subscription has landed, get out of the way.
  useEffect(() => {
    if (sent && tier === PAID_TIER) onOpenChange(false);
  }, [sent, tier, onOpenChange]);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const target = resolveCheckout(PAID_TIER, { rail: "card" });
  const price = formatPrice(PAID_TIER);

  const go = () => {
    const clean = email.trim().toLowerCase();
    if (!valid) return;
    rememberBillingEmail(user?.pubkey ?? null, clean);
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

            <div className="mt-2">
              <label
                htmlFor="billing-email"
                className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Your email address
              </label>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                This is how we link your payment to your account, and how we
                reach you about it. Use the same address on the payment page.
              </p>
              <div className="mt-2.5 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="billing-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && valid) go(); }}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20"
                  data-testid="input-billing-email"
                />
              </div>
            </div>

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
              disabled={!valid}
              onClick={go}
              data-testid="button-continue-to-payment"
            >
              Continue to payment <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Payment opens in a new tab and is handled by Flash. Your card
              details never reach Brainstorm.
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

            <Alert variant="info" className="mt-2">
              <Mail className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Use <span className="font-semibold">{email.trim().toLowerCase()}</span>{" "}
                on the payment page. A different address won't be matched to this
                account.
              </AlertDescription>
            </Alert>

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
              {TIERS[PAID_TIER].name} starts as soon as the payment clears. If
              it doesn't show up within a few minutes, get in touch and we'll
              sort it out.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
