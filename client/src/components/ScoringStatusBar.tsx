import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, X, ShieldCheck, Clock } from "lucide-react";
import { useScoringStatus } from "@/hooks/useScoringStatus";
import { hasSessionToken } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const CALC_ACTIVE_KEY = "brainstorm_calc_active";
const READY_NUDGE_KEY = "brainstorm_scores_ready_nudge";

// After SLOW_MS we soften the copy; after STALL_MS (or on backend failure) we
// stop the spinner and stand down rather than spin forever. Tunable.
const SLOW_MS = 2 * 60_000;
const STALL_MS = 6 * 60_000;

/**
 * App-wide Web-of-Trust scoring status pill (fixed, bottom-center). While a calc
 * runs it shows "Calculating…", softening after a couple of minutes; if it drags
 * past STALL_MS (the new-account follow-propagation delay) or the backend reports
 * failure, it stands down to a calm "we'll keep working in the background" card
 * instead of hanging. Once scoring genuinely completes it flips to a dismissible
 * "ready — see your results" nudge (→ /dashboard). The calc→ready transition is
 * persisted so the nudge survives navigation. Self-gates when logged out / idle.
 */
export function ScoringStatusBar() {
  const [location, navigate] = useLocation();
  const { isCalculating, isReady, status, elapsedMs, triggeredAt, pubkey } = useScoringStatus();
  const wasCalculating = useRef(false);
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [standDownDismissed, setStandDownDismissed] = useState(false);
  // Inline confirm shown when the user clicks X on the active "Calculating…" pill.
  const [confirming, setConfirming] = useState(false);
  // Immediate, guaranteed hide of the calculating pill this session; the
  // localStorage marker below persists it across reloads for the same run.
  const [calcHidden, setCalcHidden] = useState(false);

  useEffect(() => {
    try {
      if (isCalculating) {
        localStorage.setItem(CALC_ACTIVE_KEY, "1");
      } else if (localStorage.getItem(CALC_ACTIVE_KEY) === "1" && isReady) {
        // Just finished — raise a persistent "ready" nudge, clear any stand-down
        // dismissal so the good news isn't suppressed, and fire a one-shot toast.
        // Removing CALC_ACTIVE_KEY here makes this branch fire exactly once per run,
        // so the toast never repeats on reload/remount even if the user dismissed
        // the "Calculating…" pill.
        localStorage.removeItem(CALC_ACTIVE_KEY);
        localStorage.setItem(READY_NUDGE_KEY, String(Date.now()));
        setDismissed(false);
        setStandDownDismissed(false);
        force((n) => n + 1);
        toast({
          title: "Your Web of Trust is ready ✓",
          description: "We've finished scoring your network — see your results on the dashboard.",
          action: (
            <ToastAction
              altText="View dashboard"
              onClick={() => navigate("/dashboard")}
              className="bg-brand-primary text-white border-transparent hover:bg-brand-primary-hover hover:text-white"
            >
              View dashboard
            </ToastAction>
          ),
        });
      }
    } catch {
      /* ignore */
    }
    // Calc just stopped (a real active→inactive transition, not the initial
    // not-yet-loaded render) — clear this run's hide so the next run re-shows.
    if (wasCalculating.current && !isCalculating) {
      setCalcHidden(false);
      try { if (pubkey) localStorage.removeItem(`brainstorm_calc_pill_dismissed:${pubkey}`); } catch { /* ignore */ }
    }
    wasCalculating.current = isCalculating;
  }, [isCalculating, isReady, navigate, pubkey]);

  // Never let the dismiss-confirm linger past the active calc (e.g. it completes
  // while the note is open, or a later run starts) — reset it when calc stops.
  useEffect(() => {
    if (!isCalculating && confirming) setConfirming(false);
  }, [isCalculating, confirming]);

  if (!hasSessionToken()) return null;
  // The dashboard already surfaces calculating/score state inline (and every
  // button here just routes back to it), so the floating bar would be redundant
  // there. It still shows on every other page until calc finishes or it's dismissed.
  if (location.startsWith("/dashboard")) return null;

  const readyNudgeFresh = (() => {
    try {
      const ts = Number(localStorage.getItem(READY_NUDGE_KEY) || 0);
      return ts > 0 && Date.now() - ts < 24 * 3600_000;
    } catch {
      return false;
    }
  })();

  const elapsed = elapsedMs ?? 0;
  const showReady = !isCalculating && isReady && readyNudgeFresh && !dismissed;

  // Did the user hide the active "Calculating…" pill for *this* run (persisted so
  // it survives reload)? Keyed to the trigger timestamp — which is "0" for an
  // existing account whose calc is backend-driven, so we compare the raw string
  // rather than gating on `> 0`. The marker is cleared when the calc stops, so a
  // genuinely new run re-shows the pill.
  const calcPillDismissed = (() => {
    try {
      if (!pubkey) return false;
      const v = localStorage.getItem(`brainstorm_calc_pill_dismissed:${pubkey}`);
      return v !== null && v === String(triggeredAt);
    } catch {
      return false;
    }
  })();
  const calcPillHidden = calcHidden || calcPillDismissed;

  // Pick the single phase to render.
  type Phase = "spinner" | "soft" | "standdown" | "ready" | null;
  let phase: Phase = null;
  if (status === "failed" || (isCalculating && elapsed > STALL_MS)) phase = "standdown";
  else if (isCalculating) phase = elapsed > SLOW_MS ? "soft" : "spinner";
  else if (showReady) phase = "ready";

  if (phase === "standdown" && standDownDismissed) return null;
  // User chose to hide the active calculating pill for this run — stay hidden.
  // The completion toast + ready pill still fire, so the promise is kept.
  if ((phase === "spinner" || phase === "soft") && calcPillHidden && !confirming) return null;
  if (!phase) return null;

  const dismissReady = () => {
    setDismissed(true);
    try { localStorage.removeItem(READY_NUDGE_KEY); } catch {}
  };

  const hideCalcPill = () => {
    // Persist for reload (marker = this run's triggeredAt, "0" when backend-driven)
    // AND hide immediately via state, so it disappears regardless of storage.
    try {
      if (pubkey) localStorage.setItem(`brainstorm_calc_pill_dismissed:${pubkey}`, String(triggeredAt));
    } catch { /* ignore */ }
    setCalcHidden(true);
    setConfirming(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 w-full max-w-md pointer-events-none">
      {phase === "spinner" || phase === "soft" ? (
        confirming ? (
          <div
            className="pointer-events-auto mx-auto flex items-start gap-3 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20 pl-4 pr-3 py-3"
            data-testid="scoring-status-confirm"
          >
            <div className="max-w-[16rem]">
              <p className="text-[13px] font-semibold leading-snug">You can close this — we'll let you know the moment it's ready.</p>
              <p className="mt-0.5 text-xs text-slate-300 leading-snug">Scoring keeps running in the background.</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <button
                type="button"
                onClick={hideCalcPill}
                className="rounded-full bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold px-3 py-1.5 transition-colors"
                data-testid="scoring-status-confirm-hide"
              >
                Hide
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full text-slate-300 hover:text-white hover:bg-white/10 text-xs font-medium px-2.5 py-1.5 transition-colors"
                data-testid="scoring-status-confirm-keep"
              >
                Keep showing
              </button>
            </div>
          </div>
        ) : (
          <div
            className="pointer-events-auto mx-auto w-fit flex items-center gap-2.5 rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/20 pl-3.5 pr-2 py-2"
            data-testid="scoring-status-calculating"
          >
            <Loader2 className="h-4 w-4 animate-spin text-indigo-300 shrink-0" />
            <span className="text-sm font-medium">
              {phase === "soft"
                ? "Still building your Web of Trust — new accounts can take a few minutes."
                : "Calculating your Web of Trust…"}
            </span>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              data-testid="scoring-status-calculating-dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      ) : phase === "standdown" ? (
        <div
          className="pointer-events-auto mx-auto flex items-center gap-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-900/10 pl-3 pr-2 py-2"
          data-testid="scoring-status-standdown"
        >
          <span className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </span>
          <span className="text-[13px] text-slate-600 dark:text-slate-300 leading-snug max-w-[15rem]">
            We'll keep building your Web of Trust in the background — check your dashboard later.
          </span>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 transition-colors"
            data-testid="scoring-status-standdown-dashboard"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setStandDownDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            data-testid="scoring-status-standdown-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          className="pointer-events-auto mx-auto flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 border border-emerald-200 shadow-lg shadow-slate-900/10 pl-3 pr-2 py-1.5"
          data-testid="scoring-status-ready"
        >
          <span className="h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your Web of Trust is ready</span>
          <button
            type="button"
            onClick={() => { dismissReady(); navigate("/dashboard"); }}
            className="inline-flex items-center gap-1 rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold px-3 py-1.5 transition-colors"
            data-testid="scoring-status-view"
          >
            See your results <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={dismissReady}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            data-testid="scoring-status-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
