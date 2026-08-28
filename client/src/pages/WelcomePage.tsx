import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Check, Info } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { ConfirmNewFollowListDialog } from "@/components/ConfirmNewFollowListDialog";
import { FollowPicker } from "@/components/FollowPicker";
import { triggerScoringAndAnchor } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { followPubkeys, type FollowOptions } from "@/services/socialActions";
import { useFinishSetup } from "@/hooks/useFinishSetup";
import { useToast } from "@/hooks/use-toast";
import { accountKey } from "@/lib/accountStorage";

/**
 * Post-signup "Build your network" — the primary activation step. New users pick
 * accounts to follow (NosFabrica preselected + their inviter + friend search),
 * then we publish ONE kind-3 and kick off their Web-of-Trust scoring. The picker
 * itself lives in the shared <FollowPicker> (also used by the onboarding wizard).
 */
export default function WelcomePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  // If they reached onboarding via a value gate (e.g. the "build your WoT to
  // filter this thread" nudge with ?next=/e/…), return them there afterward.
  // Default is the /setup checklist: publishing the list ticks a step there,
  // and whatever's left (usually activation) is the natural next beat.
  const returnPath = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/welcome") return n;
    } catch { /* ignore */ }
    return "/setup";
  })();

  // Mount-time relay verification: repairs the local follow floor for imported
  // keys (so the at-risk path below almost never engages) and warms the outbox
  // list so the commit-time kind-3 read asks the user's real write relays.
  useVerifiedNoFollows(user?.pubkey);

  const [submitting, setSubmitting] = useState(false);
  const [confirmPks, setConfirmPks] = useState<string[] | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  // Returning to edit an existing list is a lighter action than the first
  // commit — the CTA and the toast both say so.
  const { followDone: alreadyCommitted } = useFinishSetup();

  // Fire the toast + navigation + background scoring/NIP-85 chain — everything
  // that happens after the kind-3 has been published and acked.
  const proceedHome = () => {
    if (user?.pubkey) { try { localStorage.setItem(accountKey("brainstorm_calc_triggered_at", user.pubkey), String(Date.now())); } catch {} }
    toast(
      alreadyCommitted
        ? { title: "Follow list updated", description: "Your scores will reflect the change on the next calculation." }
        : { title: "Follow list published", description: "Your trust network is calculating — usually about 5 minutes." },
    );
    navigate(returnPath, { replace: true });
    // The kind-10040 no longer rides along here: activation is its own step on
    // the /setup checklist (→ /setup/activate), which the returnPath lands on.
    void (async () => {
      try {
        if (!user?.pubkey) return;
        await triggerScoringAndAnchor(user.pubkey);
      } catch {
        /* the status chip + dashboard reflect the outcome */
      }
    })();
  };

  // The kind-3 publish is AWAITED before the "calculating" toast and the
  // navigation, for everyone: followPubkeys may raise the extension prompt or
  // come back asking for from-scratch confirmation, and the user has to still
  // be here to answer either — and a rejected/failed publish must never leave
  // the UI claiming a calculation that was never fed. `followPubkeys` ingests
  // the signed kind-3 into the backend before returning, so scoring runs on
  // fresh follows; the FollowPicker's busy spinner covers the wait.
  const commitFollows = async (pks: string[], opts?: FollowOptions) => {
    setSubmitting(true);
    const res = await followPubkeys(pks, opts);
    if (res.cancelled) {
      setSubmitting(false);
      return;
    }
    if (res.needsBaseConfirmation) {
      setSubmitting(false);
      setConfirmPks(pks);
      return;
    }
    if (!res.success) {
      setSubmitting(false);
      toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Please try again." });
      return;
    }
    proceedHome(); // published and acked
  };

  const finish = (pks: string[]) => {
    if (!pks.length || submitting) return;
    void commitFollows(pks);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-xl flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <BrainLogo size={26} className="text-brand-primary" />
            <span className="text-lg font-bold text-brand-primary font-brand">Brainstorm</span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            data-testid="welcome-skip"
          >
            Skip for now
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
            Build your network
          </span>
          <div className="h-px w-12 bg-brand-accent/40" />
        </div>
        <h1
          className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Follow a few accounts <span className="text-brand-link">to begin</span>.
        </h1>
        <button
          type="button"
          onClick={() => setWhyOpen((v) => !v)}
          className="mt-3 text-sm font-semibold text-brand-link hover:underline"
          aria-expanded={whyOpen}
          data-testid="welcome-why-toggle"
        >
          Why do this?
        </button>
        {whyOpen && (
          <div
            className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.03] to-brand-accent/[0.06] dark:from-brand-deep/20 dark:to-brand-accent/10 bg-white dark:bg-slate-900 p-4"
            data-testid="welcome-why-panel"
          >
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
              <span className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                Your Verification Score — and everyone you can see through Brainstorm — is computed
                from your follow list. No follows, no Web of Trust.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
              <span className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                One follow is enough to start. More follows make your scores richer — and you can
                change your list anytime.
              </span>
            </div>
          </div>
        )}

        <div className="mt-6">
          <FollowPicker
            onContinue={finish}
            continueLabel={alreadyCommitted ? "Update my follow list" : "Follow & calculate my scores"}
            busy={submitting}
          />
        </div>
      </main>

      <ConfirmNewFollowListDialog
        open={confirmPks !== null}
        busy={submitting}
        onCancel={() => setConfirmPks(null)}
        onConfirm={() => {
          const pks = confirmPks;
          setConfirmPks(null);
          if (pks) void commitFollows(pks, { allowFromScratch: true });
        }}
      />
    </div>
  );
}
