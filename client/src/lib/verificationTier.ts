import { DEFAULT_VERIFIED_LINE, TIER_THRESHOLDS } from "@/services/trustThreshold";

export type VerificationTier = "high" | "trusted" | "neutral" | "low" | "unverified";

/**
 * Callers here are handed a bare score with no observer context (note cards,
 * search rows, OG images), so the low/unverified boundary is the DEFAULT line
 * rather than the viewer's preset. Surfaces that DO have a backend response
 * render its `tier` instead.
 */
export function tierForScore01(score01: number): VerificationTier {
  if (score01 >= TIER_THRESHOLDS.high) return "high";
  if (score01 >= TIER_THRESHOLDS.medium_high) return "trusted";
  if (score01 >= TIER_THRESHOLDS.medium) return "neutral";
  if (score01 >= DEFAULT_VERIFIED_LINE) return "low";
  return "unverified";
}
