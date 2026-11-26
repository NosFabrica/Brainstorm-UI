/**
 * What the analytics profile's connection lists are made of: the composed
 * result (counts until a section's rows land), the groups a person can fall in,
 * the sort/filter/report-type choices, and the client-side narrowing of a
 * section's rows (search and report type; tier filters are server-side).
 */
import { ArrowLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import { nip19 } from "nostr-tools";
import type { ReportMetadata } from "@/services/nostr";
import type { GraphEntry } from "@/services/graphHelpers";
import { expandProfileCache } from "@/services/profilePageCache";
import { TIER_LABELS } from "@/services/trustThreshold";

export interface ProfileResultData {
  influence?: number;
  followed_by?: GraphEntry[] | number;
  following?: GraphEntry[] | number;
  muted_by?: GraphEntry[] | number;
  reported_by?: GraphEntry[] | number;
  muting?: GraphEntry[] | number;
  reporting?: GraphEntry[] | number;
  hops?: number;
  personalizedPageRank?: number;
  influenceRank?: number;
  followerInput?: number;
  muterInput?: number;
  reporterInput?: number;
  verifiedFollowerCount?: number;
  verifiedMuterCount?: number;
  verifiedReporterCount?: number;
  latestContentEventCreatedAt?: number;
  whitelisted?: boolean;
  blacklisted?: boolean;
}

export type ProfileSections = Partial<Record<string, GraphEntry[]>>;

export const getSection = (data: ProfileResultData | null | undefined, key: string): GraphEntry[] | undefined => {
  if (!data) return undefined;
  return (data as unknown as ProfileSections)[key];
};

export type SortMode = "trust-desc" | "trust-asc" | "name-asc" | "name-desc";
export type FilterMode = "all" | "verified" | "high" | "trusted" | "neutral" | "low" | "unverified";
export type ReportTypeFilter =
  "all" | "spam" | "impersonation" | "nudity" | "illegal" | "profanity" | "other" | "unavailable";

export interface GroupDef {
  key: string;
  label: string;
  colors: string;
}

export const CONNECTION_GROUP_KEYS = new Set([
  "followed_by",
  "following",
  "mutual",
  "shared_followers",
  "shared_following",
]);

export type OwnerLink = "mutual" | "follower" | "following";
export type YouLink = "mutual_with_you" | "follows_you" | "you_follow";

export function deriveConnectionClusters(groupKeys: Set<string>): { owner: OwnerLink | null; you: YouLink | null } {
  const hasMutual = groupKeys.has("mutual");
  const hasFollowedBy = groupKeys.has("followed_by");
  const hasFollowing = groupKeys.has("following");
  const owner: OwnerLink | null = hasMutual ? "mutual" : hasFollowedBy ? "follower" : hasFollowing ? "following" : null;

  const hasSharedFollower = groupKeys.has("shared_followers");
  const hasSharedFollowing = groupKeys.has("shared_following");
  const you: YouLink | null =
    hasSharedFollower && hasSharedFollowing
      ? "mutual_with_you"
      : hasSharedFollower
        ? "follows_you"
        : hasSharedFollowing
          ? "you_follow"
          : null;

  return { owner, you };
}

export const OWNER_PILL_META: Record<OwnerLink, { label: string; Icon: typeof ArrowLeft }> = {
  mutual: { label: "Mutual", Icon: ArrowLeftRight },
  follower: { label: "Follower", Icon: ArrowLeft },
  following: { label: "Following", Icon: ArrowRight },
};

export const YOU_PILL_META: Record<YouLink, { label: string; Icon: typeof ArrowLeft }> = {
  mutual_with_you: { label: "Mutual with you", Icon: ArrowLeftRight },
  follows_you: { label: "Follows you", Icon: ArrowLeft },
  you_follow: { label: "You follow", Icon: ArrowRight },
};

export const GROUP_DEFS: GroupDef[] = [
  {
    key: "followed_by",
    label: "Follower",
    colors: "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-100 dark:border-blue-500/25",
  },
  {
    key: "following",
    label: "Following",
    colors: "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-100 dark:border-blue-500/25",
  },
  {
    key: "mutual",
    label: "Mutual",
    colors: "bg-teal-50 dark:bg-teal-500/10 text-teal-500 dark:text-teal-400 border-teal-100 dark:border-teal-500/25",
  },
  {
    key: "shared_followers",
    label: "Shared Follower",
    colors:
      "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/15 dark:border-brand-primary/25",
  },
  {
    key: "shared_following",
    label: "Shared Following",
    colors:
      "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/15 dark:border-brand-primary/25",
  },
  {
    key: "muted_by",
    label: "Muted By",
    colors:
      "bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-200 dark:border-amber-500/25",
  },
  {
    key: "muting",
    label: "Muting",
    colors:
      "bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-200 dark:border-amber-500/25",
  },
  {
    key: "reported_by",
    label: "Reported",
    colors: "bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border-red-200 dark:border-red-500/25",
  },
  {
    key: "reporting",
    label: "Reporting",
    colors: "bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800",
  },
];

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "trust-desc", label: "Trust \u2193" },
  { value: "trust-asc", label: "Trust \u2191" },
  { value: "name-asc", label: "A\u2013Z" },
  { value: "name-desc", label: "Z\u2013A" },
];

