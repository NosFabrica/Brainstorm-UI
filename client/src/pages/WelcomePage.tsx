import { useEffect } from "react";
import { useLocation } from "wouter";
import { BrainLogo } from "@/components/BrainLogo";
import { FollowPicker } from "@/components/FollowPicker";
import { triggerScoringAndAnchor } from "@/services/nostr";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { followPubkeys } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";

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
  const returnPath = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/welcome") return n;
    } catch { /* ignore */ }
    return "/";
  })();

  // Navigate home IMMEDIATELY, then publish the follow list + trigger scoring in
  // the background (the global ScoringStatusBar keeps the "calculating" state
  // visible after this page unmounts). `followPubkeys` ingests the signed kind-3
  // into the backend before returning, so scoring runs on fresh follows.
  const finish = (pks: string[]) => {
    if (!pks.length) return;
    if (user?.pubkey) { try { localStorage.setItem(`brainstorm_calc_triggered_at:${user.pubkey}`, String(Date.now())); } catch {} }
    toast({ title: "You're all set!", description: "Your trust network is calculating — explore and finish setting up in the meantime." });
    navigate(returnPath, { replace: true });
    void (async () => {
      try {
        const res = await followPubkeys(pks);
        if (!res.success) {
          toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Try again from your dashboard." });
          return;
        }
        if (user?.pubkey) await triggerScoringAndAnchor(user.pubkey);
      } catch {
        /* the status chip + dashboard reflect the outcome */
      }
    })();
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
        <p className="mt-5 text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
          Your Web of Trust is built from who you follow. Pick at least one account so Brainstorm can
          calculate your trust scores and personalize your results.
        </p>

        <div className="mt-6">
          <FollowPicker onContinue={finish} continueLabel="Follow & calculate my scores" />
        </div>
      </main>
    </div>
  );
}
