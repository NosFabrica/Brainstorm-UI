import { UserRound, Globe, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useActivePov } from "@/hooks/useActivePov";
import { hasSessionToken } from "@/services/api";
import { VerificationCoin } from "@/components/score/VerificationCoin";

/**
 * The sitewide "whose view is this score?" system (team feedback):
 *  - personalized ("For you")  — the viewer's own trust graph. Styled warm/indigo,
 *    the inviting premium view.
 *  - global ("Everyone")       — Brainstorm's network-wide (house) view. Neutral.
 * Icon + fill together (never color alone) so the distinction is recognizable at
 * a glance. Tier colors (green/amber/…) stay on the NUMBER; POV styles the
 * CONTAINER — two independent visual channels.
 *
 * One source of truth: the existing `useActivePov` store ("mywot"/"nosfabrica"),
 * shared with the account-menu "Trust perspective" switcher. The shared
 * TrustScoreModal explains the score, states the current view, and holds the
 * toggle — every score surface opens the same modal.
 */
export type ScorePov = "personalized" | "global";

/** Effective POV for score display: personalized only when signed in AND the store says "mywot". */
export function useScorePov(): { pov: ScorePov; loggedIn: boolean; setPersonalized: (on: boolean) => void } {
  const [activePov, setActivePov] = useActivePov();
  const loggedIn = hasSessionToken();
  const pov: ScorePov = loggedIn && activePov === "mywot" ? "personalized" : "global";
  return { pov, loggedIn, setPersonalized: (on) => setActivePov(on ? "mywot" : "nosfabrica") };
}

/** Container chrome for a score chip/card. Personalized = soft indigo fill; global = neutral outline. */
export function povChrome(pov: ScorePov): string {
  return pov === "personalized"
    ? "border-indigo-200 bg-indigo-50/60"
    : "border-slate-200 bg-white";
}

export function PovIcon({ pov, className = "h-3 w-3" }: { pov: ScorePov; className?: string }) {
  return pov === "personalized" ? (
    <UserRound className={`${className} text-indigo-500`} />
  ) : (
    <Globe className={`${className} text-slate-400`} />
  );
}

/** Tiny inline tag naming the view — pairs the icon with a one-word label. */
export function PovTag({ pov }: { pov: ScorePov }) {
  return pov === "personalized" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100/80 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600" data-testid="pov-tag">
      <UserRound className="h-2.5 w-2.5" /> Personalized
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500" data-testid="pov-tag">
      <Globe className="h-2.5 w-2.5" /> Global
    </span>
  );
}

/**
 * The shared Verification Score explainer + view switcher. Three jobs (per team
 * feedback): explain what the score means, state whose view is shown NOW, and
 * toggle personalized ↔ global (app-wide, via the shared store). When a surface
 * can't serve both views, pass `unsupportedNote` — the toggle hides and an
 * honest amber note shows instead. Logged out, personalized is a locked
 * sign-in prompt (soft conversion).
 */
export function TrustScoreModal({
  open,
  onOpenChange,
  unsupportedNote,
  scores,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  unsupportedNote?: string;
  /**
   * This profile's score (0–1 influence) in each view, for the compare-both
   * display. Optional — omitted on surfaces that just explain/toggle. A coin
   * renders beside each option so the two perspectives sit side by side.
   */
  scores?: { personalized: number | null; global: number | null };
}) {
  const { pov, loggedIn, setPersonalized } = useScorePov();

  const option = (target: ScorePov) => {
    const active = pov === target;
    const locked = target === "personalized" && !loggedIn;
    const base = "w-full rounded-xl border p-3 text-left transition-colors";
    const cls = active
      ? target === "personalized"
        ? `${base} border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200`
        : `${base} border-slate-300 bg-slate-50 ring-1 ring-slate-200`
      : `${base} border-slate-200 bg-white hover:bg-slate-50`;
    return { cls, active, locked };
  };
  const p = option("personalized");
  const g = option("global");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="trust-score-modal">
        <DialogHeader>
          <DialogTitle>Verification Score</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            A Verification Score (0–100) measures how verified an account is, based on real
            people's follows, mutes and reports — not an algorithm. The same account can score
            differently depending on <span className="font-semibold text-slate-700">whose network</span>{" "}
            you look through.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* Personalized */}
          {p.locked ? (
            <Link
              href="/login"
              className={`${p.cls} flex items-start gap-2.5 opacity-90`}
              data-testid="pov-option-personalized-locked"
            >
              <Lock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <UserRound className="h-3.5 w-3.5 text-indigo-500" /> Personalized — for you
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 leading-relaxed">
                  Scores through <span className="font-medium">your own</span> network. Sign in free to unlock it{" "}
                  <ArrowRight className="inline h-3 w-3" />
                </span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setPersonalized(true)}
              disabled={!!unsupportedNote}
              className={`${p.cls} flex items-start gap-2.5 disabled:opacity-60`}
              data-testid="pov-option-personalized"
            >
              <UserRound className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  Personalized — for you
                  {p.active && <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Current view</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 leading-relaxed">
                  Seen through <span className="font-medium">your own</span> network — the people you trust, and who they trust.
                </span>
              </span>
              {scores && (
                <VerificationCoin score01={scores.personalized} pov="personalized" size={34} ring={false} className="shrink-0 self-center" />
              )}
            </button>
          )}

          {/* Global */}
          <button
            type="button"
            onClick={() => setPersonalized(false)}
            disabled={!!unsupportedNote}
            className={`${g.cls} flex items-start gap-2.5 disabled:opacity-60`}
            data-testid="pov-option-global"
          >
            <Globe className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                Global — everyone
                {g.active && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Current view</span>}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 leading-relaxed">
                Brainstorm's network-wide view — the same number every visitor sees.
              </span>
            </span>
            {scores && (
              <VerificationCoin score01={scores.global} pov="global" size={34} ring={false} className="shrink-0 self-center" />
            )}
          </button>
        </div>

        {unsupportedNote && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 leading-relaxed">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {unsupportedNote}
          </p>
        )}

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Switching applies everywhere in Brainstorm until you switch back.
        </p>
      </DialogContent>
    </Dialog>
  );
}