export const FILTER_OPTIONS: { value: FilterMode; label: string; color: string }[] = [
  { value: "all", label: "All", color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
  {
    value: "verified",
    label: "Verified",
    color: "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link",
  },
  {
    value: "high",
    label: TIER_LABELS.high,
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    value: "trusted",
    label: TIER_LABELS.trusted,
    color: "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    value: "neutral",
    label: "Neutral",
    color: "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link",
  },
  {
    value: "low",
    label: TIER_LABELS.low,
    color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    value: "unverified",
    label: "Unverified",
    color: "bg-zinc-50 dark:bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
  },
];

export const REPORT_TYPE_OPTIONS: { value: ReportTypeFilter; label: string; dotColor: string }[] = [
  { value: "all", label: "All Types", dotColor: "bg-slate-300 dark:bg-slate-700" },
  { value: "spam", label: "Spam", dotColor: "bg-amber-500" },
  { value: "impersonation", label: "Impersonation", dotColor: "bg-red-500" },
  { value: "nudity", label: "Nudity", dotColor: "bg-pink-500" },
  { value: "illegal", label: "Illegal", dotColor: "bg-red-700" },
  { value: "profanity", label: "Profanity", dotColor: "bg-orange-500" },
  { value: "other", label: "Other", dotColor: "bg-slate-400 dark:bg-slate-600" },
  { value: "unavailable", label: "Unavailable", dotColor: "bg-slate-300 dark:bg-slate-700" },
];

export const SECTION_BORDER_COLORS: Record<string, string> = {
  followed_by: "border-blue-300 dark:border-blue-500/30",
  following: "border-blue-300 dark:border-blue-500/30",
  mutual: "border-teal-300 dark:border-teal-500/30",
  shared_followers: "border-brand-primary/25 dark:border-brand-primary/[0.3]",
  shared_following: "border-brand-primary/25 dark:border-brand-primary/[0.3]",
  muted_by: "border-amber-300 dark:border-amber-500/30",
  reported_by: "border-red-300 dark:border-red-500/30",
  muting: "border-amber-200 dark:border-amber-500/25",
  reporting: "border-slate-300 dark:border-slate-700",
};

// Backend GR bucket name → the display key TIER_DISPLAY_CONFIG uses. The page
// has no dedicated flagged slice, so flagged folds into unverified (same as
// `grTierCountsToUI`).
export const GR_TIER_TO_UI: Record<string, string> = {
  high: "high",
  medium_high: "trusted",
  medium: "neutral",
  medium_low: "low",
  low: "unverified",
  low_and_reported_by_2_or_more_trusted_pubkeys: "unverified",
};

export type TrustCache = { get(pk: string): number | null | undefined; has(pk: string): boolean };

export function getTrustForPkFromMaps(
  pk: string,
  sectionInfluenceMaps: Record<string, Map<string, number | null>>,
  trustCache: TrustCache,
): number {
  const cached = trustCache.get(pk);
  if (cached !== undefined && cached !== null) return cached;
  for (const groupKey of ["followed_by", "following", "muted_by", "reported_by", "muting", "reporting"] as const) {
    const val = sectionInfluenceMaps[groupKey]?.get(pk);
    if (val !== undefined && val !== null) return val;
  }
  return -1;
}

export function computeProcessedPubkeys(
  key: string,
  pubkeys: string[],
  filter: FilterMode,
  sort: SortMode,
  search: string,
  reportTypeFilter: ReportTypeFilter,
  sectionInfluenceMaps: Record<string, Map<string, number | null>>,
  getReportForPubkey: (sectionKey: string, pubkey: string) => ReportMetadata | undefined,
  trustCache: TrustCache,
): string[] {
  // tier / verified filtering is applied server-side via /connections query
  // params, so the items reaching us already match `filter`.
  let filtered = pubkeys;
  if (reportTypeFilter !== "all" && (key === "reported_by" || key === "reporting")) {
    filtered = filtered.filter((pk) => {
      const report = getReportForPubkey(key, pk);
      if (reportTypeFilter === "unavailable") return !report;
      return report?.reportType === reportTypeFilter;
    });
  }
  const trimmed = search.toLowerCase().trim();
  if (trimmed) {
    filtered = filtered.filter((pk) => {
      const profile = expandProfileCache.get(pk);
      const name = (profile?.display_name || profile?.name || "").toLowerCase();
      const nip05 = (profile?.nip05 || "").toLowerCase();
      if (name.includes(trimmed) || nip05.includes(trimmed)) return true;
      if (trimmed.startsWith("npub")) {
        try {
          const npub = nip19.npubEncode(pk).toLowerCase();
          return npub.includes(trimmed);
        } catch {
          return false;
        }
      }
      return false;
    });
  }
  const sorted = [...filtered];
  if (sort === "trust-desc" || sort === "trust-asc") {
    sorted.sort((a, b) => {
      const sa = getTrustForPkFromMaps(a, sectionInfluenceMaps, trustCache);
      const sb = getTrustForPkFromMaps(b, sectionInfluenceMaps, trustCache);
      return sort === "trust-desc" ? sb - sa : sa - sb;
    });
  } else {
    sorted.sort((a, b) => {
      const pa = expandProfileCache.get(a);
      const pb = expandProfileCache.get(b);
      const na = (pa?.display_name || pa?.name || "").toLowerCase();
      const nb = (pb?.display_name || pb?.name || "").toLowerCase();
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return sort === "name-asc" ? na.localeCompare(nb) : nb.localeCompare(na);
    });
  }
  return sorted;
}
