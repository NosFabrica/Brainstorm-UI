import { useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, Check, Loader2, Lock } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BrainLogo } from "@/components/BrainLogo";
import { Card } from "@/components/ui/card";
import { logout } from "@/accounts/login-flow";
import { publishBrainstormTrustAnchor } from "@/services/trustAnchor";
import { SUPPORTED_CLIENTS } from "@/config/supportedClients";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useFinishSetup } from "@/hooks/useFinishSetup";
import { useSelfHistory } from "@/hooks/useSelf";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";

/**
 * /setup/activate — the checklist's "Activate your Brainstorm account" step as
 * a full page: one signature publishes the kind-10040 Treasure Map that tells
 * other apps where to find this account's scores. The same publish the
 * dashboard's ActivateBrainstormModal performs, reframed for the setup flow —
 * the motivator is the two real clients (Nostria, Ditto) shown locked out
 * until the note exists.
 */

type Phase = "idle" | "signing" | "publishing";

/** The clients whose logos make "other apps can't see your scores" concrete. */
const SHOWCASE_CLIENTS = SUPPORTED_CLIENTS.filter((c) => c.name === "Nostria" || c.name === "Ditto");

export default function ActivateBrainstormPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();
  const { followDone, activateDone } = useFinishSetup();

  const historyQuery = useSelfHistory(user?.pubkey);
  const taPubkey = (historyQuery.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data
    ?.ta_pubkey;
  // Warn before a silent overwrite: a kind-10040 naming a different provider
  // already exists, and continuing replaces it (same bar as the modal).
  const hasOtherProvider = useTrustProviderStatus(user?.pubkey, taPubkey).data === "other";

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [justActivated, setJustActivated] = useState(false);
  const done = justActivated || activateDone;

  if (!user) return null;

  const handleActivate = async () => {
    if (phase !== "idle" || !user.pubkey || !taPubkey) return;
    setError("");
    const result = await publishBrainstormTrustAnchor(user.pubkey, taPubkey, setPhase);
    setPhase("idle");
    if (result.status === "success") {
      setJustActivated(true);
    } else if (result.status === "cancelled") {
      // A declined unlock is a change of mind, not a failure.
      if (!result.unlockDeclined) setError("Signing was cancelled. You can try again whenever you're ready.");
    } else {
      setError(result.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <AppHeader user={user} onLogout={() => { logout(); navigate("/"); }} />

      <main className="flex items-center justify-center px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <Card accent className="w-full max-w-xl overflow-hidden" data-testid="card-activate-page">
          {done ? (
            <div className="p-8 text-center sm:p-10">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
                <Check className="h-6 w-6 text-white" strokeWidth={3} />
              </span>
              <h1
                className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-activate-page-success"
              >
                Your Brainstorm account is active
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Your Treasure Map is published — apps like Nostria and Ditto can now find your trust
                scores.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate("/setup")}
                  className="h-11 rounded-xl bg-brand-primary px-5 text-[13px] font-bold text-white shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary-hover"
                  data-testid="button-activate-back-to-setup"
                >
                  Back to setup checklist
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="h-11 rounded-xl border-2 border-brand-primary px-5 text-[13px] font-semibold text-brand-primary transition-colors hover:bg-brand-primary/[0.08] dark:text-brand-link dark:border-brand-link"
                  data-testid="button-activate-go-dashboard"
                >
                  Go to dashboard
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 sm:p-8">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-[0.25em] text-brand-link">
                  {followDone ? "One step left" : "Almost there"}
                </span>
                <div className="h-px w-10 bg-brand-link/30" />
              </div>
              <h1
                className="text-2xl font-bold leading-[1.15] tracking-tight text-slate-900 dark:text-slate-100 sm:text-[28px]"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-activate-page-title"
              >
                Activate your <span className="text-brand-link">Brainstorm</span> account
              </h1>
              <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                Sign a note that tells other apps where to find your Brainstorm scores.
              </p>

              <div className="mt-6 flex items-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex shrink-0 items-center gap-2">
                  {SHOWCASE_CLIENTS.map((client) => (
                    <span key={client.name} className="relative block">
                      <img
                        src={client.logo}
                        alt={client.name}
                        className="block h-10 w-10 rounded-xl border border-slate-200 bg-white object-contain opacity-75 grayscale dark:border-slate-700"
                        draggable={false}
                      />
                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-slate-300 dark:border-slate-900 dark:bg-slate-600">
                        <Lock className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" />
                      </span>
                    </span>
                  ))}
                </div>
                <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Nostria and Ditto can't see your scores yet.
                </p>
              </div>

              {hasOtherProvider && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/10" data-testid="text-activate-page-replace-warning">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                    Another provider is already publishing your scores. Continuing will{" "}
                    <strong className="font-bold">replace it</strong> with Brainstorm for your trusted
                    assertions going forward.
                  </p>
                </div>
              )}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-500/25 dark:bg-red-500/10" data-testid="text-activate-page-error">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-xs font-medium leading-relaxed text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleActivate}
                disabled={phase !== "idle" || !taPubkey}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary text-sm font-bold tracking-wide text-white shadow-lg shadow-brand-primary/20 transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
                data-testid="button-activate-page-confirm"
              >
                {phase === "signing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Waiting for your signature…
                  </>
                ) : phase === "publishing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing to relays…
                  </>
                ) : (
                  <>
                    <BrainLogo mono size={16} className="text-white" />
                    Activate Brainstorm
                  </>
                )}
              </button>
              {!taPubkey && (
                <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500" data-testid="text-activate-page-preparing">
                  Your account is still being prepared — this unlocks in a few minutes.
                </p>
              )}
              <div className="mt-3.5 text-center">
                <button
                  type="button"
                  onClick={() => navigate("/setup")}
                  className="text-xs text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  data-testid="button-activate-page-later"
                >
                  Maybe later — my scores stay invisible in other apps for now
                </button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
