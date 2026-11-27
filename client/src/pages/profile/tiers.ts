/**
 * How the analytics profile reads tier counts: the backend's GrapeRank buckets
 * folded onto the five display slices, the follower-quality bar's colours, a
 * section's tier badges (or Verified / Unknown under Simple), and the
 * confidence banner for a score.
 */
import type { Granularity } from "@/lib/trustLadder";
import { TIER_LABELS } from "@/services/trustThreshold";
import { GR_TIER_TO_UI } from "./connectionModel";

// Collapse backend tier_counts onto the FE display keys via the same
// GR_TIER_TO_UI map that names a single row's tier, so a bucket count and a
// row badge can't land in different slices. Slices still sum to `total`.
export function grTierCountsToUI(tc: Record<string, number> | null | undefined): Record<string, number> {
  const counts: Record<string, number> = { high: 0, trusted: 0, neutral: 0, low: 0, unverified: 0 };
  for (const [grTier, uiKey] of Object.entries(GR_TIER_TO_UI)) {
    counts[uiKey] += tc?.[grTier] ?? 0;
  }
  return counts;
}

// Brand-aligned trust ramp (mirrors TRUST_TIER_COLORS): Aurora Purple → Cyan
// for the top tiers, muted violet for neutral, amber (semantic caution) for
// low, brand grey for unverified.
//
// No `min` here: the line moves with the preset, so a subject's bucket is
// read off the backend `tier` rather than rederived from a number.
export const TIER_DISPLAY_CONFIG = [
  {
    key: "high",
    name: TIER_LABELS.high,
    color: "#7237ff",
    bg: "bg-brand-primary/10 dark:bg-brand-primary/10",
    text: "text-brand-primary dark:text-brand-link",
    border: "border-brand-primary/20 dark:border-brand-primary/25",
    ring: "stroke-brand-primary",
  },
  {
    key: "trusted",
    name: TIER_LABELS.trusted,
    color: "#13d2e5",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200 dark:border-cyan-500/25",
    ring: "stroke-cyan-500",
  },
  {
    key: "neutral",
    name: "Neutral",
    color: "#665487",
    bg: "bg-[#665487]/10 dark:bg-[#665487]/20",
    text: "text-[#665487] dark:text-brand-link",
    border: "border-[#665487]/30 dark:border-[#665487]/50",
    ring: "stroke-[#665487]",
  },
  {
    key: "low",
    name: TIER_LABELS.low,
    color: "#f59e0b",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-500/25",
    ring: "stroke-amber-400",
  },
  {
    key: "unverified",
    name: "Unverified",
    color: "#8c929e",
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-500 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-800",
    ring: "stroke-slate-400",
  },
];

export interface TierBadgeRow {
  tier: string;
  count: number;
  color: string;
}

/** A section's tier badges from its display-slice counts; Simple shows Verified / Unknown only. */
export function tierBreakdownRows(counts: Record<string, number>, granularity: Granularity): TierBadgeRow[] {
  const tierDefs: { tier: string; label: string; color: string }[] = [
    { tier: "high", label: TIER_LABELS.high, color: "text-emerald-600" },
    { tier: "trusted", label: TIER_LABELS.trusted, color: "text-sky-500" },
    { tier: "neutral", label: "Neutral", color: "text-brand-link" },
    { tier: "low", label: "Low", color: "text-amber-500" },
    { tier: "unverified", label: "Unverified", color: "text-zinc-400" },
  ];
  const rows = tierDefs
    .filter((t) => counts[t.tier] > 0)
    .map((t) => ({ tier: t.label, count: counts[t.tier], color: t.color }));
  if (granularity !== "simple") return rows;
  const verified = tierDefs.filter((t) => t.tier !== "unverified").reduce((a, t) => a + (counts[t.tier] ?? 0), 0);
  const unknown = counts.unverified ?? 0;
  return [
    { tier: "Verified", count: verified, color: "text-cyan-600" },
    { tier: "Unknown", count: unknown, color: "text-zinc-400" },
  ].filter((r) => r.count > 0);
}

/** The banner under the identity for a personalized score (0..1) of the person named. */
export function confidenceGuidanceFor(score: number, name: string) {
  const pct = Math.round(score * 100);
  if (pct >= 50)
    return {
      label: "High confidence",
      color: "text-emerald-700 dark:text-emerald-300",
      iconColor: "text-emerald-500 dark:text-emerald-400",
      iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
      bg: "bg-gradient-to-r from-emerald-50/90 via-emerald-50/60 to-white/40 dark:bg-none dark:bg-emerald-500/10",
      border: "border-emerald-200/60 dark:border-emerald-500/25",
      message: `Strong trust signals from your community for ${name}.`,
      pct,
      icon: "check" as const,
    };
  if (pct >= 20)
    return {
      label: "Moderate confidence",
      color: "text-brand-primary dark:text-brand-link",
      iconColor: "text-brand-primary dark:text-brand-link",
      iconBg: "bg-brand-primary/15 dark:bg-brand-primary/15",
      bg: "bg-gradient-to-r from-brand-primary/10 via-brand-primary/10 to-white/40 dark:bg-none dark:bg-brand-primary/10",
      border: "border-brand-primary/20 dark:border-brand-primary/25",
      message: `Some trust signals present. Your network has limited data on ${name}.`,
      pct,
      icon: "shield" as const,
    };
  if (pct >= 7)
    return {
      label: "Low confidence",
      color: "text-slate-600 dark:text-slate-300",
      iconColor: "text-slate-400 dark:text-slate-500",
      iconBg: "bg-slate-100 dark:bg-slate-800",
      bg: "bg-gradient-to-r from-slate-50/90 via-slate-50/60 to-white/40 dark:bg-none dark:bg-slate-800/50",
      border: "border-slate-200/60 dark:border-slate-800/60",
      message: `Weak or mixed signals from your trusted community for ${name}.`,
      pct,
      icon: "alert" as const,
    };
  return {
    label: "Very low confidence",
    color: "text-amber-700 dark:text-amber-300",
    iconColor: "text-amber-500 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-500/15",
    bg: "bg-gradient-to-r from-amber-50/90 via-amber-50/60 to-white/40 dark:bg-none dark:bg-amber-500/10",
    border: "border-amber-200/60 dark:border-amber-500/25",
    message: `Your community's signals suggest careful scrutiny before trusting ${name}.`,
    pct,
    icon: "x" as const,
  };
}
