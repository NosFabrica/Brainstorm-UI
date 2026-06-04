import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  getVerifiedThreshold,
  PRESET_THRESHOLDS,
  TIER_THRESHOLDS,
} from "@/services/trustThreshold";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import {
  Search as SearchIcon,
  Home,
  X,
  Loader2,
  Users,
  Filter,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ShieldCheck,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  getCurrentUser,
  logout,
  fetchProfiles,
  eventStore,
  type NostrUser,
} from "@/services/nostr";
import {
  getProfileContent,
  isValidProfile,
} from "applesauce-core/helpers/profile";
import { apiClient, isAuthRedirecting } from "@/services/api";
import {
  useSelfOverview,
  useSelfStats,
  useSelfConnections,
  flattenConnections,
  type ConnectionItem,
} from "@/hooks/useSelf";
import { toPubkeys, toInfluenceMap } from "../services/graphHelpers";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { useSocialActions } from "@/hooks/useSocialActions";
import { useToast } from "@/hooks/use-toast";
import { NetworkProfileCard } from "@/components/network/NetworkProfileCard";
import { groups, type GroupKey } from "@/components/network/networkGroups";
import {
  NetworkCardActionsProvider,
  NetworkCardViewProvider,
  type NetworkCardActions,
  type NetworkCardView,
} from "@/components/network/cardContext";

const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 8 + Math.random() * 84,
  y: 8 + Math.random() * 84,
  size: Math.random() * 2.5 + 1.5,
  popDelay: i * 1.2 + Math.random() * 2,
  floatDuration: Math.random() * 20 + 22,
  floatDelay: Math.random() * 6,
}));

const connectionPairs = [
  [0, 3],
  [1, 4],
  [2, 5],
  [3, 7],
  [4, 8],
  [5, 9],
  [0, 6],
  [1, 7],
  [2, 8],
  [6, 9],
];

const decorativeText = [
  "trust_score: 0.847",
  "npub1qd9...k7a2",
  "hops: 3",
  "relay: wss://nos.lol",
  "verify(sig)",
  "WOT(u) = f(G, seeds)",
  "muted_by: 0",
  "followers: 142",
  "influence: 1.0",
  "kind: 22242",
  "relay: wss://damus.io",
  "G = (V, E, W)",
  "score = f(hops)",
  "compute(graperank)",
  "npub1z8f...m4c9",
  "following: 87",
  "attenuation: 0.5",
  "rigor: 0.25",
];

function estimateNetworkLineLength(a: number, b: number): number {
  const dx = floatingNodes[a].x - floatingNodes[b].x;
  const dy = floatingNodes[a].y - floatingNodes[b].y;
  return Math.sqrt(dx * dx + dy * dy) * 12;
}

const connectionLineStyles: React.CSSProperties[] = connectionPairs.map(
  ([a, b], i) => {
    const len = estimateNetworkLineLength(a, b);
    return {
      ["--dash" as string]: len,
      animation: `networkLineDraw ${1.2 + (i % 3) * 0.4}s ease-out ${i * 0.8 + 0.3}s forwards, networkLinePulse 12s ease-in-out ${i * 0.8 + 0.3 + 1.5}s infinite`,
    } as React.CSSProperties;
  },
);

const connectionLineDashArrays = connectionPairs.map(([a, b]) =>
  estimateNetworkLineLength(a, b),
);

const floatingNodeStyles: React.CSSProperties[] = floatingNodes.map((node) => ({
  left: `${node.x}%`,
  top: `${node.y}%`,
  width: node.size + 5,
  height: node.size + 5,
  opacity: 0,
  transform: "scale(0)",
  animation: `networkNodePop 0.6s ease-out ${node.popDelay}s forwards, networkNodeFloat ${node.floatDuration}s ease-in-out ${node.popDelay + 0.6}s infinite`,
}));

const decorativeTextStyles: React.CSSProperties[] = decorativeText.map(
  (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const left = 3 + col * 24 + (row % 2) * 10;
    const top = 80 + row * 220;
    return {
      left: `${left}%`,
      top: `${top}px`,
      opacity: 0,
      animation: `networkCalcFloat 10s ease-in-out ${i * 1.2 + 1}s infinite`,
    };
  },
);

/**
 * The Network row expander now uses the lightweight `/user/:pk/overview`
 * endpoint (counts + influence only, 30s timeout) instead of the heavy
 * `/user/:pk` endpoint (full follower/following/muter/reporter arrays,
 * 60s timeout). The overview cache shares its key (`["profile-overview",
 * hex]`) with the full Profile page, so hovering a row on Network and
 * then opening the profile (or vice versa) reuses the same entry.
 *
 * The eager trust-score pass below still calls `/user/:pk` directly,
 * because it needs the `muted_by` / `reported_by` arrays to drive the
 * muter/reporter trust-score follow-up. That pass is out of scope here.
 */
const PROFILE_OVERVIEW_STALE_MS = 5 * 60_000;

type UserOverview = {
  pubkey?: string;
  influence: number | null;
  counts: {
    followed_by: number;
    following: number;
    muted_by: number;
    muting: number;
    reported_by: number;
    reporting: number;
  };
};

function profileOverviewQueryKey(pk: string) {
  return ["profile-overview", pk.toLowerCase()] as const;
}

async function fetchProfileOverview(pk: string): Promise<UserOverview | null> {
  const res = await apiClient.getUserOverview(pk);
  return res?.data ?? null;
}

/**
 * Fresh = present, non-null, and within staleTime. A cached `null` (from a
 * prior transient error) is NOT fresh, so expand/hover paths are allowed to
 * retry it instead of locking the panel into a stale empty state.
 */
function isProfileOverviewFresh(pk: string): boolean {
  const state = queryClient.getQueryState(profileOverviewQueryKey(pk));
  if (!state || state.status === "error") return false;
  if (state.data === undefined || state.data === null) return false;
  return state.dataUpdatedAt > Date.now() - PROFILE_OVERVIEW_STALE_MS;
}

function prefetchProfileOverview(pk: string): void {
  void queryClient
    .prefetchQuery({
      queryKey: profileOverviewQueryKey(pk),
      queryFn: () => fetchProfileOverview(pk),
      staleTime: PROFILE_OVERVIEW_STALE_MS,
    })
    .catch(() => {});
}

