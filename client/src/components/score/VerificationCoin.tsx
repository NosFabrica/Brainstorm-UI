import { TIER_THRESHOLDS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
import type { ScorePov } from "@/components/score/TrustScorePov";

/**
 * VerificationCoin — the sitewide, label-less Verification Score badge.
 *
 * A single round number-coin whose styling alone conveys three things (team
 * design decisions):
 *   1. that it IS a verification score  → the consistent coin shape + placement
 *   2. personalized vs global           → SATURATION: personalized = colored,
 *      global = flat grey (never boundary — unreadable at small sizes)
 *   3. tier                             → the NUMBER always (0–100), reinforced
 *      by HUE in the personalized (colored) view
 *
 * Deliberately unlabeled: the name "Verification Score" lives only in the
 * explainer/modal, never on the coin. Reused everywhere (profile avatar corner,
 * search rows, note cards, lists) so it's recognizable by shape alone.
 */

export type VerificationTier = "high" | "trusted" | "neutral" | "low" | "unverified";

export function tierForScore01(score01: number): VerificationTier {
  if (score01 >= TIER_THRESHOLDS.high) return "high";
  if (score01 >= TIER_THRESHOLDS.medium_high) return "trusted";
  if (score01 >= TIER_THRESHOLDS.medium) return "neutral";
  if (score01 >= 0.02) return "low";
  return "unverified";
}

// Personalized flavor: solid tier hue, white number. The lowest tier stays
// gently COLORED (indigo-tinted), never pure grey — grey is reserved for global,
// so the two flavors never collide at the bottom of the scale.
const PERSONALIZED_FILL: Record<VerificationTier, string> = {
  high: TRUST_TIER_COLORS.highlyTrusted, // emerald
  trusted: TRUST_TIER_COLORS.trusted, // sky
  neutral: TRUST_TIER_COLORS.neutral, // indigo
  low: "#d97706", // amber-600 — darker than the shared bar amber for white-text contrast on the coin
  unverified: "#c7d2fe", // indigo-200 — colored, not grey
};

// Global flavor: one neutral slate for every tier; the number carries the tier.
const GLOBAL_FILL = "#64748b"; // slate-500

// Fills light enough to need dark text instead of white.
const DARK_TEXT_FILLS = new Set<string>(["#c7d2fe"]);

export function VerificationCoin({
  score01,
  pov,
  size = 44,
  onClick,
  className = "",
  ring = true,
}: {
  /** Influence 0–1 (backend scale); rendered as 0–100. Null → unrated ("—"). */
  score01: number | null | undefined;
  pov: ScorePov;
  size?: number;
  onClick?: () => void;
  className?: string;
  /** Thin white ring to lift the coin off an avatar/background. */
  ring?: boolean;
}) {
  const hasScore = typeof score01 === "number" && Number.isFinite(score01);
  const clamped = hasScore ? Math.max(0, Math.min(1, score01 as number)) : 0;
  const tier = tierForScore01(clamped);
  const pct = Math.round(clamped * 100);

  const fill = !hasScore ? "#e2e8f0" : pov === "personalized" ? PERSONALIZED_FILL[tier] : GLOBAL_FILL;
  const darkText = !hasScore || DARK_TEXT_FILLS.has(fill);

  const povLabel = pov === "personalized" ? "personalized" : "global";
  const label = hasScore
    ? `Verification score ${pct} out of 100, ${povLabel} view`
    : `Unrated, ${povLabel} view`;

  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full font-bold leading-none tabular-nums shadow-sm ${ring ? "ring-2 ring-white" : ""} ${onClick ? "transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: fill,
        color: darkText ? "#1e293b" : "#ffffff",
        fontFamily: "var(--font-display)",
        fontSize: Math.round(size * 0.4),
      }}
      data-testid="verification-coin"
      data-pov={pov}
      data-tier={tier}
    >
      {hasScore ? pct : "—"}
    </Comp>
  );
}
