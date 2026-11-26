import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { AppHeader } from "@/components/AppHeader";
import { CalculatingNotice } from "@/components/CalculatingNotice";
import { GlossBackground } from "@/components/GlossBackground";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { Search as SearchIcon, Home } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchProfiles, eventStore } from "@/services/nostr";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { getProfileContent, isValidProfile, type ProfileContent } from "applesauce-core/helpers/profile";
import { isAuthRedirecting } from "@/services/api";
import {
  useSelfOverview,
  useSelfStats,
  useSelfConnections,
  flattenConnections,
  type ConnectionItem,
} from "@/hooks/useSelf";
import { grapeRankResultOptions } from "@/services/queries/graperank";
import { toPubkeys } from "../services/graphHelpers";
import { Footer } from "@/components/Footer";
import { useSocialActions } from "@/hooks/useSocialActions";
import { type GroupKey } from "@/components/network/networkGroups";
import { type NetworkCardActions, type NetworkCardView } from "@/components/network/cardContext";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { useHasSession } from "@/hooks/useHasSession";
import { useScorePov } from "@/components/score/TrustScorePov";
import { networkPerspective } from "@/lib/networkPerspective";
import { hasOwnScores, markOwnScores } from "@/lib/ownScores";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import { isProfileOverviewFresh, prefetchProfileOverview, useExpandedRow } from "./network/rowOverview";
import { useRowScores } from "./network/useRowScores";
import { useRowSocialActions } from "./network/useRowSocialActions";
import {
  connectionTier,
  groupFromSearch,
  pageWindow,
  trustFilterChoicesFor,
  trustFilterFromSearch,
  type TrustTier,
} from "./network/networkFilters";
import { NetworkHeader } from "./network/NetworkHeader";
import { NetworkFilters } from "./network/NetworkFilters";
import { NetworkEmpty, NetworkGrid, NetworkPager, NetworkSkeleton } from "./network/NetworkResults";

