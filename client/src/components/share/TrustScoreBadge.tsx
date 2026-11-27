import { DEFAULT_VERIFIED_LINE, TIER_THRESHOLDS, TIER_LABELS, TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { rungFor, type Granularity } from "@/lib/trustLadder";

/**
 * The tier a 0–1 influence score (the house / Web-of-Trust perspective from the
 * network) falls in, for the public share surfaces. Tier bands match
 * `trustThreshold.ts`.
 */

// Fixed public-page bands. The low bound is the DEFAULT line, not the viewer's
// preset: this badge is handed a bare house score with no observer context (see
// DEFAULT_VERIFIED_LINE), and the viewer is usually anonymous anyway.
// Colors come from the shared TRUST_TIER_COLORS palette (services/trustThreshold)
// so this bar and the dashboard's Network Composition never drift.
const SHARE_TIERS = [
  {
    key: "high",
    name: TIER_LABELS.high,
    min: TIER_THRESHOLDS.high,
    color: TRUST_TIER_COLORS.highlyTrusted,
    text: "text-emerald-700",
    ring: TRUST_TIER_COLORS.highlyTrusted,
  },
  {
    key: "trusted",
    name: TIER_LABELS.trusted,
    min: TIER_THRESHOLDS.medium_high,
    color: TRUST_TIER_COLORS.trusted,
    text: "text-sky-700",
    ring: TRUST_TIER_COLORS.trusted,
  },
  {
    key: "neutral",
    name: TIER_LABELS.neutral,
    min: TIER_THRESHOLDS.medium,
    color: TRUST_TIER_COLORS.neutral,
    text: "text-brand-primary",
    ring: TRUST_TIER_COLORS.neutral,
  },
  {
    key: "low",
    name: TIER_LABELS.low,
    min: DEFAULT_VERIFIED_LINE,
    color: TRUST_TIER_COLORS.lowTrust,
    text: "text-amber-700",
    ring: TRUST_TIER_COLORS.lowTrust,
  },
  {
    key: "unverified",
    name: TIER_LABELS.unverified,
    min: 0,
    color: TRUST_TIER_COLORS.unverified,
    text: "text-zinc-600",
    ring: TRUST_TIER_COLORS.unverified,
  },
];

export function tierForScore(score01: number) {
  return SHARE_TIERS.find((t) => score01 >= t.min) ?? SHARE_TIERS[SHARE_TIERS.length - 1];
}

/**
 * The same shape as `tierForScore`, but on the viewer's ladder: under Simple it
 * is the bucket (Verified / Unknown / Flagged) from lib/trustLadder, under
 * Detailed it is the five-tier band. Every surface that shows a tier WORD to a
 * person should read this, not `tierForScore` — that one stays for analysis
 * that genuinely needs the five bands (the hops weak-link rule).
 */
export function shareTierFor(score01: number, granularity: Granularity, flagged = false) {
  if (granularity === "detailed" && !flagged) return tierForScore(score01);
  const r = rungFor(score01, flagged, granularity);
  const text = r.key === "flagged" ? "text-red-600" : r.key === "unknown" ? "text-zinc-600" : "text-sky-700";
  return { key: r.key, name: r.label, min: 0, color: r.color, text, ring: r.color };
}
