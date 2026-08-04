import { TIER_THRESHOLDS } from "@/services/trustThreshold";

export type VerificationTier = "high" | "trusted" | "neutral" | "low" | "unverified";

export function tierForScore01(score01: number): VerificationTier {
  if (score01 >= TIER_THRESHOLDS.high) return "high";
  if (score01 >= TIER_THRESHOLDS.medium_high) return "trusted";
  if (score01 >= TIER_THRESHOLDS.medium) return "neutral";
  if (score01 >= 0.02) return "low";
  return "unverified";
}
