import { ShieldCheck } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { tierForScore } from "@/components/share/TrustScoreBadge";

/**
 * The Web-of-Trust card — a LinkedIn-style segmented "strength" meter driven by
 * a 0–1 trust score, with the tier + number. Shared by the public share page
 * (/p) and the in-app profile so both feel like one product.
 *
 * The meter shows the PRIMARY score. When `secondaryScore01` is provided AND
 * differs from the primary (after rounding), a muted second line shows the other
 * POV with a trend arrow + the gap — e.g. "/p" leads with the network score and
 * adds "To you · …"; "/profile" leads with your score and adds "Network · …".
 * `score01 === null` renders a graceful "not yet scored" state.
 */
export function WotStrengthCard({
  score01,
  secondaryScore01 = null,
  secondaryLabel = "",
  className = "",
}: {
  score01: number | null;
  secondaryScore01?: number | null;
  secondaryLabel?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${className}`} data-testid="wot-strength-card">
      <div className="flex items-center gap-1.5 mb-2">
        <BrainLogo size={15} className="text-indigo-500" />
        <span className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Web of Trust</span>
      </div>
      {score01 != null ? (() => {
        const tier = tierForScore(score01);
        const pct = Math.round(score01 * 100);
        const SEGMENTS = 5;
        const filled = Math.max(1, Math.round((pct / 100) * SEGMENTS));
        // Secondary (other-POV) score — shown only when it differs from primary.
        const secPct = secondaryScore01 != null ? Math.round(secondaryScore01 * 100) : null;
        const showSecondary = secPct != null && secPct !== pct && secondaryScore01 != null;
        return (
          <>
            <div className="flex items-center gap-1 mb-2">
              {Array.from({ length: SEGMENTS }).map((_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i < filled ? tier.color : "#e2e8f0" }} />
              ))}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: tier.color }} />
              <span className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{pct}</span>
            </div>
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
          <div className="flex items-center gap-1 mb-2.5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-1.5 flex-1 rounded-full bg-slate-100" />)}
          </div>
          <p className="text-xs text-slate-400">Not yet scored by the network.</p>
        </>
      )}
    </div>
  );
}
