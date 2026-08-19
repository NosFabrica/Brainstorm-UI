import { DEFAULT_VERIFIED_LINE, TIER_THRESHOLDS, TIER_LABELS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { useScoreDisplayMode, type ScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import type { ScorePov } from "@/components/score/TrustScorePov";

/**
 * VerificationCoin — the sitewide, label-less Verification Score badge.
 *
 * Two facts, two channels, deliberately not sharing one:
 *   1. TIER  → the NUMBER (0–100), reinforced by the FILL hue
 *   2. POINT OF VIEW → the RING around it
 *
 * ## Why they are separate channels
 *
 * Originally hue carried both: personalized coins were tier-coloured, global
 * coins were flat grey. In personalized view hue meant tier; in global view hue
 * meant POV and tier was left to the number alone. Switching views silently
 * changed what colour was telling you.
 *
 * That produced a real misread — a teammate read grey as "this account scores
 * badly", because in global view a 95 and a 12 were the same colour. Grey also
 * did double duty for "no score at all", so two different greys sat side by side
 * in one list.
 *
 * Hue therefore became tier-only. But the team then asked, correctly, for the
 * score to say whose view it is — that is the whole product. So POV came back on
 * its own channel instead of taking the fill's: tier is per-item data, POV is
 * page state identical for every coin on screen, and each now has somewhere to
 * live. `pov` also still reaches the accessible label, as it always did.
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

/**
 * The tier as a POSITION on the five-step ladder, for level mode's pips.
 * Derived from the tier and only the tier — deriving pips from score01 would
 * be the number in costume, which is the one thing DECISIONS.md forbids.
 */
export const TIER_STEP: Record<VerificationTier, number> = {
  unverified: 1,
  low: 2,
  neutral: 3,
  trusted: 4,
  high: 5,
};

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

/**
 * The point-of-view ring.
 *
 * Drawn as a two-step box-shadow rather than a plain `ring-*`, because a single
 * ring in the brand purple would be INVISIBLE on a `high` coin — Aurora Purple
 * is both `brand-primary` and the top tier's fill. The inner step is the page
 * surface, so there is always a gap separating fill from ring whatever the tier
 * underneath.
 *
 * It replaces the old `ring-2 ring-white` lift rather than stacking on it, so
 * the coin grows by 2px, not 4 — this renders at 20–24px in lists and the
 * budget is tight.
 *
 * Tailwind classes rather than an inline style, because the separator has to
 * follow the page surface into dark mode and an inline `boxShadow` cannot carry
 * a `dark:` variant.
 */
const POV_RING: Record<ScorePov, string> = {
  // Aurora Purple (#7237ff) — "yours". Same hue as brand-primary and the `high`
  // tier fill, which is exactly why the white/slate separator step exists.
  personalized:
    "shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#7237ff] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_4px_#7237ff]",
  // slate-300 / slate-600 — the neutral everyone's-view outline, lifted in dark
  // mode so it doesn't vanish into the card.
  global:
    "shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#cbd5e1] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_4px_#475569]",
};

/**
 * Tier mode's ring around the profile picture itself — the user's preferred
 * expression of "words and color only": no floating indicator, the color rides
 * the avatar (a pattern people already read from story rings).
 *
 * Deliberately NOT the POV ring's silhouette. That ring is thin and floats 2px
 * off the coin (2px surface gap + 2px color); this one hugs the photo with a
 * 2px gap and a 3px band, so the two devices never read as each other even
 * though both are circles of color. Class strings are static per tier because
 * Tailwind's JIT needs literals, and inline box-shadow can't carry `dark:`.
 */
const TIER_AVATAR_RING: Record<VerificationTier, string> = {
  high: "shadow-[0_0_0_2px_#ffffff,0_0_0_5px_#7237ff] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_5px_#7237ff]",
  trusted: "shadow-[0_0_0_2px_#ffffff,0_0_0_5px_#13d2e5] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_5px_#13d2e5]",
  neutral: "shadow-[0_0_0_2px_#ffffff,0_0_0_5px_#665487] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_5px_#665487]",
  low: "shadow-[0_0_0_2px_#ffffff,0_0_0_5px_#f59e0b] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_5px_#f59e0b]",
  unverified: "shadow-[0_0_0_2px_#ffffff,0_0_0_5px_#8c929e] dark:shadow-[0_0_0_2px_#0f172a,0_0_0_5px_#8c929e]",
};

/**
 * Call-site helper for the avatar ring. Returns the ring's class for the given
 * score ONLY in tier mode (null otherwise, and null for unrated — no ring is
 * the unrated state, like absence of fill is on the coin).
 *
 * The contract at every call site is the same pair of moves:
 *   const tierRing = useTierRing();
 *   const ring = tierRing(score01);
 *   <Avatar className={ring ?? ""} />           // ring the photo
 *   <VerificationCoin className={ring ? "sr-only" : "…"} />  // hide the coin
 * The coin goes `sr-only` rather than unmounted so its aria-label (the tier
 * word) and any onClick (the explainer modal) survive the visual swap.
 */
export function useTierRing(): (score01: number | null | undefined) => string | null {
  const [mode] = useScoreDisplayMode();
  return (score01) => {
    if (mode !== "tier") return null;
    if (typeof score01 !== "number" || !Number.isFinite(score01)) return null;
    return TIER_AVATAR_RING[tierForScore01(Math.max(0, Math.min(1, score01)))];
  };
}

export function VerificationCoin({
  score01,
  pov,
  size = 44,
  onClick,
  className = "",
  ring = true,
  mode,
}: {
  /** Influence 0–1 (backend scale); rendered as 0–100. Null → unrated ("—"). */
  score01: number | null | undefined;
  /** Whose view this number came from — drives the ring, and the aria-label. */
  pov: ScorePov;
  size?: number;
  onClick?: () => void;
  className?: string;
  /**
   * Draw the point-of-view ring. On by default.
   *
   * Off only where the surrounding UI already states the perspective and a ring
   * would repeat it — the compare-both rows inside `TrustScoreModal`, where each
   * option is labelled "Personalized" / "Global" in text beside the coin.
   */
  ring?: boolean;
  /**
   * Display-mode override. Leave unset to follow the viewer's setting — the
   * normal case. Pass explicitly only where a React hook can't reach the live
   * setting or the render is frozen at generation time (the OG share card).
   */
  mode?: ScoreDisplayMode;
}) {
  const [viewerMode] = useScoreDisplayMode();
  const displayMode = mode ?? viewerMode;
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
  // The accessible label ALWAYS carries the tier word; the value rides along
  // only in number mode. Someone who turned digits off has turned them off for
  // their screen reader too — leaking the number through aria would make the
  // setting cosmetic.
  const label = hasScore
    ? displayMode === "number"
      ? `Verification score ${pct} out of 100 (${TIER_LABELS[tier]}), ${povLabel} view`
      : `Verification: ${TIER_LABELS[tier]}, ${povLabel} view`
    : `Unrated, ${povLabel} view`;

  // Without a digit to hold, the coin doesn't keep the digit's footprint —
  // a full-size disc with nothing in it reads as a blob next to the avatar.
  // `size` stays the caller's layout budget; non-number modes render inside it:
  // tier as a compact status dot, level as a slim pill hugging its five pips.
  const pipCount = TIER_STEP[tier];
  const dotSize = Math.max(12, Math.round(size * 0.55));
  const pillH = Math.max(12, Math.round(size * 0.44));
  const pipSize = Math.max(3, Math.round(pillH * 0.26));
  const pipGap = Math.max(2, Math.round(pillH * 0.15));
  const pillPadX = Math.round(pillH * 0.32);
  const compact = hasScore && displayMode !== "number";
  const frame =
    !compact
      ? { width: size, height: size }
      : displayMode === "tier"
        ? { width: dotSize, height: dotSize }
        : { height: pillH, paddingLeft: pillPadX, paddingRight: pillPadX };

  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full font-bold leading-none tabular-nums ${hasScore ? "" : "border-2 border-dashed border-slate-300 dark:border-slate-600"} ${ring && hasScore ? POV_RING[pov] : ""} ${onClick ? "transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary" : ""} ${className}`}
      style={{
        ...frame,
        backgroundColor: fill,
        color: hasScore ? (darkText ? "#1e293b" : "#ffffff") : "#94a3b8",
        fontFamily: "var(--font-display)",
        fontSize: Math.round(size * 0.4),
      }}
      data-testid="verification-coin"
      data-pov={pov}
      data-tier={hasScore ? tier : "unrated"}
      data-display={displayMode}
      // Whether the perspective ring is actually drawn — `pov` alone doesn't say,
      // since an unrated coin and a `ring={false}` coin both suppress it.
      data-pov-ring={ring && hasScore ? pov : "none"}
    >
      {!hasScore ? (
        "—"
      ) : displayMode === "number" ? (
        pct
      ) : displayMode === "level" ? (
        <span
          className="inline-flex items-center"
          style={{ gap: pipGap }}
          data-testid="coin-pips"
          aria-hidden
        >
          {[1, 2, 3, 4, 5].map((step) => (
            <span
              key={step}
              className="rounded-full"
              style={{
                width: pipSize,
                height: pipSize,
                backgroundColor: "currentColor",
                opacity: step <= pipCount ? 1 : 0.3,
              }}
            />
          ))}
        </span>
      ) : null}
    </Comp>
  );
}
