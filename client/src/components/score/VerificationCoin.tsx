import { DEFAULT_VERIFIED_LINE, TIER_THRESHOLDS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
import type { ScorePov } from "@/components/score/TrustScorePov";

/**
 * VerificationCoin — the sitewide, label-less Verification Score badge.
 *
 * A round number-coin. Its styling conveys two things, and deliberately not a
 * third:
 *   1. that it IS a verification score → the consistent coin shape + placement
 *   2. tier                            → the NUMBER always (0–100), reinforced
 *      by HUE, in every view
 *   3. NOT point of view — see below
 *
 * ## Why POV is no longer on the coin
 *
 * It used to be: personalized coins were tier-coloured and global coins were a
 * flat grey. That put two different meanings on one channel — in personalized
 * view hue meant tier, in global view hue meant POV and tier was carried only
 * by the number. Switching views silently changed what colour was telling you.
 *
 * The cost showed up as a real misread: a teammate reported that grey looked
 * like "this account scores badly", because in global view a 95 and a 12 were
 * the same colour. Grey also did double duty for "no score at all", so two
 * different greys sat next to each other in the same list.
 *
 * So hue is now tier, always. POV is stated ONCE PER SURFACE — by the toggle
 * or tag near the scores — rather than baked into every coin. That's the
 * honest split: tier is per-item data, POV is page state identical for every
 * coin on screen, and a 20px circle should not encode both.
 *
 * `pov` is still taken, and still reaches the accessible label ("…personalized
 * view"), so a screen-reader user gets what sighted users get from the
 * surface-level indicator. It simply has no visual effect.
 *
 * ## Palette
 *
 * Straight from `TRUST_TIER_COLORS`, shared with the dashboard's Network
 * Composition breakdown and the public Web of Trust bar. The coin used to keep
 * a private copy that tinted the bottom tier indigo (`#cbb8ff`) purely to
 * avoid grey, because grey was spoken for. It isn't any more, so the coin
 * rejoins the one ladder and stops being a special case.
 *
 * Deliberately unlabeled: the name "Verification Score" lives only in the
 * explainer/modal, never on the coin. Reused everywhere (profile avatar corner,
 * search rows, note cards, lists) so it's recognizable by shape alone.
 */

export type VerificationTier = "high" | "trusted" | "neutral" | "low" | "unverified";

// The coin is handed a bare score with no observer context (note cards, search
// rows, OG images), so its low/unverified boundary is the DEFAULT line rather
// than the viewer's preset — see DEFAULT_VERIFIED_LINE. Surfaces that DO have a
// backend response render its `tier` instead.
export function tierForScore01(score01: number): VerificationTier {
  if (score01 >= TIER_THRESHOLDS.high) return "high";
  if (score01 >= TIER_THRESHOLDS.medium_high) return "trusted";
  if (score01 >= TIER_THRESHOLDS.medium) return "neutral";
  if (score01 >= DEFAULT_VERIFIED_LINE) return "low";
  return "unverified";
}

const TIER_FILL: Record<VerificationTier, string> = {
  high: TRUST_TIER_COLORS.highlyTrusted, // Aurora Purple
  trusted: TRUST_TIER_COLORS.trusted, // Aurora Cyan
  neutral: TRUST_TIER_COLORS.neutral, // Muted Violet
  low: TRUST_TIER_COLORS.lowTrust, // Amber
  unverified: TRUST_TIER_COLORS.unverified, // Neutral Grey
};

/**
 * Which tiers need dark text, computed from WCAG contrast against each fill
 * rather than chosen by eye:
 *
 *   fill            white   dark
 *   Aurora Purple    5.67   2.58  → white
 *   Aurora Cyan      1.85   7.93  → dark
 *   Muted Violet     6.60   2.22  → white
 *   Amber            2.15   6.81  → dark
 *   Neutral Grey     3.12   4.68  → dark
 *
 * Worth stating why this list grew: the previous version marked only its one
 * light tint, so a "trusted" coin shipped white-on-cyan at **1.85:1** — far
 * under AA. Every combination here now clears 4.5:1.
 */
const DARK_TEXT_TIERS = new Set<VerificationTier>(["trusted", "low", "unverified"]);

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
  /**
   * Whose view this number came from. Reaches the accessible label only — the
   * coin looks identical either way, by design (see the note above).
   */
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

  // No score is drawn as an OUTLINE, not another grey fill. The lowest tier is
  // legitimately grey now, and two greys a shade apart are indistinguishable at
  // the 20–24px this renders at in lists. Absence of fill is a difference in
  // kind, which is what "we have no number for this person" actually is.
  const fill = hasScore ? TIER_FILL[tier] : "transparent";
  const darkText = !hasScore || DARK_TEXT_TIERS.has(tier);

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
      className={`inline-flex items-center justify-center rounded-full font-bold leading-none tabular-nums ${hasScore ? "shadow-sm" : "border-2 border-dashed border-slate-300 dark:border-slate-600"} ${ring && hasScore ? "ring-2 ring-white" : ""} ${onClick ? "transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: fill,
        color: hasScore ? (darkText ? "#1e293b" : "#ffffff") : "#94a3b8",
        fontFamily: "var(--font-display)",
        fontSize: Math.round(size * 0.4),
      }}
      data-testid="verification-coin"
      data-pov={pov}
      data-tier={hasScore ? tier : "unrated"}
    >
      {hasScore ? pct : "—"}
    </Comp>
  );
}
