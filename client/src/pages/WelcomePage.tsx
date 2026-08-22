import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BrainLogo } from "@/components/BrainLogo";
import { ConfirmNewFollowListDialog } from "@/components/ConfirmNewFollowListDialog";
import { FollowPicker } from "@/components/FollowPicker";
import { Nip85ConsentCard } from "@/components/Nip85ConsentCard";
import { publishBrainstormTrustAnchor, triggerScoringAndAnchor } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { identityHas } from "@/accounts/display";
import { isNip85Activated } from "@/lib/nip85Activation";
import { knownFollowCount } from "@/lib/followStore";
import { followPubkeys, type FollowOptions } from "@/services/socialActions";
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
  const returnPath = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/welcome") return n;
    } catch { /* ignore */ }
    return "/";
  })();

  // The NIP-85 ask sits beside the follow list. Their service key already
  // exists (minted at first auth, independent of scoring), so with consent the
  // kind-10040 is signed right after the kind-3 — the signer is already warm —
  // instead of a background prompt minutes later.
  const [nip85Consent, setNip85Consent] = useState(true);
  const historyQuery = useSelfHistory(user?.pubkey);
  const taPubkey = (historyQuery.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey;

  // Mount-time relay verification: repairs the local follow floor for imported
  // keys (so the at-risk path below almost never engages) and warms the outbox
  // list so the commit-time kind-3 read asks the user's real write relays.
  useVerifiedNoFollows(user?.pubkey);

  const [submitting, setSubmitting] = useState(false);
  const [confirmPks, setConfirmPks] = useState<string[] | null>(null);

  // Fire the toast + navigation + background scoring/NIP-85 chain — everything
  // that happens after the kind-3 is (or is about to be) safely published.
  const proceedHome = (publishFollows: null | (() => Promise<void>)) => {
    if (user?.pubkey) { try { localStorage.setItem(accountKey("brainstorm_calc_triggered_at", user.pubkey), String(Date.now())); } catch {} }
    toast({ title: "You're all set!", description: "Your trust network is calculating — explore and finish setting up in the meantime." });
    navigate(returnPath, { replace: true });
    void (async () => {
      try {
        if (publishFollows) await publishFollows();
        if (!user?.pubkey) return;
        await triggerScoringAndAnchor(user.pubkey, { nip85Consent });
        if (nip85Consent && taPubkey && !isNip85Activated(user.pubkey)) {
          // Cancelled/failed publishes stay quiet — the consent-gated background
          // poll and app-load self-heal finish the job.
          const published = await publishBrainstormTrustAnchor(user.pubkey, taPubkey);
          if (published.status === "success") {
            toast({ title: "Scores shared", description: "Other apps can now find your Brainstorm scores." });
          }
        }
      } catch {
        /* the status chip + dashboard reflect the outcome */
      }
    })();
  };

  // At-risk cohort (imported key, no confirmed follows anywhere): the publish is
  // AWAITED before navigating, because followPubkeys may come back asking for
  // from-scratch confirmation and the user has to still be here to answer it.
  const finishAtRisk = async (pks: string[], opts?: FollowOptions) => {
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
    proceedHome(null); // already published
  };

  // Everyone else navigates home IMMEDIATELY and publishes in the background
  // (the global ScoringStatusBar keeps the "calculating" state visible after
  // this page unmounts). `followPubkeys` ingests the signed kind-3 into the
  // backend before returning, so scoring runs on fresh follows.
  const finish = (pks: string[]) => {
    if (!pks.length || submitting) return;
    const pk = user?.pubkey;
    const atRisk = !!pk && !identityHas(pk, "createdInApp") && knownFollowCount(pk) === 0;
    if (atRisk) {
      void finishAtRisk(pks);
      return;
    }
    proceedHome(async () => {
      const res = await followPubkeys(pks);
      if (res.cancelled) throw new Error("cancelled");
      if (!res.success) {
        toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Try again from your dashboard." });
        throw new Error(res.error || "follow publish failed");
      }
    });
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
          Your network is built from who you follow. Pick at least one account so Brainstorm can
          calculate your scores and personalize your results.
        </p>

        <Nip85ConsentCard
          pubkey={user?.pubkey}
          taPubkey={taPubkey}
          value={nip85Consent}
          onChange={setNip85Consent}
          className="mt-6"
        />
        <div className="mt-4">
          <FollowPicker onContinue={finish} continueLabel="Follow & calculate my scores" busy={submitting} />
        </div>
      </main>

      <ConfirmNewFollowListDialog
        open={confirmPks !== null}
        busy={submitting}
        onCancel={() => setConfirmPks(null)}
        onConfirm={() => {
          const pks = confirmPks;
          setConfirmPks(null);
          if (pks) void finishAtRisk(pks, { allowFromScratch: true });
        }}
      />
    </div>
  );
}
