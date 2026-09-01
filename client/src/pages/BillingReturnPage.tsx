import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasSession } from "@/hooks/useHasSession";
import { useSubscription } from "@/hooks/useSubscription";
import { refreshSubscription, setMockSubscription } from "@/services/subscription";
import { startCheckoutPoll } from "@/lib/checkoutPoll";
import { FEATURES } from "@/config/featureFlags";

/**
 * Where Flash's redirect lands: /billing/return?status=&subscriptionId=&ref=.
 *
 * Registered as a BARE path — redirect_uri matching is exact including the
 * query string, so a path with its own query would be needlessly brittle.
 *
 * The parameters are INFORMATIONAL ONLY — anyone can type this URL, so nothing
 * is granted from them. The page calls POST /user/subscription/refresh (empty
 * body: the server syncs whoever is signed in, reading Flash directly) and
 * renders what comes back. `status` is a checkout outcome, not a subscription
 * status: active/trial → success; pending → confirming + the shared poll
 * (Lightning can take ~10 minutes). Failed payments never redirect at all, so
 * there is no failure screen.
 */
export default function BillingReturnPage() {
  const signedIn = useHasSession();
  const { policy, isPaid, status } = useSubscription();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"checking" | "confirming" | "done" | "none">("checking");
  const ran = useRef(false);

  const outcome = (() => {
    try {
      return new URLSearchParams(window.location.search).get("status") ?? "";
    } catch {
      return "";
    }
  })();

  // "Return without subscribing" on Flash's page comes back here with NO
  // status at all — that person made no payment and must not see a payment
  // spinner. Treat unknown statuses the same way (the guide says the set is
  // open): one quiet refresh in case a new success-ish status exists, then a
  // calm no-payment state. Only a real outcome starts the confirming poll.
  const paidOutcome = outcome === "active" || outcome === "trial";
  useEffect(() => {
    if (!signedIn || ran.current) return;
    ran.current = true;
    // Mock mode: apply the outcome so the demo flow round-trips end to end.
    if (!FEATURES.subscriptionApi && paidOutcome) {
      setMockSubscription(true, "active");
    }
    if (!FEATURES.subscriptionApi && outcome === "pending") {
      setMockSubscription(true, "pending");
    }
    void refreshSubscription()
      .then((sub) => {
        qc.setQueryData(["/user/subscription"], sub);
        if (sub.policy && !sub.policy.isDefault && sub.status !== "pending") {
          setPhase("done");
        } else if (paidOutcome || outcome === "pending") {
          setPhase("confirming");
          startCheckoutPoll(qc);
        } else {
          setPhase("none");
        }
      })
      .catch(() => {
        if (paidOutcome || outcome === "pending") {
          setPhase("confirming");
          startCheckoutPoll(qc);
        } else {
          setPhase("none");
        }
      });
  }, [signedIn, outcome, paidOutcome, qc]);

  // The policy they landed on, named by the server. Never a constant: the tier
  // set is gone, and a hardcoded "Priority" would be wrong the day a second
  // paid policy exists.
  const planName = policy?.name ?? "Your plan";

  // The poll writes into the cache; flip the page when the subscription has
  // actually SETTLED — a paid tier still carrying `pending` isn't done yet.
  useEffect(() => {
    if (phase === "confirming" && isPaid && status !== "pending") setPhase("done");
  }, [phase, isPaid, status]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-start justify-center px-4 pt-24">
      <Card className="w-full max-w-md p-6 sm:p-7" data-testid="billing-return">
        {!signedIn ? (
          <>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Almost there</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Sign in to finish connecting your payment to your account.
            </p>
            <Button className="mt-4 w-full gap-1.5" asChild data-testid="billing-return-signin">
              <Link href="/login">Sign in <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </>
        ) : phase === "done" ? (
          <>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {planName} is on
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-return-success">
              Payment received. Your scores now refresh on the {planName} schedule —
              nothing else to do.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="gap-1.5" data-testid="billing-return-insights">
                <Link href="/insights">See your plan <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings?tab=billing">Billing</Link>
              </Button>
            </div>
          </>
        ) : phase === "none" ? (
          <>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">No payment was made</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-return-none">
              That's fine — nothing was charged. You can subscribe any time.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="gap-1.5">
                <Link href="/pricing">Back to pricing <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Home</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Confirming your payment</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-return-pending">
              We haven't seen your payment land yet — usually this takes a minute or two, though
              Lightning can take about ten. This page updates on its own for ten minutes, and it's
              safe to leave; your plan switches the moment it clears. After that, reload to check
              again — if it still hasn't cleared, the payment didn't go through, nothing was
              charged, and it's safe to try again.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
