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
import { PAID_TIER, TIERS } from "@/lib/plans";

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
  const { tier } = useSubscription();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"checking" | "confirming" | "done">("checking");
  const ran = useRef(false);

  const outcome = (() => {
    try {
      return new URLSearchParams(window.location.search).get("status") ?? "";
    } catch {
      return "";
    }
  })();

  useEffect(() => {
    if (!signedIn || ran.current) return;
    ran.current = true;
    // Mock mode: apply the outcome so the demo flow round-trips end to end.
    if (!FEATURES.subscriptionApi && (outcome === "active" || outcome === "trial")) {
      setMockSubscription(PAID_TIER, "active");
    }
    if (!FEATURES.subscriptionApi && outcome === "pending") {
      setMockSubscription(PAID_TIER, "pending");
    }
    void refreshSubscription()
      .then((sub) => {
        qc.setQueryData(["/user/subscription"], sub);
        if (sub.tier !== "free" && sub.status !== "pending") {
          setPhase("done");
        } else {
          setPhase("confirming");
          startCheckoutPoll(qc);
        }
      })
      .catch(() => {
        setPhase("confirming");
        startCheckoutPoll(qc);
      });
  }, [signedIn, outcome, qc]);

  // The poll writes into the cache; when the tier flips, flip the page.
  useEffect(() => {
    if (phase === "confirming" && tier !== "free") setPhase("done");
  }, [phase, tier]);

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
                {TIERS[PAID_TIER].name} is on
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-return-success">
              Payment received. Your scores now refresh on the {TIERS[PAID_TIER].name} schedule —
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
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Confirming your payment</h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-return-pending">
              We haven't seen your payment land yet — this can take a minute, and up to ten with
              Lightning. This page updates on its own, and it's safe to leave; your plan switches
              the moment it clears.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
