import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowRight, X, ShieldCheck } from "lucide-react";
import { useScoringStatus } from "@/hooks/useScoringStatus";
import { hasSessionToken } from "@/services/api";

const CALC_ACTIVE_KEY = "brainstorm_calc_active";
const READY_NUDGE_KEY = "brainstorm_scores_ready_nudge";

/**
 * App-wide Web-of-Trust scoring status pill (fixed, bottom-center). Shows
 * "Calculating your Web of Trust…" while a calc runs on any page, then flips to a
 * dismissible "ready — see your results" nudge once it completes. The calc→ready
 * transition is persisted in localStorage so the nudge survives navigation
 * (every page remounts its own header). Self-gates: renders nothing when logged
 * out or idle.
 */
export function ScoringStatusBar() {
  const [, navigate] = useLocation();
  const { isCalculating, isReady } = useScoringStatus();
  const wasCalculating = useRef(false);
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (isCalculating) {
        localStorage.setItem(CALC_ACTIVE_KEY, "1");
      } else if (localStorage.getItem(CALC_ACTIVE_KEY) === "1" && isReady) {
        // Just finished — raise a persistent "ready" nudge.
        localStorage.removeItem(CALC_ACTIVE_KEY);
        localStorage.setItem(READY_NUDGE_KEY, String(Date.now()));
        setDismissed(false);
        force((n) => n + 1);
      }
    } catch {
      /* ignore */
    }
    wasCalculating.current = isCalculating;
  }, [isCalculating, isReady]);

  if (!hasSessionToken()) return null;

  const readyNudgeFresh = (() => {
    try {
      const ts = Number(localStorage.getItem(READY_NUDGE_KEY) || 0);
      return ts > 0 && Date.now() - ts < 24 * 3600_000;
    } catch {
      return false;
    }
  })();

  const showReady = !isCalculating && isReady && readyNudgeFresh && !dismissed;
  if (!isCalculating && !showReady) return null;

  const dismissReady = () => {
    setDismissed(true);
    try { localStorage.removeItem(READY_NUDGE_KEY); } catch {}
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 w-full max-w-md pointer-events-none">
      {isCalculating ? (
        <div
          className="pointer-events-auto mx-auto w-fit flex items-center gap-2.5 rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/20 pl-3.5 pr-4 py-2"
          data-testid="scoring-status-calculating"
        >
          <Loader2 className="h-4 w-4 animate-spin text-indigo-300 shrink-0" />
          <span className="text-sm font-medium">Calculating your Web of Trust…</span>
        </div>
      ) : (
        <div
          className="pointer-events-auto mx-auto flex items-center gap-2 rounded-full bg-white border border-emerald-200 shadow-lg shadow-slate-900/10 pl-3 pr-2 py-1.5"
          data-testid="scoring-status-ready"
        >
          <span className="h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </span>
          <span className="text-sm font-semibold text-slate-900">Your Web of Trust is ready</span>
          <button
            type="button"
            onClick={() => { dismissReady(); navigate("/"); }}
            className="inline-flex items-center gap-1 rounded-full bg-[#3730a3] hover:bg-[#312e81] text-white text-xs font-semibold px-3 py-1.5 transition-colors"
            data-testid="scoring-status-view"
          >
            See your results <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={dismissReady}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            data-testid="scoring-status-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
