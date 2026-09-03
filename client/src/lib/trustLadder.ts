import { DEFAULT_VERIFIED_LINE, TIER_LABELS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { tierForScore01, type VerificationTier } from "@/lib/verificationTier";

/**
 * The trust ladder, at the granularity the viewer chose.
 *
 * Decided in docs/trust-tiers/DECISIONS.md: the five backend tiers stay exactly
 * as computed, but the DEFAULT reading of them is three buckets — verified /
 * unknown / flagged — because "what am I going to do with someone who's
 * verified but not highly verified?" A viewer can switch to the detailed
 * six-rung ladder (five tiers + Flagged) in Settings.
 *
 * Everything that draws trust reads a rung from here: the coin, the rings, the
 * word chips, the pips, the share badge, the composition charts, the tier
 * filters. One module, so "simple" and "detailed" can never disagree about
 * what a score means.
 */
export type Granularity = "simple" | "detailed";
export type Bucket = "verified" | "unknown" | "flagged";
/** A rung's glyph, named so this module stays icon-library-free. */
export type Glyph = "check" | "question" | "flag" | "none";

export interface Rung {
  /** Stable key: a bucket under Simple, a tier (or "flagged") under Detailed. */
  key: Bucket | VerificationTier;
  label: string;
  color: string;
  glyph: Glyph;
  /** 1-based position from the bottom; `total` is the ladder's length. */
  rung: number;
  total: number;
  /** Whether ink on this color must be dark to clear WCAG AA (computed in
   *  VerificationCoin's contrast table; carried here so every surface agrees). */
  darkText: boolean;
}

/**
 * Decision 1: Verified is at or above the verified line; Unknown is everything
 * below it, including brand-new accounts; Flagged wins over both. The line is
 * the DEFAULT preset's — surfaces that have a backend `verified`/`tier` verdict
 * should prefer it, exactly as they do for the five-tier reading.
 */
export function bucketFor(score01: number | null | undefined, flagged: boolean): Bucket {
  if (flagged) return "flagged";
  if (typeof score01 !== "number" || !Number.isFinite(score01)) return "unknown";
  return score01 >= DEFAULT_VERIFIED_LINE ? "verified" : "unknown";
}

// Decision 4: three existing constants, no new hues. Aurora Cyan reads as the
// brand's blue; the grey is visibly "not a verdict"; red is what the flag
// banner already uses. Decision 3: the names.
const SIMPLE: Record<Bucket, Omit<Rung, "rung" | "total">> = {
  flagged: { key: "flagged", label: "Flagged", color: TRUST_TIER_COLORS.flagged, glyph: "flag", darkText: false },
  unknown: { key: "unknown", label: "Unknown", color: TRUST_TIER_COLORS.unverified, glyph: "question", darkText: true },
  verified: { key: "verified", label: "Verified", color: TRUST_TIER_COLORS.trusted, glyph: "check", darkText: true },
};
const SIMPLE_ORDER: Bucket[] = ["flagged", "unknown", "verified"];

/** Unknown's one-line explainer (decision 3), for tooltips and hover cards. */
export const UNKNOWN_EXPLAINER = "No one in your network has vouched for this account yet.";

// Detailed keeps today's ladder, with Flagged as the rung below it all.
const DETAILED_TIER_COLOR: Record<VerificationTier, string> = {
  high: TRUST_TIER_COLORS.highlyTrusted,
  trusted: TRUST_TIER_COLORS.trusted,
  neutral: TRUST_TIER_COLORS.neutral,
  low: TRUST_TIER_COLORS.lowTrust,
  unverified: TRUST_TIER_COLORS.unverified,
};
const DETAILED_DARK_TEXT = new Set<VerificationTier>(["trusted", "low", "unverified"]);
const DETAILED_ORDER: (VerificationTier | "flagged")[] = ["flagged", "unverified", "low", "neutral", "trusted", "high"];

/** The active ladder, bottom rung first. For charts, filters and legends. */
export function ladderFor(granularity: Granularity): Rung[] {
  if (granularity === "simple") {
    return SIMPLE_ORDER.map((b, i) => ({ ...SIMPLE[b], rung: i + 1, total: SIMPLE_ORDER.length }));
  }
  return DETAILED_ORDER.map((k, i) =>
    k === "flagged"
      ? { ...SIMPLE.flagged, rung: i + 1, total: DETAILED_ORDER.length }
      : {
          key: k,
          label: TIER_LABELS[k],
          color: DETAILED_TIER_COLOR[k],
          glyph: "none" as Glyph,
          darkText: DETAILED_DARK_TEXT.has(k),
          rung: i + 1,
          total: DETAILED_ORDER.length,
        },
  );
}

/** The rung a score (and flag) lands on, at the given granularity. */
export function rungFor(score01: number | null | undefined, flagged: boolean, granularity: Granularity): Rung {
  const ladder = ladderFor(granularity);
  if (granularity === "simple") {
    const b = bucketFor(score01, flagged);
    return ladder.find((r) => r.key === b)!;
  }
  if (flagged) return ladder[0];
  const clamped = Math.max(0, Math.min(1, typeof score01 === "number" && Number.isFinite(score01) ? score01 : 0));
  const tier = tierForScore01(clamped);
  return ladder.find((r) => r.key === tier)!;
}

/** `rung / total`, 0..1 — for pips, arcs and bars that show position on the ladder. */
export function rungFraction(score01: number | null | undefined, flagged: boolean, granularity: Granularity): number {
  const r = rungFor(score01, flagged, granularity);
  return r.rung / r.total;
}
