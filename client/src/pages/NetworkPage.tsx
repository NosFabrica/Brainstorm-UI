import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { AppHeader } from "@/components/AppHeader";
import { CalculatingNotice } from "@/components/CalculatingNotice";
import { GlossBackground } from "@/components/GlossBackground";
import { PageHeader } from "@/components/PageHeader";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { fetchProfiles, eventStore } from "@/services/nostr";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { getProfileContent, isValidProfile, type ProfileContent } from "applesauce-core/helpers/profile";
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
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { useHasSession } from "@/hooks/useHasSession";
import { PovToggle, TrustScoreModal, useScorePov } from "@/components/score/TrustScorePov";
import { networkPerspective } from "@/lib/networkPerspective";
import { presetDisplayLabel } from "@/services/trustThreshold";
import { UNKNOWN_EXPLAINER, ladderFor } from "@/lib/trustLadder";

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
  const user = useActiveAccountDisplay();

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
    return group && validGroups.includes(group as GroupKey) ? (group as GroupKey) : "followed_by";
  });
  // Mirror activeGroup into a ref so cards can read it lazily inside their
  // "view full profile" navigate handler without re-rendering on every change.
  const activeGroupRef = useRef(activeGroup);
  activeGroupRef.current = activeGroup;
  const [searchFilter, setSearchFilter] = useState("");
  type TrustTier =
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
  const [trustFilter, setTrustFilter] = useState<TrustTier>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("trust");
    const valid: TrustTier[] = ["verified", "high", "medium", "neutral", "low", "unverified", "flagged"];
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
  const [granularity] = useTierGranularity();
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
  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
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

  const profileCache = useRef<Map<string, ProfileContent>>(new Map());
  // Pubkeys we've already tried to fetch a kind-0 profile for (whether or not
  // one came back). Lets a row fall back to its npub instead of an endless
  // skeleton when no profile exists. See the gate in NetworkProfileCard.
  const profileAttempted = useRef<Set<string>>(new Set());
  const trustCache = useRef<Map<string, number | null>>(new Map());
  const graphDataCache = useRef<Map<string, { muted_by?: string[]; reported_by?: string[] }>>(new Map());
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
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const { preset: trustPreset } = useTrustPresetSync(!!user);

  // Whose scores this page shows (lib/networkPerspective): the reader's own when
  // they chose it and have a calculation, else Brainstorm's — the rule the profile
  // connection lists follow. Said under the title; every read below asks for it.
  const signedIn = useHasSession();
  const { pov: scorePov } = useScorePov();
  const perspective = networkPerspective({ signedIn, calcDone, scorePov });
  const house = perspective.house;
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);

  const overviewQuery = useSelfOverview(user?.pubkey, { house });
  // Preset-driven server-side, so nothing preset-shaped rides the queryKey —
  // a preset change invalidates instead (`invalidatePresetDrivenReads`).
  const statsQuery = useSelfStats(user?.pubkey, { house });

  // Track which kinds the user has visited so each kind only fetches once mounted.
  // "flagged" is a derived view that scopes to currently-loaded sections — it
  // does NOT trigger any fetch itself.
  const [loadedKinds, setLoadedKinds] = useState<Set<GroupKey>>(new Set());

  // Map UI trust filter to backend tier param. Backend uses the GR
  // `count_values` naming (medium_high / medium / medium_low / low /
  // low_and_reported_by_2_or_more_trusted_pubkeys); FE UI names differ.
  // When activeGroup is the derived "flagged" view, drop filters so the
  // cross-kind flag derivation sees unfiltered loaded items.
  // The trust filters: this page's own filter keys, each wearing the ladder rung it
  // selects. "All" has no colour. The keys stay the page's vocabulary; the words and
  // colours are the ladder's, so a rename there is a rename here.
  const trustFilterChoices = useMemo((): { key: TrustTier; label: string; color: string | null; tooltip: string }[] => {
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
  }, [granularity]);

  const isFlaggedView = activeGroup === "flagged";
  const UI_TO_GR_TIER: Record<string, NonNullable<Parameters<typeof useSelfConnections>[2]>["tier"]> = {
    high: "high",
    medium: "medium_high",
    neutral: "medium",
    low: "medium_low",
    unverified: "low",
    flagged: "low_and_reported_by_2_or_more_trusted_pubkeys",
  };
  const mappedTier =
    isFlaggedView || trustFilter === "all" || trustFilter === "verified"
      ? undefined
      : UI_TO_GR_TIER[trustFilter as keyof typeof UI_TO_GR_TIER];
  // `verified_only` filters on the preset's cutoff for that section, so the
  // list and the stats-derived header count agree by construction.
  const filterOpts = {
    order: sortDirection,
    house,
    tier: mappedTier,
    verifiedOnly: !isFlaggedView && (verifiedOnly || trustFilter === "verified") && mappedTier === undefined,
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
  // Filters don't apply — the flagged predicate is fixed (and preset-driven on
  // the server, since the line it sits below is the preset's).
  const flaggedConn = useSelfConnections(user?.pubkey, "flagged", {
    enabled: loadedKinds.has("flagged"),
    order: sortDirection,
    house,
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
    setLoadedKinds((prev) => (prev.has(activeGroup) ? prev : new Set([...prev, activeGroup])));
  }, [activeGroup]);

  // Overall load gate: loading only while overview is in-flight. Connection
  // queries are per-section and lazy; their loading state is surfaced by the
  // per-section UI, not by this top-level flag.
  const isLoading = overviewQuery.isLoading;

  useMemo(() => {
    const allGroups: GroupKey[] = ["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"];
    for (const groupKey of allGroups) {
      const items = networkData[groupKey];
      if (!items || items.length === 0) continue;
      const influenceMap = toInfluenceMap(items);
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

  const fetchTrustScores = useCallback(
    async (pubkeys: string[]) => {
      const unfetched = pubkeys.filter((pk) => !trustCache.current.has(pk));
      if (unfetched.length === 0) {
        return;
      }
      const batchSize = 8;
      for (let i = 0; i < unfetched.length; i += batchSize) {
        const batch = unfetched.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (pk) => {
            const res = await apiClient.getUserByPubkey(pk, { house });
            return res?.data ?? null;
          }),
        );
        results.forEach((res, idx) => {
          const pk = batch[idx];
          if (res.status === "fulfilled") {
            const graph = res.value?.graph ?? res.value;
            const influence = graph?.influence;
            trustCache.current.set(pk, typeof influence === "number" ? influence : null);
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
    },
    [house],
  );

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
  const expandedIsLoading = !!expandedPubkey && expandedDetailQuery.isFetching && expandedDetailQuery.data == null;

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
    queryKey: ["profile-stats", (expandedPubkey ?? "").toLowerCase(), trustPreset, house],
    queryFn: async () => {
      const res = await apiClient.getUserStats(expandedPubkey!, { house });
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
        // Read the server's bucket rather than re-deriving it from a line.
        if (item.tier === "low_and_reported_by_2_or_more_trusted_pubkeys") {
          set.add(item.pubkey);
        }
      }
    }
    return set;
  }, [networkData]);

  const getGroupPubkeys = useCallback(
    (key: GroupKey): string[] => {
      if (!networkData) return [];
      return toPubkeys(networkData[key]);
    },
    [networkData],
  );

  const groupPubkeySets = useMemo(() => {
    if (!networkData) return null;
    const sets = {} as Record<GroupKey, Set<string>>;
    (["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).forEach((k) => {
      sets[k] = new Set(toPubkeys(networkData[k]));
    });
    sets["flagged"] = flaggedPubkeySet;
    return sets;
  }, [networkData, flaggedPubkeySet]);

  const getPubkeyGroups = useCallback(
    (pubkey: string): GroupKey[] => {
      if (!groupPubkeySets) return [];
      const memberOf: GroupKey[] = [];
      (["followed_by", "following", "muted_by", "muting", "reported_by", "reporting", "flagged"] as GroupKey[]).forEach(
        (k) => {
          if (groupPubkeySets[k].has(pubkey)) {
            memberOf.push(k);
          }
        },
      );
      return memberOf;
    },
    [groupPubkeySets],
  );

  const isVerifiableGroup = (_key: GroupKey) => true;

  const getGroupCount = useCallback(
    (key: GroupKey): number => {
      // "flagged" comes from overview.flagged_count (DISTINCT across all
      // relationships, computed server-side).
      if (key === "flagged") return overviewQuery.data?.data?.flagged_count ?? 0;
      // Always source section header counts from overview/stats (server-side
      // totals), independent of whether the section's items have been fetched.
      const counts = overviewQuery.data?.data?.counts;
      const stats = statsQuery.data?.data;
      if (verifiedOnly && isVerifiableGroup(key)) {
        return stats?.[key]?.verified ?? 0;
      }
      return counts?.[key] ?? 0;
    },
    [verifiedOnly, overviewQuery.data, statsQuery.data],
  );

  const filteredPubkeys = useCallback(() => {
    // tier + verified-only are applied server-side via the `tier` /
    // `verified_only` query params on /connections — see filterOpts above.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadedCount re-runs search as profileCache fills
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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- counter, not a DOM ref; bump invalidates in-flight search
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
      await copyToClipboard(npub);
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
      if (result.cancelled) return result;
      if (result.success) toast({ title: "Followed", description: "Added to your contact list" });
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
      if (result.cancelled) return result;
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
      if (result.cancelled) return result;
      if (result.success) toast({ title: "Muted", description: "Added to your mute list" });
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
      if (result.cancelled) return result;
      if (result.success) toast({ title: "Unmuted", description: "Removed from your mute list" });
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
      pov: perspective.pov,
    }),
    [viewMode, social.isAnyPending, social.listsLoading, perspective.pov],
  );

  // Items arrive from the backend already in the requested order (the `order`
  // query param drives ORDER BY in /connections). No client-side re-sort.
  const visiblePubkeys = useMemo(
    () => filteredPubkeys(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extra deps bust the memo when ref-backed caches fill
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
      activeConn?.data?.pages?.[0] as { data?: { total?: number } } | undefined
    )?.data?.total;
    const activeServerCount = hasSearch
      ? visiblePubkeys.length
      : (serverFilteredTotal ??
        (activeGroup === "flagged"
          ? (overviewQuery.data?.data?.flagged_count ?? 0)
          : verifiedOnly
            ? (statsQuery.data?.data?.[activeGroup]?.verified ?? 0)
            : (overviewQuery.data?.data?.counts?.[activeGroup] ?? 0)));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extra deps bust the memo when ref-backed caches fill
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on page change only; fetchers are cache-guarded
  }, [visiblePubkeyPage]);

  if (!user) return null;

  if (!calcDone && !grapeRankLoading) {
    return (
      // Same page shell tokens as the real view below. The old gate hardcoded
      // bg-slate-950 + text-white with NO light variant, so a light-mode user got a
      // black full-screen page. It also returned before the header rendered, which
      // left "Back to Dashboard" as the only way out — and the dashboard is itself
      // a waiting screen, so a new user just bounced between two of them.
      <div
        className="flex min-h-page flex-col bg-[#F8FAFC] font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100"
        data-testid="page-network-gate"
      >
        <AppHeader user={user} onLogout={handleLogout} active="network" />
        {/* Top-aligned on a phone (where the viewport is mostly filled anyway), but
            vertically centred from sm: up — on a tall desktop window a short block
            pinned to the top left the page looking truncated rather than composed.
            pb-24 offsets the optical weight of the header so it centres on the eye,
            not the box. */}
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-start px-4 py-10 sm:justify-center sm:px-6 sm:pb-24">
          <h1
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="text-network-gate-title"
          >
            Your network is being mapped
          </h1>
          <p
            className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400"
            data-testid="text-network-gate-description"
          >
            Trust tiers, extended reach and network health all need your scores. They'll appear here as soon as the
            first calculation lands.
          </p>
          <div className="mt-5">
            {/* The one shared way the app states this — same component the dashboard
                uses, so the wait looks like one product rather than three screens. */}
            <CalculatingNotice standalone className="" searchHint>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                  data-testid="button-network-gate-search"
                >
                  <SearchIcon className="h-3.5 w-3.5" /> Search Brainstorm
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  data-testid="button-back-to-dashboard"
                >
                  <Home className="h-3.5 w-3.5" /> Dashboard
                </button>
              </div>
            </CalculatingNotice>
          </div>
        </main>
      </div>
    );
  }

  if (!user || isAuthRedirecting()) return null;

  return (
    <div
      className="relative flex min-h-page flex-col overflow-clip bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-network"
    >
      <GlossBackground />

      <AppHeader
        user={user}
        onLogout={handleLogout}

        active="network"
      />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <DeferredSessionNotice className="mb-8" />
        <div className="animate-fade-up space-y-8">
          <div className="relative z-10 mb-8 pt-2 text-left" data-testid="section-network-header">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[100%] w-[100%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary/5 blur-[60px] will-change-transform" />
            <PageHeader
              kicker="Network Explorer"
              title={
                <>
                  Your <span className="text-brand-link">Network</span>
                </>
              }
              subtitle="Browse and manage your social graph connections."
              testId="section-network-header"
            />
            {/* Whose scores these are, said once where every row's ring and coin follow it. */}
            <div
              className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600 dark:text-slate-300"
              data-testid="network-perspective"
            >
              <span>
                {perspective.label}
                {trustPreset && (
                  <span className="text-slate-400 dark:text-slate-500">
                    {" "}
                    · {presetDisplayLabel(trustPreset)} preset
                  </span>
                )}
              </span>
              <PovToggle canPersonalize={perspective.canPersonalize} avatarUrl={user?.picture} className="shrink-0" />
              <button
                type="button"
                onClick={() => setScoreExplainOpen(true)}
                className="text-xs font-medium text-brand-link hover:underline"
                data-testid="network-perspective-explain"
              >
                What is this?
              </button>
            </div>
            <TrustScoreModal open={scoreExplainOpen} onOpenChange={setScoreExplainOpen} />
          </div>

          <Card
            className="relative overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
            data-testid="card-network-filters"
          >
            <CardHeader className="relative border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              {/* Title row — shared across mobile and desktop */}
              <div className="flex items-center justify-between gap-3 pr-20 sm:pr-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 rounded-lg border border-slate-100 bg-white p-2 text-brand-primary shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:text-brand-link dark:shadow-none dark:ring-slate-800/60">
                    <Filter className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 rounded-2xl border border-slate-100 bg-white/50 px-4 py-2 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/50">
                    <CardTitle
                      className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Network Filters
                    </CardTitle>
                    <CardDescription className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Social Graph
                    </CardDescription>
                  </div>
                </div>
                {/* Desktop: Verified + NOSTR inline on the right */}
                <div className="hidden shrink-0 items-center gap-3 sm:flex">
                  <label
                    className="flex cursor-pointer select-none items-center gap-2"
                    data-testid="toggle-verified-only"
                  >
                    <Switch
                      checked={verifiedOnly}
                      onCheckedChange={(checked) => {
                        setVerifiedOnly(checked);
                        setCurrentPage(1);
                      }}
                      className="data-[state=checked]:bg-brand-primary"
                      data-testid="switch-verified-only"
                    />
                    <span
                      className={`text-xs font-semibold transition-colors ${verifiedOnly ? "text-brand-primary dark:text-brand-link" : "text-slate-400 dark:text-slate-500"}`}
                    >
                      Verified
                    </span>
                  </label>
                  <div
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-link"
                    data-testid="badge-nostr-network"
                  >
                    <img src="/nostr-ostrich.gif" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                    <span>NOSTR</span>
                  </div>
                </div>
              </div>

              {/* Mobile: NOSTR badge pinned to top-right corner */}
              <div
                className="absolute right-5 top-4 flex items-center gap-1.5 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-link sm:hidden"
                data-testid="badge-nostr-network-mobile"
              >
                <img src="/nostr-ostrich.gif" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                <span>NOSTR</span>
              </div>

              {/* Mobile: Verified toggle — full-width settings-style row */}
              <div className="mt-3 sm:hidden">
                <label
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl border border-brand-primary/15 bg-brand-primary/10 px-3 py-2.5 dark:border-brand-primary/25 dark:bg-brand-primary/10"
                  data-testid="toggle-verified-only-mobile"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={`shrink-0 rounded-lg p-1.5 transition-colors ${verifiedOnly ? "bg-brand-primary/15 text-brand-primary dark:bg-brand-primary/10 dark:text-brand-link" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"}`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold transition-colors ${verifiedOnly ? "text-brand-primary dark:text-brand-link" : "text-slate-600 dark:text-slate-300"}`}
                      >
                        Verified
                      </div>
                      <div className="text-[10px] leading-tight text-slate-400 dark:text-slate-500">
                        Show only verified accounts
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={verifiedOnly}
                    onCheckedChange={(checked) => {
                      setVerifiedOnly(checked);
                      setCurrentPage(1);
                    }}
                    className="shrink-0 data-[state=checked]:bg-brand-primary"
                    data-testid="switch-verified-only-mobile"
                  />
                </label>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 bg-white/60 p-3 dark:bg-slate-900/60 sm:space-y-3 sm:p-5">
              {/* Mobile dropdowns — hidden on sm+ */}
              <div className="flex gap-2 sm:hidden">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                    <Network className="h-3 w-3" />
                    Graph
                  </label>
                  <select
                    value={activeGroup}
                    onChange={(e) => {
                      setActiveGroup(e.target.value as GroupKey);
                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/20 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200"
                    data-testid="select-group-filter-mobile"
                  >
                    {(["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).map(
                      (k) => {
                        const group = groups.find((g) => g.key === k);
                        if (!group) return null;
                        const count = getGroupCount(group.key);
                        return (
                          <option key={k} value={k}>
                            {group.label} — {count}
                          </option>
                        );
                      },
                    )}
                  </select>
                </div>
                <div className="min-w-0 flex-1">
                  <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                    <ShieldCheck className="h-3 w-3" />
                    Trust
                  </label>
                  <select
                    value={trustFilter}
                    onChange={(e) => {
                      setTrustFilter(e.target.value as TrustTier);
                      setCurrentPage(1);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/20 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200"
                    data-testid="select-trust-filter-mobile"
                  >
                    {trustFilterChoices
                      .filter((c) => c.key !== "flagged" || getGroupPubkeys("flagged").length > 0)
                      .map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Desktop pill rows — hidden on mobile */}
              <div>
                {/* One row, whatever the counts: the pills grow from their natural width and
                    shrink together, the label truncating last. */}
                <div
                  className="hidden items-center gap-1.5 sm:flex sm:flex-nowrap"
                  data-testid="row-group-filters-graph"
                >
                  <span className="mr-1 shrink-0 self-center border-r border-slate-200/60 pr-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    Graph
                  </span>
                  {(["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).map(
                    (k) => {
                      const group = groups.find((g) => g.key === k);
                      if (!group) return null;
                      const count = getGroupCount(group.key);
                      const totalCount = overviewQuery.data?.data?.counts?.[group.key] ?? 0;
                      const isActive = activeGroup === group.key;
                      const showVerified = verifiedOnly && isVerifiableGroup(group.key);
                      return (
                        <UITooltip key={group.key} delayDuration={500}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveGroup(group.key);
                                setCurrentPage(1);
                              }}
                              className={`flex min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                                isActive
                                  ? "border border-brand-primary bg-brand-primary text-white"
                                  : "border border-slate-200/60 bg-white/60 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                              }`}
                              data-testid={`button-filter-${group.key}`}
                            >
                              {/* No icon: the words say which way the relationship runs, and the
                                  room goes to the verified/total count instead. */}
                              <span className="min-w-0 truncate">{group.shortLabel}</span>
                              <span
                                className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
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
                            className={`max-w-[220px] border border-l-2 border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${group.tooltipAccent}`}
                          >
                            <p className="text-xs font-medium">{group.tooltip}</p>
                            {showVerified && totalCount !== count && (
                              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {count} verified of {totalCount} total
                              </p>
                            )}
                          </TooltipContent>
                        </UITooltip>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="my-0.5 hidden border-t border-slate-200/60 dark:border-slate-800 sm:block" />

              {/* The trust filters in the ladder's own words and colours (lib/trustLadder),
                  the same ones the avatar rings and coins wear — one trust language on the
                  page, not a third set of hand-drawn rings. */}
              <div className="hidden gap-1.5 sm:flex sm:flex-wrap sm:gap-2" data-testid="row-trust-filters">
                <span className="mr-1 shrink-0 self-center border-r border-slate-200/60 pr-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  Trust
                </span>
                {trustFilterChoices.map((choice) => {
                  const isActive = trustFilter === choice.key;
                  return (
                    <UITooltip key={choice.key} delayDuration={500}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            setTrustFilter(choice.key);
                            setCurrentPage(1);
                          }}
                          aria-pressed={isActive}
                          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                            isActive
                              ? "border-brand-primary bg-brand-primary text-white"
                              : "border-slate-200/60 bg-white/60 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                          }`}
                          data-testid={`button-trust-filter-${choice.key}`}
                        >
                          {choice.color && (
                            <span
                              aria-hidden
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: choice.color }}
                            />
                          )}
                          <span>{choice.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="border border-l-2 border-slate-300 border-l-brand-primary bg-white px-2.5 py-1.5 text-slate-700 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <p className="text-xs font-medium">{choice.tooltip}</p>
                      </TooltipContent>
                    </UITooltip>
                  );
                })}
              </div>

              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="group/input relative flex-1">
                  <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary opacity-20 blur transition duration-500 group-hover/input:opacity-50" />
                  <div className="relative flex items-center">
                    {searchLoading ? (
                      <Loader2 className="absolute left-3 z-10 h-4 w-4 animate-spin text-brand-primary" />
                    ) : (
                      <SearchIcon className="absolute left-3 z-10 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    )}
                    <Input
                      placeholder={isLoading ? "Loading your network…" : "Search by name or npub..."}
                      className={`relative rounded-lg border-brand-primary/[0.3] bg-white/90 pl-9 text-sm text-slate-900 shadow-[0_0_10px_rgb(var(--brand-primary)/0.05)] shadow-sm backdrop-blur-sm transition-all placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:bg-slate-900/90 dark:text-slate-100 dark:placeholder:text-slate-500 ${searchFilter ? "pr-9" : ""} ${isLoading || searchLoading ? "cursor-wait opacity-70" : ""}`}
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
                        className="absolute right-2 z-10 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label="Clear search"
                        data-testid="button-clear-network-search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {searchFilter.trim().length >= 2 && searchLoading && (
                    <p
                      className="ml-1 mt-1 flex items-center gap-1.5 text-[11px] text-brand-primary/80"
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
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-primary/25 hover:text-brand-primary dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-brand-primary/[0.4] dark:hover:text-brand-link"
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
                    className="flex shrink-0 items-center rounded-lg border border-slate-200/60 bg-white/80 p-0.5 dark:border-slate-800 dark:bg-slate-900/80"
                    data-testid="row-view-toggle"
                  >
                    <button
                      type="button"
                      className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-brand-primary text-white" : "text-slate-400 dark:text-slate-500"}`}
                      onClick={() => setViewMode("grid")}
                      data-testid="button-view-grid"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-brand-primary text-white" : "text-slate-400 dark:text-slate-500"}`}
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

          {isLoading || (activeConn?.isFetching && visiblePubkeys.length === 0) ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="grid-network-skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-slate-200/60 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80"
                  data-testid={`skeleton-card-${i}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-2 w-32 rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    <div className="h-4 w-14 rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : visiblePubkeys.length === 0 ? (
            <Card
              className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
              data-testid="card-network-empty"
            >
              <div className="flex flex-col items-center p-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-brand-primary dark:border-slate-800 dark:bg-slate-900 dark:text-brand-link">
                  <Users className="h-6 w-6" />
                </div>
                <h3
                  className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-network-empty-title"
                >
                  {searchFilter || trustFilter !== "all" ? "No matches found" : "No contacts yet"}
                </h3>
                <p
                  className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                  data-testid="text-network-empty-body"
                >
                  {searchFilter || trustFilter !== "all"
                    ? "Try a different search term, Verification Score range, or group filter."
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
                          className={`${viewMode === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2"} transition-opacity duration-150 ${activeConn?.isFetching ? "opacity-60" : "opacity-100"}`}
                          data-testid="grid-network-profiles"
                        >
                          {visiblePubkeyPage.items.map((pk) => (
                            <div key={pk} className={viewMode === "grid" ? "contents" : ""}>
                              <NetworkProfileCard
                                pk={pk}
                                profile={profileCache.current.get(pk)}
                                trustScore={trustCache.current.get(pk)}
                                graphData={graphDataCache.current.get(pk)}
                                detail={expandedPubkey === pk ? expandedDetailGraph : undefined}
                                stats={expandedPubkey === pk ? expandedStats : undefined}
                                isExpanded={expandedPubkey === pk}
                                isCopied={copiedPubkey === pk}
                                isProfileLoaded={profileCache.current.has(pk)}
                                profileAttempted={profileAttempted.current.has(pk)}
                                expandedLoading={expandedPubkey === pk && expandedIsLoading}
                                isSelf={user?.pubkey === pk}
                                isFollowingUser={social.isFollowing(pk)}
                                isMutedUser={social.isMuted(pk)}
                                isFlagged={groupPubkeySets?.flagged?.has(pk) ?? false}
                              />
                            </div>
                          ))}
                        </div>
                      </NetworkCardViewProvider>
                    </NetworkCardActionsProvider>

                    <div className="flex items-center justify-between gap-4 pt-4" data-testid="row-pagination">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {visiblePubkeyPage.startIdx + 1}&ndash;
                        {visiblePubkeyPage.nextItemStart} of {visiblePubkeyPage.totalItems}
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
                            className="px-2 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300"
                            data-testid="text-page-indicator"
                          >
                            {visiblePubkeyPage.safePage} / {visiblePubkeyPage.totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={visiblePubkeyPage.safePage >= visiblePubkeyPage.totalPages}
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
      <Footer minimal />
    </div>
  );
}
