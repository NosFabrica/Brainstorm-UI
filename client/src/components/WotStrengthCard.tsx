import { useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { TrustScoreModal, PovTag, povChrome, useScorePov } from "@/components/score/TrustScorePov";

/**
 * The Web-of-Trust card — a LinkedIn-style segmented "strength" meter driven by
 * a 0–1 trust score, with the tier + number. Shared by the public share page
 * (/p) and the in-app profile so both feel like one product.
 *
 * The meter shows the PRIMARY score. When `secondaryScore01` is provided AND
 * differs from the primary (after rounding), a muted second line shows the other
 * POV — e.g. "/p" leads with the network score and adds "To you · …"; "/profile"
 * leads with your score and adds "Network · …". In that two-POV state the primary
 * also gets `primaryLabel` (e.g. "Brainstorm" / "To you") so it's unambiguous
 * which POV the big number is. When only one score shows, the primary stays an
 * unlabelled hero. `score01 === null` renders a graceful "not yet scored" state.
 */
export function WotStrengthCard({
  score01,
  secondaryScore01 = null,
  secondaryLabel = "",
  primaryLabel = "",
  className = "",
  footer = null,
}: {
  score01: number | null;
  secondaryScore01?: number | null;
  secondaryLabel?: string;
  primaryLabel?: string;
  className?: string;
  /** Optional action row rendered inside the card, below the score, with a divider. */
  footer?: ReactNode;
}) {
  const { pov } = useScorePov();
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm cursor-pointer transition-colors ${povChrome(pov)} ${className}`}
      data-testid="wot-strength-card"
      role="button"
      tabIndex={0}
      onClick={() => setExplainOpen(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExplainOpen(true); } }}
      title="What does this score mean?"
    >
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span className="inline-flex items-center gap-1.5">
          <BrainLogo size={15} className="text-indigo-500" />
          <span className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Trust Score</span>
        </span>
        <PovTag pov={pov} />
      </div>
      {score01 != null ? (() => {
        const tier = tierForScore(score01);
        const pct = Math.round(score01 * 100);
        // Continuous bar filled to the actual score (dashboard-style) so the bar
        // agrees with the number — 27 fills 27%, not "4 of 5". A small floor keeps
        // very low scores visible as a tier-colored nub rather than nothing.
        const fillPct = Math.min(100, Math.max(4, pct));
        // Secondary (other-POV) score — shown only when it differs from primary.
        const secPct = secondaryScore01 != null ? Math.round(secondaryScore01 * 100) : null;
        const showSecondary = secPct != null && secPct !== pct && secondaryScore01 != null;
        // Only disambiguate the primary POV when a second POV is on screen too.
        const showPrimaryLabel = showSecondary && !!primaryLabel;
        return (
          <>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-2">
              <div className="h-full rounded-full" style={{ width: `${fillPct}%`, backgroundColor: tier.color }} />
            </div>
            {showPrimaryLabel ? (
              <div className="flex items-center justify-between gap-2" data-testid="wot-primary">
                <span className="text-xs font-semibold text-slate-700">{primaryLabel}</span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: tier.color }} />
                  <span className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{pct}</span>
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5" data-testid="wot-primary">
                <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: tier.color }} />
                <span className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">{pct}</span>
              </div>
            )}
            {showSecondary && (() => {
              const secTier = tierForScore(secondaryScore01!);
              return (
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs" data-testid="wot-secondary">
                  <span className="text-slate-500 font-medium">{secondaryLabel}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-semibold" style={{ color: secTier.color }}>{secTier.name}</span>
                    <span className="font-bold text-slate-700 tabular-nums">{secPct}</span>
                  </span>
                </div>
              );
            })()}
          </>
        );
      })() : (
        <>
          <div className="h-1.5 w-full rounded-full bg-slate-100 mb-2.5" />
          <p className="text-xs text-slate-400">Not yet scored by the network.</p>
        </>
      )}
      {footer && (
        /* Actions manage their own clicks — don't let them bubble into the
           card's "open explainer" handler. */
        <div className={`mt-3 pt-3 border-t ${pov === "personalized" ? "border-indigo-100" : "border-slate-100"}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
      <div onClick={(e) => e.stopPropagation()}>
        <TrustScoreModal open={explainOpen} onOpenChange={setExplainOpen} />
      </div>
    </div>
  );
}
