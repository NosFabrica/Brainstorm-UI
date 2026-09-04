import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasSession } from "@/hooks/useHasSession";
import { useSubscription } from "@/hooks/useSubscription";
import { refreshSubscription } from "@/services/subscription";
import { startCheckoutPoll } from "@/lib/checkoutPoll";

/**
 * Where Flash's redirect lands: /billing/return?status=&subscriptionId=&ref=.
 *
 * Registered as a BARE path — redirect_uri matching is exact including the
 * query string, so a path with its own query would be needlessly brittle.
 *
 * Nothing here is granted from the URL — anyone can type one. The page hands
 * the `subscriptionId` to POST /user/subscription/refresh, and the SERVER asks
 * Flash whether that subscription is real and carries this caller's reference;
 * an id naming someone else's payment comes back having changed nothing. The
 * page renders whatever the server then reports.
 *
 * `status` is a checkout outcome, not a subscription status: active/trial →
 * success; pending → confirming + the shared poll (Lightning can take ~10
 * minutes). A `pending` return carries no `subscriptionId` — Flash issues none
 * until the payment confirms — so it refreshes by reference instead, which is
 * the guide's own instruction for that case. Failed payments never redirect at
 * all, so there is no failure screen.
 */
export default function BillingReturnPage() {
  const signedIn = useHasSession();
  const { policy, isPaid, status } = useSubscription();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"checking" | "confirming" | "done" | "none" | "refused">("checking");
  // Flash couldn't be asked on the landing refresh: the poll keeps trying,
  // and the page says why the answer isn't in yet.
  const [flashUnavailable, setFlashUnavailable] = useState(false);
  const ran = useRef(false);

  const params = (() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch {
      return new URLSearchParams();
    }
  })();
  const outcome = params.get("status") ?? "";
  // What the redirect claims was bought. A claim is all it is — the server
  // verifies it with Flash against this caller's own reference.
  const claimedId = params.get("subscriptionId") || undefined;

  // "Return without subscribing" on Flash's page comes back here with NO
  // status at all — that person made no payment and must not see a payment
  // spinner. Treat unknown statuses the same way (the guide says the set is
  // open): one quiet refresh in case a new success-ish status exists, then a
  // calm no-payment state. Only a real outcome starts the confirming poll.
  const paidOutcome = outcome === "active" || outcome === "trial";
  useEffect(() => {
    if (!signedIn || ran.current) return;
    ran.current = true;
    void refreshSubscription(claimedId)
      .then((sub) => {
        const { verification, ...subscription } = sub;
        qc.setQueryData(["/user/subscription"], subscription);
        if (sub.policy && !sub.policy.isDefault && sub.status !== "pending") {
          setPhase("done");
        } else if (claimedId && (verification === "mismatch" || verification === "unknown")) {
          // The server checked the redirect's id with Flash and refused it:
          // it names someone else, nobody, or nothing Flash knows. Polling
          // would promise a payment that isn't coming to this account.
          setPhase("refused");
        } else if (paidOutcome || outcome === "pending") {
          if (verification === "unavailable") setFlashUnavailable(true);
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
  }, [signedIn, outcome, paidOutcome, claimedId, qc]);

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
        ) : phase === "refused" ? (
          <>
            {/* The server checked the redirect's id with Flash and refused it:
                it names someone else, nobody, or nothing Flash knows. Not a
                spinner — a spinner promises a payment that isn't coming here. */}
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">We couldn't verify that payment</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="billing-return-refused">
              The subscription this link names isn't connected to your account, so nothing has changed here.
              If you did just pay, open Billing in a minute — it can take a moment to land. If it still
              isn't there, get in touch and we'll sort it out.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="gap-1.5" data-testid="billing-return-refused-billing">
                <Link href="/settings?tab=billing">Open Billing <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/pricing">Back to pricing</Link>
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
            {flashUnavailable && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500" data-testid="billing-return-unavailable">
                Our payment provider couldn't be reached just now. We'll keep checking.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
