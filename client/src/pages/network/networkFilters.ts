/**
 * The Network page's filters and pager: which group and trust filter a link
 * opens on, the trust filters in the ladder's words and colours, the backend
 * tier a filter asks /connections for, and the window of rows a page shows.
 */
import type { GroupKey } from "@/components/network/networkGroups";
import type { useSelfConnections } from "@/hooks/useSelf";
import { UNKNOWN_EXPLAINER, ladderFor, type Granularity } from "@/lib/trustLadder";

export type TrustTier =
  | "all"
  // Simple-ladder "Verified": every tier at or above the preset's line. Not
  // a backend bucket — it maps to `verified_only`, which the server resolves
  // against the same cutoff, so the list and the header count agree.
  | "verified"
  | "high"
  | "medium"
  | "neutral"
  | "low"
  | "unverified"
  | "flagged";

const LINKABLE_GROUPS: GroupKey[] = [
  "followed_by",
  "following",
  "muted_by",
  "muting",
  "reported_by",
  "reporting",
  "flagged",
];
const LINKABLE_TIERS: TrustTier[] = ["verified", "high", "medium", "neutral", "low", "unverified", "flagged"];

/** The group a `?group=` link opens on; Followers otherwise. */
export function groupFromSearch(search: string): GroupKey {
  const group = new URLSearchParams(search).get("group");
  return group && LINKABLE_GROUPS.includes(group as GroupKey) ? (group as GroupKey) : "followed_by";
}

/** The trust filter a `?trust=` link opens on; All otherwise. */
export function trustFilterFromSearch(search: string): TrustTier {
  const t = new URLSearchParams(search).get("trust");
  if (t && LINKABLE_TIERS.includes(t as TrustTier)) return t as TrustTier;
  return "all";
}

export interface TrustFilterChoice {
  key: TrustTier;
  label: string;
  color: string | null;
  tooltip: string;
}

// The trust filters: this page's own filter keys, each wearing the ladder rung it
// selects. "All" has no colour. The keys stay the page's vocabulary; the words and
// colours are the ladder's, so a rename there is a rename here.
export function trustFilterChoicesFor(granularity: Granularity): TrustFilterChoice[] {
  const ladder = ladderFor(granularity);
  const rung = (key: string) => ladder.find((r) => r.key === key);
  const tooltips: Record<TrustTier, string> = {
    all: "Show all trust levels",
    verified: "At or above your verified line",
    high: "Highest Verification Score in your network",
    medium: "Above-average Verification Score",
    neutral: "Average Verification Score",
    low: "Below-average Verification Score",
    unverified: granularity === "simple" ? UNKNOWN_EXPLAINER : "No Verification Score calculated yet",
    flagged: "Low trust accounts reported by 2+ of your trusted contacts",
  };
  const choice = (
    key: TrustTier,
    rungKey: string,
  ): { key: TrustTier; label: string; color: string | null; tooltip: string } => {
    const r = rung(rungKey);
    return { key, label: r?.label ?? key, color: r?.color ?? null, tooltip: tooltips[key] };
  };
  const all = { key: "all" as TrustTier, label: "All", color: null, tooltip: tooltips.all };
  return granularity === "simple"
    ? [all, choice("verified", "verified"), choice("unverified", "unknown"), choice("flagged", "flagged")]
    : [
        all,
        choice("high", "high"),
        choice("medium", "trusted"),
        choice("neutral", "neutral"),
        choice("low", "low"),
        choice("unverified", "unverified"),
        choice("flagged", "flagged"),
      ];
}

// Map UI trust filter to backend tier param. Backend uses the GR
// `count_values` naming (medium_high / medium / medium_low / low /
// low_and_reported_by_2_or_more_trusted_pubkeys); FE UI names differ.
const UI_TO_GR_TIER: Record<string, NonNullable<Parameters<typeof useSelfConnections>[2]>["tier"]> = {
  high: "high",
  medium: "medium_high",
  neutral: "medium",
  low: "medium_low",
  unverified: "low",
  flagged: "low_and_reported_by_2_or_more_trusted_pubkeys",
};

/**
 * The backend tier a trust filter asks /connections for. None for All and
 * Verified (that one is `verified_only`), nor on the derived Flagged view, so
 * its cross-kind flag derivation sees unfiltered rows.
 */
export function connectionTier(trustFilter: TrustTier, isFlaggedView: boolean) {
  return isFlaggedView || trustFilter === "all" || trustFilter === "verified"
    ? undefined
    : UI_TO_GR_TIER[trustFilter as keyof typeof UI_TO_GR_TIER];
}

export interface PageWindow {
  totalPages: number;
  startIdx: number;
  safePage: number;
  nextItemStart: number;
  totalItems: number;
  items: string[];
  /** The page after this one, prefetched; absent on the last page. */
  nextPage?: Omit<PageWindow, "nextPage">;
}

/**
 * The rows page `currentPage` shows. The total is the larger of what is
 * loaded and what the server counts, so the pager can step past the loaded
 * window (the next backend page is fetched as it nears the end).
 */
export function pageWindow(
  visiblePubkeys: string[],
  activeServerCount: number,
  currentPage: number,
  PAGE_SIZE: number,
): PageWindow {
  const loadedTotalItems = visiblePubkeys.length;
  const totalItems = Math.max(loadedTotalItems, activeServerCount);
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const safePage = Math.min(currentPage, totalPages || 1);
  const startIdx = (safePage - 1) * PAGE_SIZE;

  if (safePage < totalPages) {
    const nextIdx = safePage * PAGE_SIZE;
    return {
      totalPages: totalPages,
      startIdx: startIdx,
      safePage: safePage,
      nextItemStart: Math.min(startIdx + PAGE_SIZE, totalItems),
      totalItems: totalItems,
      items: visiblePubkeys.slice(startIdx, startIdx + PAGE_SIZE),
      nextPage: {
        totalPages: totalPages,
        startIdx: nextIdx,
        safePage: safePage,
        nextItemStart: Math.min(startIdx + PAGE_SIZE, totalItems),
        totalItems: totalItems,
        items: visiblePubkeys.slice(nextIdx, nextIdx + PAGE_SIZE),
      },
    };
  } else {
    return {
      totalPages: totalPages,
      startIdx: startIdx,
      safePage: safePage,
      nextItemStart: Math.min(startIdx + PAGE_SIZE, totalItems),
      totalItems: totalItems,
      items: visiblePubkeys.slice(startIdx, startIdx + PAGE_SIZE),
    };
  }
}