export default function NetworkPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);

  const [activeGroup, setActiveGroup] = useState<GroupKey>(() => {
    const params = new URLSearchParams(window.location.search);
    const group = params.get("group");
    const validGroups: GroupKey[] = [
      "followed_by",
      "following",
      "muted_by",
      "muting",
      "reported_by",
      "reporting",
      "flagged",
    ];
    return group && validGroups.includes(group as GroupKey)
      ? (group as GroupKey)
      : "followed_by";
  });
  // Mirror activeGroup into a ref so cards can read it lazily inside their
  // "view full profile" navigate handler without re-rendering on every change.
  const activeGroupRef = useRef(activeGroup);
  activeGroupRef.current = activeGroup;
  const [searchFilter, setSearchFilter] = useState("");
  type TrustTier =
    | "all"
    | "high"
    | "medium"
    | "neutral"
    | "low"
    | "unverified"
    | "flagged";
  const [trustFilter, setTrustFilter] = useState<TrustTier>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("trust");
    const valid: TrustTier[] = [
      "high",
      "medium",
      "neutral",
      "low",
      "unverified",
      "flagged",
    ];
    if (t && valid.includes(t as TrustTier)) return t as TrustTier;
    return "all";
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("trust")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const [loadedCount, setLoadedCount] = useState(0);
  const [copiedPubkey, setCopiedPubkey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") === "grid" ? "grid" : "list";
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [expandedPubkey, setExpandedPubkey] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchAbortRef = useRef(0);
  const { toast } = useToast();
  const social = useSocialActions(user?.pubkey);
  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const calcDoneNow =
    grapeRankData?.data?.internal_publication_status === "success";
  const hadPreviousCalc = useMemo(() => {
    if (calcDoneNow) {
      try {
        localStorage.setItem("brainstorm_calc_completed", "true");
      } catch {}
      return true;
    }
    try {
      return localStorage.getItem("brainstorm_calc_completed") === "true";
    } catch {
      return false;
    }
  }, [calcDoneNow]);
  const calcDone = calcDoneNow || hadPreviousCalc;

  const PAGE_SIZE = 100;

  const profileCache = useRef<Map<string, any>>(new Map());
  // Pubkeys we've already tried to fetch a kind-0 profile for (whether or not
  // one came back). Lets a row fall back to its npub instead of an endless
  // skeleton when no profile exists. See the gate in NetworkProfileCard.
  const profileAttempted = useRef<Set<string>>(new Set());
  const trustCache = useRef<Map<string, number | null>>(new Map());
  const graphDataCache = useRef<
    Map<string, { muted_by?: string[]; reported_by?: string[] }>
  >(new Map());
  const [trustLoadedCount, setTrustLoadedCount] = useState(0);
  const prefetchTimersRef = useRef<Map<string, number>>(new Map());
  const supportsHoverRef = useRef<boolean>(true);

  useEffect(() => {
    try {
      supportsHoverRef.current = window.matchMedia("(pointer: fine)").matches;
    } catch {
      supportsHoverRef.current = true;
    }
    const timers = prefetchTimersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const handleRowPrefetchEnter = useCallback((pk: string) => {
    if (!supportsHoverRef.current) return;
    if (prefetchTimersRef.current.has(pk)) return;
    if (isProfileOverviewFresh(pk)) return;
    const timer = window.setTimeout(() => {
      prefetchTimersRef.current.delete(pk);
      prefetchProfileOverview(pk);
    }, 150);
    prefetchTimersRef.current.set(pk, timer);
  }, []);

  const handleRowPrefetchLeave = useCallback((pk: string) => {
    const t = prefetchTimersRef.current.get(pk);
    if (t !== undefined) {
      window.clearTimeout(t);
      prefetchTimersRef.current.delete(pk);
    }
  }, []);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/", { replace: true });
      return;
    }
    setUser(u);
  }, [navigate]);

  const { preset: trustPreset } = useTrustPresetSync(!!user);

  // SELF overview's `flagged_by_observer` is always false (self ≠ flags self),
  // so threshold doesn't affect any consumed field — omit to keep the queryKey
  // stable across `trustPreset` lifecycle transitions.
  const overviewQuery = useSelfOverview(user?.pubkey);
  // Stats verified/tier counts DO depend on threshold. Derive from the
  // server-confirmed preset (stable) rather than `getVerifiedThreshold()`
  // (which reads localStorage and can flip mid-mount).
  const statsThreshold = trustPreset
    ? PRESET_THRESHOLDS[trustPreset]
    : undefined;
  const statsQuery = useSelfStats(
    user?.pubkey,
    statsThreshold !== undefined
      ? { verified_threshold: statsThreshold }
      : undefined,
  );

  // Track which kinds the user has visited so each kind only fetches once mounted.
  // "flagged" is a derived view that scopes to currently-loaded sections — it
  // does NOT trigger any fetch itself.
  const [loadedKinds, setLoadedKinds] = useState<Set<GroupKey>>(new Set());

  // Map UI trust filter to backend tier param. Backend uses the GR
  // `count_values` naming (medium_high / medium / medium_low / low /
  // low_and_reported_by_2_or_more_trusted_pubkeys); FE UI names differ.
  // When activeGroup is the derived "flagged" view, drop filters so the
  // cross-kind flag derivation sees unfiltered loaded items.
  const isFlaggedView = activeGroup === "flagged";
  const UI_TO_GR_TIER: Record<
    string,
    NonNullable<Parameters<typeof useSelfConnections>[2]>["tier"]
  > = {
    high: "high",
    medium: "medium_high",
    neutral: "medium",
    low: "medium_low",
    unverified: "low",
    flagged: "low_and_reported_by_2_or_more_trusted_pubkeys",
  };
  const mappedTier =
    isFlaggedView || trustFilter === "all"
      ? undefined
      : UI_TO_GR_TIER[trustFilter];
  // Single source of truth for the verified line: the preset value when a preset
  // is active (stable), else the localStorage threshold. Used for BOTH the
  // verified-only `min_influence` list filter AND the `verified_threshold`
  // predicate, so the filtered list and the stats-derived header count agree.
  const verifiedThreshold = trustPreset
    ? PRESET_THRESHOLDS[trustPreset]
    : getVerifiedThreshold();
  const minInfluenceFilter =
    !isFlaggedView && verifiedOnly && mappedTier === undefined
      ? verifiedThreshold
      : undefined;
  // Preset-driven verified_threshold so tier=low / tier=unverified /
  // tier=low_and_reported_by_2_or_more_trusted_pubkeys / min_influence on
  // /connections honour the user's preset (otherwise backend would default
  // to 0.02).
  const connectionsVt = trustPreset
    ? PRESET_THRESHOLDS[trustPreset]
    : undefined;
  const filterOpts = {
    order: sortDirection,
    tier: mappedTier,
    min_influence: minInfluenceFilter,
    verified_threshold: connectionsVt,
    // Pager needs the filtered total per section (overview/stats can't express
    // arbitrary tier filters). Requested on the first page only (see useSelf).
    withTotal: true,
  };

  const followedByConn = useSelfConnections(user?.pubkey, "followed_by", {
    enabled: loadedKinds.has("followed_by"),
    ...filterOpts,
  });
  const followingConn = useSelfConnections(user?.pubkey, "following", {
    enabled: loadedKinds.has("following"),
    ...filterOpts,
  });
  const mutedByConn = useSelfConnections(user?.pubkey, "muted_by", {
    enabled: loadedKinds.has("muted_by"),
    ...filterOpts,
  });
  const mutingConn = useSelfConnections(user?.pubkey, "muting", {
    enabled: loadedKinds.has("muting"),
    ...filterOpts,
  });
  const reportedByConn = useSelfConnections(user?.pubkey, "reported_by", {
    enabled: loadedKinds.has("reported_by"),
    ...filterOpts,
  });
  const reportingConn = useSelfConnections(user?.pubkey, "reporting", {
    enabled: loadedKinds.has("reporting"),
    ...filterOpts,
  });
  // Virtual cross-relationship kind: DISTINCT flagged users, server-side.
  // Filters/min_influence don't apply — the flagged predicate is fixed. The
  // verified_threshold is still preset-driven (it's part of the predicate).
  const flaggedConn = useSelfConnections(user?.pubkey, "flagged", {
    enabled: loadedKinds.has("flagged"),
    order: sortDirection,
    verified_threshold: connectionsVt,
  });

  // Lookup the currently-active connection query so we can fetch the next
  // backend page on demand when the user navigates past the loaded window.
  const activeConn =
    activeGroup === "followed_by"
      ? followedByConn
      : activeGroup === "following"
        ? followingConn
        : activeGroup === "muted_by"
          ? mutedByConn
          : activeGroup === "muting"
            ? mutingConn
            : activeGroup === "reported_by"
              ? reportedByConn
              : activeGroup === "reporting"
                ? reportingConn
                : activeGroup === "flagged"
                  ? flaggedConn
                  : null;

  const networkData = useMemo(() => {
    const acc: Record<string, ConnectionItem[]> = {
      followed_by: flattenConnections(followedByConn.data?.pages),
      following: flattenConnections(followingConn.data?.pages),
      muted_by: flattenConnections(mutedByConn.data?.pages),
      muting: flattenConnections(mutingConn.data?.pages),
      reported_by: flattenConnections(reportedByConn.data?.pages),
      reporting: flattenConnections(reportingConn.data?.pages),
      flagged: flattenConnections(flaggedConn.data?.pages),
    };
    return acc;
  }, [
    followedByConn.data?.pages,
    followingConn.data?.pages,
    mutedByConn.data?.pages,
    mutingConn.data?.pages,
    reportedByConn.data?.pages,
    reportingConn.data?.pages,
    flaggedConn.data?.pages,
  ]);

  // Mark a kind loaded as soon as user navigates to it.
  useEffect(() => {
    setLoadedKinds((prev) =>
      prev.has(activeGroup) ? prev : new Set([...prev, activeGroup]),
    );
  }, [activeGroup]);

  // Overall load gate: loading only while overview is in-flight. Connection
  // queries are per-section and lazy; their loading state is surfaced by the
  // per-section UI, not by this top-level flag.
  const isLoading = overviewQuery.isLoading;

  useMemo(() => {
    const allGroups: GroupKey[] = [
      "followed_by",
      "following",
      "muted_by",
      "muting",
      "reported_by",
      "reporting",
    ];
    for (const groupKey of allGroups) {
      const items = networkData[groupKey];
      if (!items || items.length === 0) continue;
      const influenceMap = toInfluenceMap(items as any);
      influenceMap.forEach((influence, pk) => {
        if (!trustCache.current.has(pk)) {
          trustCache.current.set(pk, influence);
        }
      });
    }
  }, [networkData]);

  const fetchProfilesCallback = useCallback(async (pubkeys: string[]) => {
    const unfetched = pubkeys.filter((pk) => !profileCache.current.has(pk));
    const cached: string[] = [];
    const missing: string[] = [];
    for (const pk of unfetched) {
      const event = eventStore.getReplaceable(0, pk);
      if (event) {
        if (isValidProfile(event)) {
          profileCache.current.set(pk, getProfileContent(event));
        }
        cached.push(pk);
      } else {
        missing.push(pk);
      }
    }
    if (cached.length > 0) {
      setLoadedCount((prev) => prev + cached.length);
    }
    const batchSize = 400;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      await fetchProfiles(batch, (pubkey, profile) => {
        profileCache.current.set(pubkey, profile);
        setLoadedCount((prev) => prev + 1);
      });
    }
    // Every requested pubkey has now had a fetch attempt (eventStore hit or a
    // settled relay request). Mark them so their rows stop showing a skeleton
    // and fall back to the npub if no profile was found. Force one re-render so
    // the cards re-evaluate the gate.
    let newlyAttempted = false;
    for (const pk of pubkeys) {
      if (!profileAttempted.current.has(pk)) {
        profileAttempted.current.add(pk);
        newlyAttempted = true;
      }
    }
    if (newlyAttempted || unfetched.length === 0) {
      setLoadedCount((prev) => prev + 1);
    }
  }, []);

  const fetchTrustScores = useCallback(async (pubkeys: string[]) => {
    const unfetched = pubkeys.filter((pk) => !trustCache.current.has(pk));
    if (unfetched.length === 0) {
      return;
    }
    const batchSize = 8;
    for (let i = 0; i < unfetched.length; i += batchSize) {
      const batch = unfetched.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (pk) => {
          const res = await apiClient.getUserByPubkey(pk);
          return res?.data ?? null;
        }),
      );
      results.forEach((res, idx) => {
        const pk = batch[idx];
        if (res.status === "fulfilled") {
          const graph = res.value?.graph ?? res.value;
          const influence = graph?.influence;
          trustCache.current.set(
            pk,
            typeof influence === "number" ? influence : null,
          );
          graphDataCache.current.set(pk, {
            muted_by: toPubkeys(graph?.muted_by),
            reported_by: toPubkeys(graph?.reported_by),
          });
        } else {
          trustCache.current.set(pk, null);
        }
      });
      setTrustLoadedCount((prev) => prev + batch.length);
    }
  }, []);

  const toggleExpanded = useCallback((pk: string) => {
    // The actual fetch is driven by `expandedDetailQuery` below — useQuery
    // handles cached/stale/missing transitions and re-renders the panel
    // reactively when data lands. We just flip the expanded pubkey here.
    setExpandedPubkey((prev) => (prev === pk ? null : pk));
  }, []);

  // Reactive subscription for the currently expanded row. Re-uses the same
  // `["profile-overview", hex]` cache key as the full Profile page, and
  // emits `isFetching` / `data` updates so the panel paints stale data
  // immediately (stale-while-revalidate) and refreshes when the background
  // fetch lands.
  const expandedDetailQuery = useQuery<UserOverview | null>({
    queryKey: profileOverviewQueryKey(expandedPubkey ?? ""),
    queryFn: () => fetchProfileOverview(expandedPubkey!),
    enabled: !!expandedPubkey,
    staleTime: PROFILE_OVERVIEW_STALE_MS,
    retry: false,
  });
  // Adapt overview shape (`{influence, counts:{...}}`) to the flat shape the
  // detail panel renders (`{followed_by, following, ..., influence}`). Counts
  // come back as numbers, not arrays — the panel's metric tiles already
  // accept either, so verified-subset display gracefully degrades to "total
  // count only" until/unless an array seed (graphData from the eager pass)
  // is also present.
  const expandedDetailGraph = useMemo(() => {
    const ov = expandedDetailQuery.data;
    if (!ov) return null;
    const c = ov.counts ?? ({} as UserOverview["counts"]);
    return {
      followed_by: c.followed_by ?? 0,
      following: c.following ?? 0,
      muted_by: c.muted_by ?? 0,
      muting: c.muting ?? 0,
      reported_by: c.reported_by ?? 0,
      reporting: c.reporting ?? 0,
      ...(ov.influence != null ? { influence: ov.influence } : {}),
    };
  }, [expandedDetailQuery.data]);
  const expandedIsLoading =
    !!expandedPubkey &&
    expandedDetailQuery.isFetching &&
    expandedDetailQuery.data == null;

  // Parallel server-side stats query for the expanded row. Shares the
  // `["profile-stats", hex, trustPreset]` cache key with the full Profile
  // page so a click-through reuses the same entry. Gives us accurate
  // Verified/Total counts for followed_by/following (and others) — the
  // lighter overview endpoint only returns total counts.
  type SectionStats = { total: number; verified: number };
  type StatsResponse = {
    followed_by: SectionStats;
    following: SectionStats;
    muted_by: SectionStats;
    muting: SectionStats;
    reported_by: SectionStats;
    reporting: SectionStats;
  };
  const expandedStatsQuery = useQuery<StatsResponse | null>({
    queryKey: [
      "profile-stats",
      (expandedPubkey ?? "").toLowerCase(),
      trustPreset,
    ],
    queryFn: async () => {
      const res = await apiClient.getUserStats(expandedPubkey!, {
        verified_threshold: getVerifiedThreshold(),
        tier_high: TIER_THRESHOLDS.high,
        tier_medium_high: TIER_THRESHOLDS.medium_high,
        tier_medium: TIER_THRESHOLDS.medium,
      });
      return res?.data ?? null;
    },
    enabled: !!expandedPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const expandedStats = useMemo(() => {
    const s = expandedStatsQuery.data;
    if (!s) return undefined;
    return {
      followed_by: {
        verified: s.followed_by?.verified ?? 0,
        total: s.followed_by?.total ?? 0,
      },
      following: {
        verified: s.following?.verified ?? 0,
        total: s.following?.total ?? 0,
      },
      muted_by: {
        verified: s.muted_by?.verified ?? 0,
        total: s.muted_by?.total ?? 0,
      },
      muting: {
        verified: s.muting?.verified ?? 0,
        total: s.muting?.total ?? 0,
      },
      reported_by: {
        verified: s.reported_by?.verified ?? 0,
        total: s.reported_by?.total ?? 0,
      },
      reporting: {
        verified: s.reporting?.verified ?? 0,
        total: s.reporting?.total ?? 0,
      },
    } as Record<string, { verified: number; total: number }>;
  }, [expandedStatsQuery.data]);

  // Derive flagged set from per-item properties across all loaded sections,
  // not just the dedicated `flagged` kind. This way the badge / membership
  // check works in any combination — flagged tab, or tier=flagged filter
  // inside another tab, or just spotting flagged users in an unfiltered list.
  const flaggedPubkeySet = useMemo(() => {
    const set = new Set<string>();
    const vt = getVerifiedThreshold();
    const allKinds: GroupKey[] = [
      "followed_by",
      "following",
      "muted_by",
      "muting",
      "reported_by",
      "reporting",
      "flagged",
    ];
    for (const k of allKinds) {
      for (const item of (networkData[k] as ConnectionItem[]) || []) {
        const inf = item.influence;
        const tr = item.trusted_reporters ?? 0;
        if (inf !== null && inf !== undefined && inf < vt && tr >= 2) {
          set.add(item.pubkey);
        }
      }
    }
    return set;
  }, [networkData, trustPreset]);

  const getGroupPubkeys = useCallback(
    (key: GroupKey): string[] => {
      if (!networkData) return [];
      return toPubkeys(networkData[key]);
    },
    [networkData],
  );

  const groupPubkeySets = useMemo(() => {
    if (!networkData) return null;
    const sets: Record<GroupKey, Set<string>> = {} as any;
    (
      [
        "followed_by",
        "following",
        "muted_by",
        "muting",
        "reported_by",
        "reporting",
      ] as GroupKey[]
    ).forEach((k) => {
      sets[k] = new Set(toPubkeys(networkData[k]));
    });
    sets["flagged"] = flaggedPubkeySet;
    return sets;
  }, [networkData, flaggedPubkeySet]);

  const getPubkeyGroups = useCallback(
    (pubkey: string): GroupKey[] => {
      if (!groupPubkeySets) return [];
      const memberOf: GroupKey[] = [];
      (
        [
          "followed_by",
          "following",
          "muted_by",
          "muting",
          "reported_by",
          "reporting",
          "flagged",
        ] as GroupKey[]
      ).forEach((k) => {
        if (groupPubkeySets[k].has(pubkey)) {
          memberOf.push(k);
        }
      });
      return memberOf;
    },
    [groupPubkeySets],
  );

  const isVerifiableGroup = (_key: GroupKey) => true;

  const getGroupCount = useCallback(
    (key: GroupKey): number => {
      // "flagged" comes from overview.flagged_count (DISTINCT across all
      // relationships, computed server-side).
      if (key === "flagged")
        return overviewQuery.data?.data?.flagged_count ?? 0;
      // Always source section header counts from overview/stats (server-side
      // totals), independent of whether the section's items have been fetched.
      const counts = overviewQuery.data?.data?.counts;
      const stats = statsQuery.data?.data;
      if (verifiedOnly && isVerifiableGroup(key)) {
        return (stats as any)?.[key]?.verified ?? 0;
      }
      return (counts as any)?.[key] ?? 0;
    },
    [verifiedOnly, overviewQuery.data, statsQuery.data],
  );

  const filteredPubkeys = useCallback(() => {
    // tier + verified-only are now applied server-side via the `tier` /
    // `min_influence` query params on /connections — see filterOpts above.
    // The active-section's loaded items already match the filter, so the only
    // client-side narrowing left is the text search.
    let pubkeys = getGroupPubkeys(activeGroup);
    const hasSearch = !!searchFilter.trim();
    if (hasSearch) {
      const query = searchFilter.trim().toLowerCase();
      pubkeys = pubkeys.filter((pk) => {
        const profile = profileCache.current.get(pk);
        const npub = nip19.npubEncode(pk);
        if (npub.toLowerCase().includes(query)) return true;
        if (pk.toLowerCase().includes(query)) return true;
        if (profile) {
          if (profile.name?.toLowerCase().includes(query)) return true;
          if (profile.display_name?.toLowerCase().includes(query)) return true;
          if (profile.nip05?.toLowerCase().includes(query)) return true;
        }
        return false;
      });
    }
    return pubkeys;
  }, [activeGroup, searchFilter, getGroupPubkeys, loadedCount]);

  useEffect(() => {
    const query = searchFilter.trim();
    if (query.length < 2) {
      setSearchLoading(false);
      return;
    }
    const abortId = ++searchAbortRef.current;
    const timer = setTimeout(async () => {
      const allPks = getGroupPubkeys(activeGroup);
      const uncached = allPks.filter((pk) => !profileCache.current.has(pk));
      if (uncached.length === 0) return;

      setSearchLoading(true);
      const BATCH = 50;
      const MAX = 500;
      const toFetch = uncached.slice(0, MAX);
      for (let i = 0; i < toFetch.length; i += BATCH) {
        if (searchAbortRef.current !== abortId) break;
        const batch = toFetch.slice(i, i + BATCH);
        await fetchProfilesCallback(batch);
      }
      if (searchAbortRef.current === abortId) {
        setSearchLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      searchAbortRef.current++;
      setSearchLoading(false);
    };
  }, [searchFilter, activeGroup, getGroupPubkeys, fetchProfilesCallback]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleCopyNpub = useCallback(async (npub: string, pubkey: string) => {
    try {
      await navigator.clipboard.writeText(npub);
      setCopiedPubkey(pubkey);
      setTimeout(() => setCopiedPubkey(null), 2000);
    } catch {}
  }, []);

  const handleCloseDetail = useCallback(() => {
    setExpandedPubkey(null);
  }, []);

  const handleSocialFollow = useCallback(
    async (pk: string) => {
      const result = await social.follow(pk);
      if (result.success)
        toast({ title: "Followed", description: "Added to your contact list" });
      else
        toast({
          title: "Error",
          description: result.error || "Follow failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  const handleSocialUnfollow = useCallback(
    async (pk: string) => {
      const result = await social.unfollow(pk);
      if (result.success)
        toast({
          title: "Unfollowed",
          description: "Removed from your contact list",
        });
      else
        toast({
          title: "Error",
          description: result.error || "Unfollow failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  const handleSocialMute = useCallback(
    async (pk: string) => {
      const result = await social.mute(pk);
      if (result.success)
        toast({ title: "Muted", description: "Added to your mute list" });
      else
        toast({
          title: "Error",
          description: result.error || "Mute failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  const handleSocialUnmute = useCallback(
    async (pk: string) => {
      const result = await social.unmute(pk);
      if (result.success)
        toast({ title: "Unmuted", description: "Removed from your mute list" });
      else
        toast({
          title: "Error",
          description: result.error || "Unmute failed",
          variant: "destructive",
        });
      return result;
    },
    [social, toast],
  );

  // Stable, identity-constant deps shared by every card. Memoized so the
  // context value only changes when one of these callbacks/refs does (in
  // practice only `getPubkeyGroups`, when networkData changes) — so consuming
  // it never causes a wasteful per-card re-render.
  const cardActions: NetworkCardActions = useMemo(
    () => ({
      trustCacheRef: trustCache,
      activeGroupRef,
      getPubkeyGroups,
      onToggleExpanded: toggleExpanded,
      onCopyNpub: handleCopyNpub,
      onCloseDetail: handleCloseDetail,
      onNavigate: navigate,
      onFollow: handleSocialFollow,
      onUnfollow: handleSocialUnfollow,
      onMute: handleSocialMute,
      onUnmute: handleSocialUnmute,
      onPrefetchEnter: handleRowPrefetchEnter,
      onPrefetchLeave: handleRowPrefetchLeave,
    }),
    [
      getPubkeyGroups,
      toggleExpanded,
      handleCopyNpub,
      handleCloseDetail,
      navigate,
      handleSocialFollow,
      handleSocialUnfollow,
      handleSocialMute,
      handleSocialUnmute,
      handleRowPrefetchEnter,
      handleRowPrefetchLeave,
    ],
  );

  // View state whose change *should* repaint every card.
  const cardView: NetworkCardView = useMemo(
    () => ({
      viewMode,
      socialPending: social.isAnyPending,
      socialListsLoading: social.listsLoading,
    }),
    [viewMode, social.isAnyPending, social.listsLoading],
  );

  // Items arrive from the backend already in the requested order (the `order`
  // query param drives ORDER BY in /connections). No client-side re-sort.
  const visiblePubkeys = useMemo(
    () => filteredPubkeys(),
    [filteredPubkeys, trustFilter, trustLoadedCount],
  );

  // Pull the next backend page (cursor-paginated /connections) when the user
  // navigates near the end of the loaded window for the active section.
  // Prefetches one display page ahead so the next-page click feels instant.
  useEffect(() => {
    if (!activeConn) return;
    if (!activeConn.hasNextPage || activeConn.isFetchingNextPage) return;
    const loaded = visiblePubkeys.length;
    const consumed = currentPage * PAGE_SIZE;
    if (consumed + PAGE_SIZE >= loaded) {
      void activeConn.fetchNextPage();
    }
  }, [activeConn, visiblePubkeys.length, currentPage, PAGE_SIZE]);

  const visiblePubkeyPage = useMemo(() => {
    // Use server-side counts as the source of truth for totalPages so the
    // pager can advance past what's currently loaded — fetchNextPage is
    // triggered above when the user approaches the loaded boundary.
    // Server returns the filtered total on every page — read it from page 1.
    // Falls back to overview/stats only when no fetch has landed yet.
    const hasSearch = !!searchFilter.trim();
    const serverFilteredTotal: number | undefined = (
      activeConn?.data?.pages?.[0] as any
    )?.data?.total;
    const activeServerCount = hasSearch
      ? visiblePubkeys.length
      : (serverFilteredTotal ??
        (activeGroup === "flagged"
          ? (overviewQuery.data?.data?.flagged_count ?? 0)
          : verifiedOnly
            ? (statsQuery.data?.data?.[activeGroup]?.verified ?? 0)
            : ((overviewQuery.data?.data?.counts as any)?.[activeGroup] ?? 0)));
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
  }, [
    currentPage,
    visiblePubkeys,
    loadedCount,
    trustLoadedCount,
    searchFilter,
    trustFilter,
    verifiedOnly,
    activeGroup,
    overviewQuery.data,
    statsQuery.data,
    activeConn?.data?.pages,
  ]);

  useEffect(() => {
    const pageItems = visiblePubkeyPage.items;
    if (pageItems.length > 0) {
      fetchProfilesCallback(pageItems);
      fetchTrustScores(pageItems);
    }
    if (visiblePubkeyPage.nextPage) {
      if (visiblePubkeyPage.nextPage.items.length > 0) {
        fetchProfilesCallback(visiblePubkeyPage.nextPage.items);
        fetchTrustScores(visiblePubkeyPage.nextPage.items);
      }
    }

    const muterReporterPks = new Set<string>();
    for (const pk of pageItems) {
      const gData = graphDataCache.current.get(pk);
      if (!gData) continue;
      for (const m of gData.muted_by || []) {
        if (!trustCache.current.has(m)) muterReporterPks.add(m);
      }
      for (const r of gData.reported_by || []) {
        if (!trustCache.current.has(r)) muterReporterPks.add(r);
      }
    }
    if (muterReporterPks.size > 0) {
      fetchTrustScores(Array.from(muterReporterPks));
    }
  }, [visiblePubkeyPage]);

  if (!user) return null;

  if (!calcDone && !grapeRankLoading) {
    return (
      <div
        className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4"
        data-testid="page-network-gate"
      >
        <div className="max-w-md w-full text-center">
          <div className="mb-6 flex justify-center">
            <BrainLogo size={64} className="text-indigo-400 animate-pulse" />
          </div>
          <h1
            className="text-2xl font-bold text-white mb-3"
            data-testid="text-network-gate-title"
          >
            Your network is being calculated
          </h1>
          <p
            className="text-slate-400 mb-8 text-sm leading-relaxed"
            data-testid="text-network-gate-description"
          >
            We're crunching the numbers on your social graph. Once the
            calculation completes, you'll be able to explore your full network
            here.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back-to-dashboard"
          >
            <Home className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!user || isAuthRedirecting()) return null;

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden"
      data-testid="page-network"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.28] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/30 blur-[130px]"
          style={{ animation: "networkBlobA 28s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/20 blur-[150px]"
          style={{ animation: "networkBlobB 32s ease-in-out infinite 2s" }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/15 blur-[110px]"
          style={{ animation: "networkBlobC 24s ease-in-out infinite 5s" }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-[600px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute inset-0 w-full h-full">
          {connectionPairs.map(([a, b], i) => (
            <line
              key={i}
              x1={`${floatingNodes[a].x}%`}
              y1={`${floatingNodes[a].y}%`}
              x2={`${floatingNodes[b].x}%`}
              y2={`${floatingNodes[b].y}%`}
              stroke="url(#networkLineGrad)"
              strokeWidth="0.5"
              strokeDasharray={connectionLineDashArrays[i]}
              strokeDashoffset={connectionLineDashArrays[i]}
              style={connectionLineStyles[i]}
            />
          ))}
          <defs>
            <linearGradient
              id="networkLineGrad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.14" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node, i) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white/80 border border-slate-200/40"
            style={floatingNodeStyles[i]}
          />
        ))}
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
        {decorativeText.map((text, i) => (
          <div
            key={i}
            className="absolute text-xs font-mono text-indigo-400/50 select-none whitespace-nowrap"
            style={decorativeTextStyles[i]}
            data-testid={`text-network-bg-decorative-${i}`}
          >
            {text}
          </div>
        ))}
      </div>

      <AppHeader
        user={user}
        onLogout={handleLogout}
        calcDone={calcDone}
        active="network"
      />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="space-y-8 animate-fade-up">
          <div
            className="text-left relative z-10 mb-8 pt-2"
            data-testid="section-network-header"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />
            <div className="flex flex-col items-start gap-3">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm"
                data-testid="pill-network-kicker"
              >
                <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
                <span className="text-xs font-bold tracking-[0.15em] text-indigo-900 uppercase">
                  Network Explorer
                </span>
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight relative"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-network-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block">
                  Your Network
                </span>
              </h1>
              <p
                className="text-slate-500 text-xs md:text-sm max-w-xl leading-relaxed font-light"
                data-testid="text-network-subtitle"
              >
                Browse and manage your social graph connections.
              </p>
            </div>
          </div>

          <Card
            className="bg-white/90 backdrop-blur-xl border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.07)] overflow-hidden rounded-xl relative"
            data-testid="card-network-filters"
          >
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />

            <CardHeader className="relative bg-gradient-to-b from-indigo-500/15 to-white/60 border-b border-indigo-500/10 py-4 px-5">
              {/* Title row — shared across mobile and desktop */}
              <div className="flex items-center justify-between gap-3 pr-20 sm:pr-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-sm text-indigo-800 ring-1 ring-slate-100 shrink-0">
                    <Filter className="h-4 w-4" />
                  </div>
                  <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-100 shadow-sm min-w-0">
                    <CardTitle
                      className="text-sm font-bold text-slate-800 tracking-tight"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Network Filters
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                      Social Graph
                    </CardDescription>
                  </div>
                </div>
                {/* Desktop: Verified + NOSTR inline on the right */}
                <div className="hidden sm:flex items-center gap-3 shrink-0">
                  <label
                    className="flex items-center gap-2 cursor-pointer select-none"
                    data-testid="toggle-verified-only"
                  >
                    <Switch
                      checked={verifiedOnly}
                      onCheckedChange={(checked) => {
                        setVerifiedOnly(checked);
                        setCurrentPage(1);
                      }}
                      className="data-[state=checked]:bg-indigo-600"
                      data-testid="switch-verified-only"
                    />
                    <span
                      className={`text-xs font-semibold transition-colors ${verifiedOnly ? "text-indigo-700" : "text-slate-400"}`}
                    >
                      Verified
                    </span>
                  </label>
                  <div
                    className="px-2 py-1 rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-900 border border-indigo-500/20 uppercase tracking-wider flex items-center gap-1.5 shrink-0"
                    data-testid="badge-nostr-network"
                  >
                    <img
                      src="/nostr-ostrich.gif"
                      alt=""
                      className="h-4 w-4 object-contain"
                      aria-hidden="true"
                    />
                    <span>NOSTR</span>
                  </div>
                </div>
              </div>

              {/* Mobile: NOSTR badge pinned to top-right corner */}
              <div
                className="sm:hidden absolute top-4 right-5 px-2 py-1 rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-900 border border-indigo-500/20 uppercase tracking-wider flex items-center gap-1.5"
                data-testid="badge-nostr-network-mobile"
              >
                <img
                  src="/nostr-ostrich.gif"
                  alt=""
                  className="h-4 w-4 object-contain"
                  aria-hidden="true"
                />
                <span>NOSTR</span>
              </div>

              {/* Mobile: Verified toggle — full-width settings-style row */}
              <div className="sm:hidden mt-3">
                <label
                  className="flex items-center justify-between gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100"
                  data-testid="toggle-verified-only-mobile"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 transition-colors ${verifiedOnly ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"}`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold transition-colors ${verifiedOnly ? "text-indigo-700" : "text-slate-600"}`}
                      >
                        Verified
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight">
                        Show only WoT-verified accounts
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={verifiedOnly}
                    onCheckedChange={(checked) => {
                      setVerifiedOnly(checked);
                      setCurrentPage(1);
                    }}
                    className="data-[state=checked]:bg-indigo-600 shrink-0"
                    data-testid="switch-verified-only-mobile"
                  />
                </label>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-5 bg-white/60 space-y-2 sm:space-y-3">
              {/* Mobile dropdowns — hidden on sm+ */}
              <div className="sm:hidden flex gap-2">
                <div className="flex-1 min-w-0">
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">
                    <Network className="h-3 w-3" />
                    Graph
                  </label>
                  <select
                    value={activeGroup}
                    onChange={(e) => {
                      setActiveGroup(e.target.value as GroupKey);
                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white/90 text-slate-700 text-xs font-medium px-2.5 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 shadow-sm"
                    data-testid="select-group-filter-mobile"
                  >
                    {(
                      [
                        "followed_by",
                        "following",
                        "muted_by",
                        "muting",
                        "reported_by",
                        "reporting",
                      ] as GroupKey[]
                    ).map((k) => {
                      const group = groups.find((g) => g.key === k);
                      if (!group) return null;
                      const count = getGroupCount(group.key);
                      return (
                        <option key={k} value={k}>
                          {group.label} — {count}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">
                    <ShieldCheck className="h-3 w-3" />
                    Trust
                  </label>
                  <select
                    value={trustFilter}
                    onChange={(e) => {
                      setTrustFilter(e.target.value as TrustTier);
                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white/90 text-slate-700 text-xs font-medium px-2.5 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 shadow-sm"
                    data-testid="select-trust-filter-mobile"
                  >
                    <option value="all">All</option>
                    <option value="high">Highly Trusted</option>
                    <option value="medium">Trusted</option>
                    <option value="neutral">Neutral</option>
                    <option value="low">Low Trust</option>
                    <option value="unverified">Unverified</option>
                    {getGroupPubkeys("flagged").length > 0 && (
                      <option value="flagged">Flagged</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Desktop pill rows — hidden on mobile */}
              <div>
                <div
                  className="hidden sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2"
                  data-testid="row-group-filters-graph"
                >
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider self-center shrink-0 pr-2 mr-1 border-r border-slate-200/60">
                    Graph
                  </span>
                  {(
                    [
                      "followed_by",
                      "following",
                      "muted_by",
                      "muting",
                      "reported_by",
                      "reporting",
                    ] as GroupKey[]
                  ).map((k) => {
                    const group = groups.find((g) => g.key === k);
                    if (!group) return null;
                    const count = getGroupCount(group.key);
                    const totalCount =
                      (overviewQuery.data?.data?.counts as any)?.[group.key] ??
                      0;
                    const isActive = activeGroup === group.key;
                    const showVerified =
                      verifiedOnly && isVerifiableGroup(group.key);
                    return (
                      <UITooltip key={group.key} delayDuration={500}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGroup(group.key);
                              setCurrentPage(1);
                            }}
                            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                              isActive
                                ? "bg-indigo-800 text-white border border-indigo-800"
                                : "bg-white/60 border border-slate-200/60 text-slate-600 hover:bg-white hover:border-slate-300"
                            }`}
                            data-testid={`button-filter-${group.key}`}
                          >
                            <group.Icon
                              className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : group.color}`}
                            />
                            <span>{group.shortLabel}</span>
                            <span
                              className={`text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                isActive
                                  ? "bg-white/20 text-white"
                                  : `${group.bgColor} ${group.color} ${group.borderColor} border`
                              }`}
                            >
                              {showVerified ? `${count}/${totalCount}` : count}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className={`bg-white backdrop-blur-xl border border-slate-300 text-slate-700 shadow-lg px-2.5 py-1.5 max-w-[220px] border-l-2 ${group.tooltipAccent}`}
                        >
                          <p className="text-xs font-medium">{group.tooltip}</p>
                          {showVerified && totalCount !== count && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {count} verified of {totalCount} total
                            </p>
                          )}
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </div>
              </div>

              <div className="hidden sm:block border-t border-slate-200/60 my-0.5" />

              <div
                className="hidden sm:flex sm:flex-wrap gap-1.5 sm:gap-2"
                data-testid="row-trust-filters"
              >
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider self-center mr-1 shrink-0 pr-2 border-r border-slate-200/60">
                  Trust
                </span>
                {(
                  [
                    {
                      key: "all" as TrustTier,
                      label: "All",
                      shortLabel: "All",
                      icon: null,
                      ringFill: 0,
                      tooltip: "Show all trust levels",
                    },
                    {
                      key: "high" as TrustTier,
                      label: "Highly Trusted",
                      shortLabel: "High",
                      icon: "text-emerald-600",
                      ringFill: 0.9,
                      tooltip: "Highest trust score in your network",
                    },
                    {
                      key: "medium" as TrustTier,
                      label: "Trusted",
                      shortLabel: "Med",
                      icon: "text-sky-500",
                      ringFill: 0.65,
                      tooltip: "Above-average trust score",
                    },
                    {
                      key: "neutral" as TrustTier,
                      label: "Neutral",
                      shortLabel: "Neutral",
                      icon: "text-indigo-400",
                      ringFill: 0.37,
                      tooltip: "Average trust score",
                    },
                    {
                      key: "low" as TrustTier,
                      label: "Low Trust",
                      shortLabel: "Low",
                      icon: "text-amber-500",
                      ringFill: 0.12,
                      tooltip: "Below-average trust score",
                    },
                    {
                      key: "unverified" as TrustTier,
                      label: "Unverified",
                      shortLabel: "Unverified",
                      icon: "text-zinc-400",
                      ringFill: 0,
                      tooltip: "No trust score calculated yet",
                    },
                    {
                      key: "flagged" as TrustTier,
                      label: "Flagged",
                      shortLabel: "Flagged",
                      icon: "flagged",
                      ringFill: 0,
                      tooltip:
                        "Low trust accounts reported by 2+ of your trusted contacts",
                    },
                  ] as const
                ).map((tier) => {
                  const isActive = trustFilter === tier.key;
                  return (
                    <UITooltip key={tier.key} delayDuration={500}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            setTrustFilter(tier.key);
                            setCurrentPage(1);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                            isActive
                              ? tier.key === "flagged"
                                ? "bg-red-600 text-white border border-red-600"
                                : "bg-indigo-800 text-white border border-indigo-800"
                              : tier.key === "flagged"
                                ? "bg-white/60 border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300"
                                : "bg-white/60 border border-slate-200/60 text-slate-500 hover:bg-white hover:border-slate-300"
                          }`}
                          data-testid={`button-trust-filter-${tier.key}`}
                        >
                          {tier.key === "flagged" ? (
                            <svg
                              className={`h-3 w-3 shrink-0 ${isActive ? "text-white" : "text-red-500"}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                              <line x1="4" y1="22" x2="4" y2="15" />
                            </svg>
                          ) : (
                            tier.icon &&
                            tier.icon !== "flagged" && (
                              <svg
                                className={`h-3 w-3 shrink-0 ${isActive ? "text-white" : tier.icon}`}
                                viewBox="0 0 44 44"
                              >
                                <circle
                                  cx="22"
                                  cy="22"
                                  r="18"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  opacity="0.3"
                                />
                                <circle
                                  cx="22"
                                  cy="22"
                                  r="18"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  style={{
                                    strokeDasharray: `${2 * Math.PI * 18}`,
                                    strokeDashoffset: `${2 * Math.PI * 18 * (1 - tier.ringFill)}`,
                                    transform: "rotate(-90deg)",
                                    transformOrigin: "center",
                                  }}
                                />
                              </svg>
                            )
                          )}
                          <span>
                            {tier.key === "all" ? tier.shortLabel : tier.label}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className={`bg-white backdrop-blur-xl border border-slate-300 border-l-2 ${tier.key === "flagged" ? "border-l-red-400" : "border-l-indigo-400"} text-slate-700 shadow-lg px-2.5 py-1.5`}
                      >
                        <p className="text-xs font-medium">{tier.tooltip}</p>
                      </TooltipContent>
                    </UITooltip>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <div className="relative group/input flex-1">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-indigo-800 rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500" />
                  <div className="relative flex items-center">
                    {searchLoading ? (
                      <Loader2 className="absolute left-3 h-4 w-4 text-indigo-500 z-10 animate-spin" />
                    ) : (
                      <SearchIcon className="absolute left-3 h-4 w-4 text-slate-400 z-10" />
                    )}
                    <Input
                      placeholder={
                        isLoading
                          ? "Loading your network…"
                          : "Search by name or npub..."
                      }
                      className={`relative bg-white/90 backdrop-blur-sm border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)] text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg transition-all text-sm shadow-sm pl-9 ${searchFilter ? "pr-9" : ""} ${isLoading || searchLoading ? "cursor-wait opacity-70" : ""}`}
                      value={searchFilter}
                      onChange={(e) => {
                        setSearchFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      disabled={isLoading || searchLoading}
                      aria-busy={isLoading || searchLoading}
                      data-testid="input-network-search"
                    />
                    {searchFilter && !isLoading && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchFilter("");
                          setCurrentPage(1);
                        }}
                        className="absolute right-2 z-10 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label="Clear search"
                        data-testid="button-clear-network-search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {searchFilter.trim().length >= 2 && searchLoading && (
                    <p
                      className="mt-1 ml-1 text-[11px] text-indigo-500/80 flex items-center gap-1.5"
                      role="status"
                      aria-live="polite"
                      data-testid="text-network-search-loading"
                    >
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading profiles to search across this group…
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/80 border border-slate-200/60 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors shrink-0"
                    onClick={() => {
                      setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
                      setCurrentPage(1);
                    }}
                    data-testid="button-sort-trust"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Trust {sortDirection === "desc" ? "↓" : "↑"}</span>
                  </button>
                  <div
                    className="flex items-center bg-white/80 border border-slate-200/60 rounded-lg p-0.5 shrink-0"
                    data-testid="row-view-toggle"
                  >
                    <button
                      type="button"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-indigo-800 text-white" : "text-slate-400"}`}
                      onClick={() => setViewMode("grid")}
                      data-testid="button-view-grid"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-indigo-800 text-white" : "text-slate-400"}`}
                      onClick={() => setViewMode("list")}
                      data-testid="button-view-list"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ||
          (activeConn?.isFetching && visiblePubkeys.length === 0) ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              data-testid="grid-network-skeleton"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4 animate-pulse"
                  data-testid={`skeleton-card-${i}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-200 rounded w-24" />
                      <div className="h-2 bg-slate-100 rounded w-32" />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    <div className="h-4 bg-slate-100 rounded w-14" />
                    <div className="h-4 bg-slate-100 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : visiblePubkeys.length === 0 ? (
            <Card
              className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden"
              data-testid="card-network-empty"
            >
              <div className="p-8 flex flex-col items-center text-center">
                <div className="h-14 w-14 rounded-2xl border border-slate-200 bg-slate-50 text-indigo-800 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6" />
                </div>
                <h3
                  className="text-lg font-bold text-slate-900 tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-network-empty-title"
                >
                  {searchFilter || trustFilter !== "all"
                    ? "No matches found"
                    : "No contacts yet"}
                </h3>
                <p
                  className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md"
                  data-testid="text-network-empty-body"
                >
                  {searchFilter || trustFilter !== "all"
                    ? "Try a different search term, trust score range, or group filter."
                    : "Your network data will appear here once your social graph is populated."}
                </p>
              </div>
            </Card>
          ) : (
            <>
              {(() => {
                return (
                  <>
                    <NetworkCardActionsProvider value={cardActions}>
                      <NetworkCardViewProvider value={cardView}>
                        <div
                          className={`${viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"} transition-opacity duration-150 ${activeConn?.isFetching ? "opacity-60" : "opacity-100"}`}
                          data-testid="grid-network-profiles"
                        >
                          {visiblePubkeyPage.items.map((pk) => (
                            <div
                              key={pk}
                              className={viewMode === "grid" ? "contents" : ""}
                            >
                              <NetworkProfileCard
                                pk={pk}
                                profile={profileCache.current.get(pk)}
                                trustScore={trustCache.current.get(pk)}
                                graphData={graphDataCache.current.get(pk)}
                                detail={
                                  expandedPubkey === pk
                                    ? expandedDetailGraph
                                    : undefined
                                }
                                stats={
                                  expandedPubkey === pk
                                    ? expandedStats
                                    : undefined
                                }
                                isExpanded={expandedPubkey === pk}
                                isCopied={copiedPubkey === pk}
                                isProfileLoaded={profileCache.current.has(pk)}
                                profileAttempted={profileAttempted.current.has(
                                  pk,
                                )}
                                expandedLoading={
                                  expandedPubkey === pk && expandedIsLoading
                                }
                                isSelf={user?.pubkey === pk}
                                isFollowingUser={social.isFollowing(pk)}
                                isMutedUser={social.isMuted(pk)}
                                isFlagged={
                                  groupPubkeySets?.flagged?.has(pk) ?? false
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </NetworkCardViewProvider>
                    </NetworkCardActionsProvider>

                    <div
                      className="flex items-center justify-between gap-4 pt-4"
                      data-testid="row-pagination"
                    >
                      <span className="text-xs text-slate-500">
                        {visiblePubkeyPage.startIdx + 1}&ndash;
                        {visiblePubkeyPage.nextItemStart} of{" "}
                        {visiblePubkeyPage.totalItems}
                      </span>
                      {visiblePubkeyPage.totalPages > 1 && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={visiblePubkeyPage.safePage <= 1}
                            onClick={() => {
                              setCurrentPage(visiblePubkeyPage.safePage - 1);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            data-testid="button-page-prev"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Previous
                          </Button>
                          <span
                            className="text-xs font-medium text-slate-600 tabular-nums px-2"
                            data-testid="text-page-indicator"
                          >
                            {visiblePubkeyPage.safePage} /{" "}
                            {visiblePubkeyPage.totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={
                              visiblePubkeyPage.safePage >=
                              visiblePubkeyPage.totalPages
                            }
                            onClick={() => {
                              setCurrentPage(visiblePubkeyPage.safePage + 1);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            data-testid="button-page-next"
                          >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </main>

      <style>{`
        @keyframes networkBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(15px) scale(1.03); }
        }
        @keyframes networkBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-20px) scale(1.05); }
        }
        @keyframes networkBlobC {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-25px); opacity: 0.35; }
        }
        @keyframes networkLineDraw {
          0% { stroke-dashoffset: var(--dash); opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0.18; }
        }
        @keyframes networkLinePulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.2; }
        }
        @keyframes networkNodePop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 0.25; transform: scale(1.15); }
          100% { opacity: 0.18; transform: scale(1); }
        }
        @keyframes networkNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-12px); opacity: 0.25; }
        }
        @keyframes networkCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          20%, 80% { opacity: 0.45; transform: translateY(-6px); }
        }
      `}</style>
      <Footer />
    </div>
  );
}