export default function NetworkPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();

  const [activeGroup, setActiveGroup] = useState<GroupKey>(() => groupFromSearch(window.location.search));
  // Mirror activeGroup into a ref so cards can read it lazily inside their
  // "view full profile" navigate handler without re-rendering on every change.
  const activeGroupRef = useRef(activeGroup);
  activeGroupRef.current = activeGroup;
  const [searchFilter, setSearchFilter] = useState("");
  const [trustFilter, setTrustFilter] = useState<TrustTier>(() => trustFilterFromSearch(window.location.search));
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("trust")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const [loadedCount, setLoadedCount] = useState(0);
  // Profiles arrive one by one, often dozens a frame, and `loadedCount` busts
  // three memos (the text filter among them): counted as they come, flushed
  // to state once a frame.
  const pendingLoaded = useRef(0);
  const loadedFrame = useRef<number | null>(null);
  const bumpLoaded = useCallback((n: number) => {
    pendingLoaded.current += n;
    if (loadedFrame.current !== null) return;
    loadedFrame.current = requestAnimationFrame(() => {
      loadedFrame.current = null;
      const add = pendingLoaded.current;
      pendingLoaded.current = 0;
      setLoadedCount((prev) => prev + add);
    });
  }, []);
  useEffect(
    () => () => {
      if (loadedFrame.current !== null) cancelAnimationFrame(loadedFrame.current);
    },
    [],
  );
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
  const social = useSocialActions(user?.pubkey);
  // Polled app-wide while a run is in flight (hooks/useScoringStatus), not here.
  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    ...grapeRankResultOptions(),
    enabled: !!user,
  });
  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  const hadPreviousCalc = useMemo(() => {
    if (calcDoneNow) {
      markOwnScores(user?.pubkey);
      return true;
    }
    return hasOwnScores(user?.pubkey);
  }, [calcDoneNow, user?.pubkey]);
  const calcDone = calcDoneNow || hadPreviousCalc;

  const PAGE_SIZE = 100;

  const profileCache = useRef<Map<string, ProfileContent>>(new Map());
  // Pubkeys we've already tried to fetch a kind-0 profile for (whether or not
  // one came back). Lets a row fall back to its npub instead of an endless
  // skeleton when no profile exists. See the gate in NetworkProfileCard.
  const profileAttempted = useRef<Set<string>>(new Set());
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

  const overviewQuery = useSelfOverview(user?.pubkey, { house });
  // Preset-driven server-side, so nothing preset-shaped rides the queryKey —
  // a preset change invalidates instead (`invalidatePresetDrivenReads`).
  const statsQuery = useSelfStats(user?.pubkey, { house });

  // Track which kinds the user has visited so each kind only fetches once mounted.
  // "flagged" is a derived view that scopes to currently-loaded sections — it
  // does NOT trigger any fetch itself.
  const [loadedKinds, setLoadedKinds] = useState<Set<GroupKey>>(new Set());

  const trustFilterChoices = useMemo(() => trustFilterChoicesFor(granularity), [granularity]);

  const isFlaggedView = activeGroup === "flagged";
  const mappedTier = connectionTier(trustFilter, isFlaggedView);
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

  const { trustCache, graphDataCache, trustLoadedCount, fetchTrustScores } = useRowScores(
    { house, viewer: user?.pubkey, preset: trustPreset },
    networkData,
  );

  const fetchProfilesCallback = useCallback(
    async (pubkeys: string[]) => {
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
        bumpLoaded(cached.length);
      }
      const batchSize = 400;
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        await fetchProfiles(batch, (pubkey, profile) => {
          profileCache.current.set(pubkey, profile);
          bumpLoaded(1);
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
        bumpLoaded(1);
      }
    },
    [bumpLoaded],
  );

  const toggleExpanded = useCallback((pk: string) => {
    // The actual fetch is driven by `expandedDetailQuery` below — useQuery
    // handles cached/stale/missing transitions and re-renders the panel
    // reactively when data lands. We just flip the expanded pubkey here.
    setExpandedPubkey((prev) => (prev === pk ? null : pk));
  }, []);

  const { expandedDetailGraph, expandedIsLoading, expandedStats } = useExpandedRow(expandedPubkey, house);

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

  // The active section's npubs, encoded once per list rather than once per row
  // per keystroke and per profile landing. Only while a text filter is on:
  // nothing else reads them.
  const searching = !!searchFilter.trim();
  const groupNpubs = useMemo(() => {
    const out = new Map<string, string>();
    if (!searching) return out;
    for (const pk of getGroupPubkeys(activeGroup)) out.set(pk, nip19.npubEncode(pk).toLowerCase());
    return out;
  }, [searching, activeGroup, getGroupPubkeys]);

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
        const npub = groupNpubs.get(pk) ?? nip19.npubEncode(pk).toLowerCase();
        if (npub.includes(query)) return true;
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
  }, [activeGroup, searchFilter, getGroupPubkeys, groupNpubs, loadedCount]);

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

  const { handleSocialFollow, handleSocialUnfollow, handleSocialMute, handleSocialUnmute } =
    useRowSocialActions(social);

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
      trustCache,
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
    return pageWindow(visiblePubkeys, activeServerCount, currentPage, PAGE_SIZE);
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
        <main
          className={cn(pageWidth("reading"), "flex flex-1 flex-col justify-start py-10 sm:justify-center sm:pb-24")}
        >
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

      <main className={cn(pageWidth("standard"), "relative z-10 py-12")}>
        <DeferredSessionNotice className="mb-8" />
        <div className="animate-fade-up space-y-8">
          <NetworkHeader
            perspective={perspective}
            trustPreset={trustPreset}
            countValues={grapeRankData?.data?.count_values}
            grapeRankLoading={grapeRankLoading}
          />

          <NetworkFilters
            verifiedOnly={verifiedOnly}
            setVerifiedOnly={setVerifiedOnly}
            setCurrentPage={setCurrentPage}
            pov={perspective.pov}
            activeGroup={activeGroup}
            setActiveGroup={setActiveGroup}
            getGroupCount={getGroupCount}
            overviewCounts={overviewQuery.data?.data?.counts}
            isVerifiableGroup={isVerifiableGroup}
            trustFilter={trustFilter}
            setTrustFilter={setTrustFilter}
            trustFilterChoices={trustFilterChoices}
            getGroupPubkeys={getGroupPubkeys}
            isLoading={isLoading}
            searchLoading={searchLoading}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />

          {isLoading || (activeConn?.isFetching && visiblePubkeys.length === 0) ? (
            <NetworkSkeleton />
          ) : visiblePubkeys.length === 0 ? (
            <NetworkEmpty filtered={!!searchFilter || trustFilter !== "all"} />
          ) : (
            <>
              <NetworkGrid
                cardActions={cardActions}
                cardView={cardView}
                viewMode={viewMode}
                fetching={!!activeConn?.isFetching}
                visiblePubkeyPage={visiblePubkeyPage}
                profileCache={profileCache}
                trustCache={trustCache}
                graphDataCache={graphDataCache}
                profileAttempted={profileAttempted}
                expandedPubkey={expandedPubkey}
                expandedDetailGraph={expandedDetailGraph}
                expandedStats={expandedStats}
                expandedIsLoading={expandedIsLoading}
                copiedPubkey={copiedPubkey}
                selfPubkey={user?.pubkey}
                social={social}
                groupPubkeySets={groupPubkeySets}
              />
              <NetworkPager visiblePubkeyPage={visiblePubkeyPage} setCurrentPage={setCurrentPage} />
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
