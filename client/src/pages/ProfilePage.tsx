import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from "react";
import { useMyReport, useTheyFollowMe } from "@/hooks/useRelationship";
import { AppHeader } from "@/components/AppHeader";
import { GlossBackground } from "@/components/GlossBackground";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { useLocation, useRoute } from "wouter";
import { nip19 } from "nostr-tools";
import { ProfileRecentPosts } from "@/components/profile/ProfileRecentPosts";
import { isFlaggedByReporters } from "@/lib/trustFlags";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { profileShortLink, useShortLink } from "@/hooks/useShortLink";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { ZapModal } from "@/components/ZapModal";
import { WotStrengthCard } from "@/components/WotStrengthCard";
import { formatReportTime } from "@/lib/reportMeta";
import { useHasMywot } from "@/hooks/useHasMywot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { fetchProfiles, eventStore } from "@/services/nostr";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { isAuthRedirecting } from "@/services/api";
import { useSelfConnections, flattenConnections } from "@/hooks/useSelf";
import { grapeRankResultOptions } from "@/services/queries/graperank";
import {
  influenceOptions,
  overviewOptions,
  selectOverview,
  selectStats,
  statsOptions,
} from "@/services/queries/userReads";
import { getProfileSeed, clearProfileSeed, type ProfileSeed } from "@/lib/profileSeed";
import { toPubkeys, toInfluenceMap, type GraphEntry } from "../services/graphHelpers";
import { useProfileConnections } from "./profileConnections";
import { expandProfileCache, expandTrustCacheFor } from "@/services/profilePageCache";
import { Footer } from "@/components/Footer";
import { useSocialActions } from "@/hooks/useSocialActions";
import { useHasSession } from "@/hooks/useHasSession";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { hasOwnScores, markOwnScores } from "@/lib/ownScores";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import { AdminHistoryCard, useAdminUserHistory } from "./profile/AdminHistory";

import {
  GROUP_DEFS,
  getSection,
  sectionCount,
  type FilterMode,
  type GroupDef,
  type ProfileResultData,
  type ReportTypeFilter,
  type SortMode,
} from "./profile/connectionModel";
import { ExpandedPanel } from "./profile/ExpandedPanel";
import { ProfileBackButton } from "./profile/ProfileBackButton";
import { ProfileErrorCard, ProfileSeedPreview, ProfileSkeleton } from "./profile/ProfileStates";
import { ProfileAbout } from "./profile/ProfileAbout";
import { ProfileActions } from "./profile/ProfileActions";
import { ProfileVerdictBanner, SharedConnectionsBanner } from "./profile/ProfileBanners";
import { ReportDialog } from "./profile/ReportDialog";
import { useSectionRows } from "./profile/useSectionRows";
import { ProfileCoverBanner, ProfileIdentity } from "./profile/ProfileIdentity";
import { SocialReachCard } from "./profile/SocialReachCard";
import { RiskSignalsCard, SocialContextCard } from "./profile/SocialContextCard";
import { confidenceGuidanceFor, grTierCountsToUI, tierBreakdownRows } from "./profile/tiers";
import { nameIn } from "@/lib/displayName";
export default function ProfilePage() {
  const [location, navigate] = useLocation();
  const [, params] = useRoute("/profile/:npub");
  const npubParam = params?.npub || "";

  const user = useActiveAccountDisplay();
  const hasSession = useHasSession();

  const [shareOpen, setShareOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [sectionVisibleCount, setSectionVisibleCount] = useState<Record<string, number>>({});
  const [forceRender, setForceRender] = useState(0);
  const hasExpandedRef = useRef(false);
  const rafBumpRef = useRef<number | null>(null);
  const bumpRerender = useCallback(() => {
    if (rafBumpRef.current !== null) return;
    rafBumpRef.current = requestAnimationFrame(() => {
      rafBumpRef.current = null;
      startTransition(() => setForceRender((c) => c + 1));
    });
  }, []);

  const [sectionSort, setSectionSort] = useState<Record<string, SortMode>>({});
  const [sectionFilter, setSectionFilter] = useState<Record<string, FilterMode>>({});
  const [sectionSearch, setSectionSearch] = useState<Record<string, string>>({});
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<Record<string, boolean>>({});
  const [reportTypeFilterState, setReportTypeFilterState] = useState<Record<string, ReportTypeFilter>>({});
  const [reportTypeDropdownOpen, setReportTypeDropdownOpen] = useState<Record<string, boolean>>({});

  const [fromAdmin, setFromAdmin] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const hexPubkey = useMemo(() => {
    try {
      if (/^npub1[02-9ac-hj-np-z]{20,}$/i.test(npubParam)) {
        const decoded = nip19.decode(npubParam);
        if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
      } else if (/^[0-9a-f]{64}$/i.test(npubParam)) {
        return npubParam.toLowerCase();
      }
    } catch {}
    return "";
  }, [npubParam]);
  // The viewer's own Brainstorm Assistant is the server's `ta_pubkey`: no Session, no badge (#269).
  const { taPubkey: ownAssistantPubkey } = useHasMywot();
  const isOwnAssistant = !!hexPubkey && ownAssistantPubkey === hexPubkey;

  const social = useSocialActions(user?.pubkey);

  // "Follows you": does the target follow ME? (my pubkey ∈ their kind-3 contact list)
  const theyFollowMe = useTheyFollowMe(user?.pubkey, hexPubkey).followsMe;

  // "You reported this": have I published a kind-1984 report targeting them?
  // Live from the store; an unreport hides it at once while its deletion publishes.
  const storedReport = useMyReport(user?.pubkey, hexPubkey);
  const [unreporting, setUnreporting] = useState<string | null>(null);
  const myReport = unreporting === hexPubkey ? null : storedReport;

  // Polled app-wide while a run is in flight (hooks/useScoringStatus), not here.
  const { data: grapeRankData } = useQuery({ ...grapeRankResultOptions(), enabled: !!user });

  const isAdmin = user?.isAdmin === true;

  const adminHistoryQuery = useAdminUserHistory(hexPubkey, isAdmin);
  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  useEffect(() => {
    if (calcDoneNow) markOwnScores(user?.pubkey);
  }, [calcDoneNow, user?.pubkey]);

  // Only an admin reaches this page (AdminProfileRoute sends anyone else, signed
  // out included, to the public /p/:npub), so there is always an Account here.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const adminFrom = urlParams.get("from");
    const adminPubkey = urlParams.get("pubkey");
    setFromAdmin(adminFrom === "admin" ? adminPubkey || "1" : null);
  }, [location, npubParam]);

  // Keeps the active preset in step with the server's; the reads below don't
  // key on it, a change invalidates them (`invalidatePresetDrivenReads`).
  const { preset: trustPreset } = useTrustPresetSync(!!user);
  // The rows' scores are the viewer's, under their preset: one cache per pair,
  // so an account switch or a preset change doesn't keep showing the old ones.
  const trustCache = useMemo(() => expandTrustCacheFor(user?.pubkey, trustPreset), [user?.pubkey, trustPreset]);

  // Self's own follower/following lists drive the mutual-followers/following
  // banner. `useSelfConnections` calls `/user/{pk}/connections` via
  // `optionalAuthFetch`, which on an existing-but-stale session triggers
  // wipe-and-redirect (Profile is a public page). Gate the pubkey on a real
  // session token — anon and stale-token visitors see the public overview
  // without their browsing being hijacked.
  const selfMutualsPubkey = hasSession ? user?.pubkey : undefined;
  const selfFollowedByConn = useSelfConnections(selfMutualsPubkey, "followed_by", { enabled: !!selfMutualsPubkey });
  const selfFollowingConn = useSelfConnections(selfMutualsPubkey, "following", { enabled: !!selfMutualsPubkey });
  const selfFollowedByList = useMemo(
    () => flattenConnections(selfFollowedByConn.data?.pages),
    [selfFollowedByConn.data?.pages],
  );
  const selfFollowingList = useMemo(
    () => flattenConnections(selfFollowingConn.data?.pages),
    [selfFollowingConn.data?.pages],
  );

  const seed = useMemo<ProfileSeed | null>(() => {
    if (!hexPubkey) return null;
    // The search's seed, held in memory (useOpenProfile sends a search click to
    // /p/, so nothing arrives here with its sessionStorage copy to restore).
    return getProfileSeed(hexPubkey);
  }, [hexPubkey]);

  // Overview drives the header (influence + counts). Lists load lazily on expand.
  // `flagged_by_observer` reflects "is this user flagged from the JWT user's
  // perspective" — used by isProfileFlagged below.
  type ProfileOverview = {
    pubkey: string;
    influence: number | null;
    // The subject's own bucket under the viewer's saved preset — the server
    // owns the verified line, so we never re-derive it from a threshold here.
    tier: string | null;
    flagged_by_observer: boolean;
    counts: {
      followed_by: number;
      following: number;
      muted_by: number;
      muting: number;
      reported_by: number;
      reporting: number;
    };
  };
  const profileOverviewQuery = useQuery({
    // The one entry for this person's overview (services/queries/userReads):
    // the Network row that led here, the share page and the mention confirm
    // read it too. Nothing preset-shaped in the key — a preset change
    // invalidates it (`invalidatePresetDrivenReads`), where a preset in the
    // key refetched once per preset value the page passed through on load.
    ...overviewOptions(hexPubkey, "viewer"),
    select: (envelope): ProfileOverview | null => selectOverview(envelope),
  });

  // Per-section stats (total + verified + tier counts) for all 6 relationships.
  // Fires in parallel with overview on profile open. Server runs 6 Cypher scans
  // in parallel; first paint of badges depends on this landing.
  type SectionStats = {
    total: number;
    verified: number;
    tier_counts: {
      high: number;
      medium_high: number;
      medium: number;
      medium_low: number;
      low: number;
      low_and_reported_by_2_or_more_trusted_pubkeys: number;
    };
  };
  type ProfileStats = {
    followed_by: SectionStats;
    following: SectionStats;
    muted_by: SectionStats;
    muting: SectionStats;
    reported_by: SectionStats;
    reporting: SectionStats;
  };
  const profileStatsQuery = useQuery({
    ...statsOptions(hexPubkey, "viewer"),
    select: (envelope): ProfileStats | null => selectStats(envelope),
  });

  // Per-section connection queries (cursor-paginated): followed_by and following
  // at once (they drive the mutual and shared sets), the rest when opened. The
  // flattened rows keep their identity until a page lands, so what is derived
  // from them below doesn't recompute on every render.
  const { queries: connQueries, items: connItems } = useProfileConnections(
    hexPubkey,
    sectionSort,
    sectionFilter,
    expandedSections,
  );
  const followedByQuery = connQueries.followed_by;
  const followingQuery = connQueries.following;
  const mutedByQuery = connQueries.muted_by;
  const mutingQuery = connQueries.muting;
  const reportedByQuery = connQueries.reported_by;
  const reportingQuery = connQueries.reporting;
  const followedByItems = connItems.followed_by;
  const followingItems = connItems.following;
  const mutedByItems = connItems.muted_by;
  const mutingItems = connItems.muting;
  const reportedByItems = connItems.reported_by;
  const reportingItems = connItems.reporting;

  const sectionStats = useMemo<Record<string, SectionStats | null>>(
    () => ({
      followed_by: profileStatsQuery.data?.followed_by ?? null,
      following: profileStatsQuery.data?.following ?? null,
      muted_by: profileStatsQuery.data?.muted_by ?? null,
      muting: profileStatsQuery.data?.muting ?? null,
      reported_by: profileStatsQuery.data?.reported_by ?? null,
      reporting: profileStatsQuery.data?.reporting ?? null,
    }),
    [profileStatsQuery.data],
  );

  // Seed the trust cache from the loaded section rows so ExpandedPanel renders
  // don't fire a per-pubkey getUserOverview() each. The rows are the newest
  // answer (a preset change refetches them), so they overwrite what was held.
  useEffect(() => {
    const seedFrom = (items: GraphEntry[] | null) => {
      if (!items) return;
      for (const it of items) {
        if (typeof it === "string") continue;
        trustCache.set(it.pubkey, it.influence ?? null);
      }
    };
    seedFrom(followedByItems);
    seedFrom(followingItems);
    seedFrom(mutedByItems);
    seedFrom(mutingItems);
    seedFrom(reportedByItems);
    seedFrom(reportingItems);
  }, [trustCache, followedByItems, followingItems, mutedByItems, mutingItems, reportedByItems, reportingItems]);

  // Composed ProfileResultData: counts as numbers (from overview) until each
  // section's lazy query lands its array. UI already handles the number-or-array
  // dual shape via Array.isArray() checks.
  const profileQuery = {
    data: useMemo<ProfileResultData | null>(() => {
      const ov = profileOverviewQuery.data;
      if (!ov) return null;
      return {
        influence: ov.influence ?? undefined,
        followed_by: followedByItems ?? ov.counts.followed_by,
        following: followingItems ?? ov.counts.following,
        muted_by: mutedByItems ?? ov.counts.muted_by,
        muting: mutingItems ?? ov.counts.muting,
        reported_by: reportedByItems ?? ov.counts.reported_by,
        reporting: reportingItems ?? ov.counts.reporting,
      } as ProfileResultData;
    }, [
      profileOverviewQuery.data,
      followedByItems,
      followingItems,
      mutedByItems,
      mutingItems,
      reportedByItems,
      reportingItems,
    ]),
    isLoading: profileOverviewQuery.isLoading,
    isError: profileOverviewQuery.isError,
    isFetched: profileOverviewQuery.isFetched,
    isSuccess: profileOverviewQuery.isSuccess,
  };

  const liveNostrProfile = useLiveProfile(hexPubkey || undefined);

  const profileResult = profileQuery.data ?? null;
  const nostrProfile = liveNostrProfile.profile ?? null;

  useEffect(() => {
    if (hexPubkey && profileQuery.isSuccess && !liveNostrProfile.loading) {
      clearProfileSeed(hexPubkey);
    }
  }, [hexPubkey, profileQuery.isSuccess, liveNostrProfile.loading]);

  const seedAsNostrProfile = useMemo<ProfileContent | null>(() => {
    if (!seed) return null;
    return {
      name: seed.name,
      display_name: seed.displayName,
      picture: seed.picture,
      nip05: seed.nip05,
      about: seed.about,
      banner: seed.banner,
      website: seed.website,
      lud16: seed.lud16,
    };
  }, [seed]);

  // When you're viewing your *own* profile, the locally-known current-user
  // profile (updated on every in-app save) is the freshest source — a just-
  // created/edited kind 0 may not have propagated to the HTTP gateways/relays
  // that `fetchProfile` queries yet. Use it to fill gaps (esp. picture/banner)
  // so your own avatar shows immediately instead of the initials fallback.
  const ownProfileFallback = useMemo<ProfileContent | null>(() => {
    if (!user || !hexPubkey || user.pubkey !== hexPubkey) return null;
    if (user.picture || user.displayName) {
      return {
        name: user.displayName,
        display_name: user.displayName,
        picture: user.picture,
        nip05: user.nip05,
      } as ProfileContent;
    }
    return null;
  }, [user, hexPubkey]);

  const displayNostrProfile = useMemo<ProfileContent | null>(() => {
    const base = nostrProfile ?? seedAsNostrProfile;
    if (!ownProfileFallback) return base;
    if (!base) return ownProfileFallback;
    // Network values win when present; the local copy backfills empty fields.
    const nonEmpty = Object.fromEntries(Object.entries(base).filter(([, v]) => v != null && v !== ""));
    return { ...ownProfileFallback, ...nonEmpty } as ProfileContent;
  }, [nostrProfile, seedAsNostrProfile, ownProfileFallback]);

  const loadError = useMemo<string | null>(() => {
    if (!npubParam) return null;
    if (user && !hexPubkey) return "Invalid profile identifier";
    if (profileQuery.isError) return "No profile data found for this identity on the Brainstorm backend.";
    if (profileQuery.isFetched && !profileQuery.data)
      return "No profile data found for this identity on the Brainstorm backend.";
    return null;
  }, [npubParam, user, hexPubkey, profileQuery.isError, profileQuery.isFetched, profileQuery.data]);

  const isLoading = !seed && !profileResult && profileQuery.isLoading;

  const {
    reportMetadataLoading,
    prefetchedRef,
    fetchSectionProfiles,
    fetchSectionMetadata,
    getReportForPubkey,
    resetSectionRows,
  } = useSectionRows(hexPubkey, profileResult, bumpRerender);

  useEffect(() => {
    setExpandedSections({});
    setSectionVisibleCount({});
    hasExpandedRef.current = false;
    resetSectionRows();
  }, [hexPubkey, resetSectionRows]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const formatRelativeTime = useCallback((timestamp: number) => formatReportTime(timestamp), []);

  const mutualPubkeys = useMemo(() => {
    if (!profileResult) return [];
    const followedBy = toPubkeys(getSection(profileResult, "followed_by"));
    const following = toPubkeys(getSection(profileResult, "following"));
    const followingSet = new Set(following);
    return followedBy.filter((pk: string) => followingSet.has(pk));
  }, [profileResult]);

  const sharedFollowerPubkeys = useMemo(() => {
    if (!profileResult || selfFollowedByList.length === 0) return [];
    const selfFollowedBySet = new Set(selfFollowedByList.map((e) => e.pubkey));
    const searchedFollowedBy = toPubkeys(getSection(profileResult, "followed_by"));
    return searchedFollowedBy.filter((pk: string) => selfFollowedBySet.has(pk));
  }, [selfFollowedByList, profileResult]);

  const sharedFollowingPubkeys = useMemo(() => {
    if (!profileResult || selfFollowingList.length === 0) return [];
    const selfFollowingSet = new Set(selfFollowingList.map((e) => e.pubkey));
    const searchedFollowing = toPubkeys(getSection(profileResult, "following"));
    return searchedFollowing.filter((pk: string) => selfFollowingSet.has(pk));
  }, [selfFollowingList, profileResult]);

  // `flagged_by_observer` is computed server-side on /user/{viewedPubkey}/overview
  // from the JWT user's perspective: at or below their saved preset's verified
  // line AND reported by 2+ trusted accounts. See UserOverviewData.
  const isProfileFlagged = profileOverviewQuery.data?.flagged_by_observer ?? false;

  useEffect(() => {
    if (!profileResult) return;
    const runPrefetch = () => {
      if (hasExpandedRef.current) return;
      const allPubkeys: string[] = [];
      for (const key of ["followed_by", "following", "muted_by", "reported_by", "muting", "reporting"]) {
        const pks = toPubkeys(getSection(profileResult, key));
        allPubkeys.push(...pks.slice(0, 10));
      }
      for (const pk of mutualPubkeys.slice(0, 10)) allPubkeys.push(pk);
      for (const pk of sharedFollowerPubkeys.slice(0, 10)) allPubkeys.push(pk);
      for (const pk of sharedFollowingPubkeys.slice(0, 10)) allPubkeys.push(pk);
      const unique = [...new Set(allPubkeys)].filter((pk) => {
        if (prefetchedRef.current.has(pk)) return false;
        const cached = eventStore.getReplaceable(0, pk);
        return !cached;
      });
      if (unique.length > 0) {
        unique.forEach((pk) => prefetchedRef.current.add(pk));
        fetchProfiles(unique, (pubkey, profile) => {
          expandProfileCache.set(pubkey, profile);
        });
      }
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    let handle: number;
    let isIdle = false;
    if (typeof ric === "function") {
      handle = ric(runPrefetch, { timeout: 2000 });
      isIdle = true;
    } else {
      handle = window.setTimeout(runPrefetch, 0);
    }
    return () => {
      if (isIdle && typeof cic === "function") cic(handle);
      else window.clearTimeout(handle);
    };
  }, [profileResult, mutualPubkeys, sharedFollowerPubkeys, sharedFollowingPubkeys, prefetchedRef]);

  const sectionInfluenceMaps = useMemo(() => {
    const out: Record<string, Map<string, number | null>> = {
      followed_by: new Map(),
      following: new Map(),
      muted_by: new Map(),
      muting: new Map(),
      reported_by: new Map(),
      reporting: new Map(),
    };
    if (!profileResult) return out;
    for (const key of Object.keys(out)) {
      out[key] = toInfluenceMap(getSection(profileResult, key));
    }
    return out;
  }, [profileResult]);

  const groupsByPubkey = useMemo(() => {
    const map = new Map<string, GroupDef[]>();
    if (!profileResult) return map;
    const push = (pk: string, def: GroupDef) => {
      const existing = map.get(pk);
      if (existing) existing.push(def);
      else map.set(pk, [def]);
    };
    const defsByKey = Object.fromEntries(GROUP_DEFS.map((d) => [d.key, d]));
    const followedSet = new Set<string>();
    const followingSet = new Set<string>();
    sectionInfluenceMaps.followed_by.forEach((_v, pk) => {
      followedSet.add(pk);
      push(pk, defsByKey.followed_by);
    });
    sectionInfluenceMaps.following.forEach((_v, pk) => {
      followingSet.add(pk);
      push(pk, defsByKey.following);
    });
    sectionInfluenceMaps.muted_by.forEach((_v, pk) => push(pk, defsByKey.muted_by));
    sectionInfluenceMaps.muting.forEach((_v, pk) => push(pk, defsByKey.muting));
    sectionInfluenceMaps.reported_by.forEach((_v, pk) => push(pk, defsByKey.reported_by));
    sectionInfluenceMaps.reporting.forEach((_v, pk) => push(pk, defsByKey.reporting));
    for (const pk of followedSet) if (followingSet.has(pk)) push(pk, defsByKey.mutual);
    for (const pk of sharedFollowerPubkeys) push(pk, defsByKey.shared_followers);
    for (const pk of sharedFollowingPubkeys) push(pk, defsByKey.shared_following);
    return map;
  }, [profileResult, sectionInfluenceMaps, sharedFollowerPubkeys, sharedFollowingPubkeys]);

  const [granularity] = useTierGranularity();
  const hasTier = !!profileOverviewQuery.data?.tier;

  const confidenceGuidance = useMemo(() => {
    if (!profileResult || profileResult.influence === undefined) return null;
    const score = typeof profileResult.influence === "number" ? profileResult.influence : 0;
    const name = nameIn(nostrProfile) ?? "this identity";
    return confidenceGuidanceFor(score, name);
  }, [profileResult, nostrProfile]);

  const verifiedCounts = useMemo(() => {
    // Verified counts come only from /stats — the preset applied to the FULL
    // relationship, which a loaded page of items can't reproduce. `loaded` (not
    // `count > 0`) gates the "Verified X" labels, so a real 0 under a strict
    // preset reads as 0. Totals aren't preset-derived, so they still fall back.
    const ov = profileOverviewQuery.data?.counts;
    const fbStats = sectionStats.followed_by;
    const fgStats = sectionStats.following;
    const mbStats = sectionStats.muted_by;
    const rbStats = sectionStats.reported_by;
    return {
      loaded: !!profileStatsQuery.data,
      followers: fbStats?.verified ?? 0,
      followersTotal: fbStats?.total ?? ov?.followed_by ?? sectionInfluenceMaps.followed_by.size,
      following: fgStats?.verified ?? 0,
      followingTotal: fgStats?.total ?? ov?.following ?? sectionInfluenceMaps.following.size,
      mutedBy: mbStats?.verified ?? 0,
      mutedByTotal: mbStats?.total ?? ov?.muted_by ?? sectionInfluenceMaps.muted_by.size,
      reportedBy: rbStats?.verified ?? 0,
      reportedByTotal: rbStats?.total ?? ov?.reported_by ?? sectionInfluenceMaps.reported_by.size,
    };
  }, [sectionInfluenceMaps, profileOverviewQuery.data, profileStatsQuery.data, sectionStats]);

  // Same predicate the public page (/p/:id) and Network Alerts use, so one
  // account never reads as "flagged" on one surface and clean on another.
  const isFlaggedProfile = useMemo(
    () => isFlaggedByReporters(verifiedCounts.reportedBy, verifiedCounts.followers),
    [verifiedCounts.reportedBy, verifiedCounts.followers],
  );

  const followerTierBreakdown = useMemo(() => {
    // Server counts only: bucketing falls through the preset's verified line,
    // which this side doesn't know. Render nothing rather than guess it.
    const serverStats = sectionStats.followed_by;
    if (!serverStats || serverStats.total === 0) return null;
    return { counts: grTierCountsToUI(serverStats.tier_counts), total: serverStats.total };
  }, [sectionStats]);

  const getTierBreakdown = useCallback(
    (sectionKey: string): { tier: string; count: number; color: string }[] | null => {
      // Server-side tier counts only — see followerTierBreakdown.
      const serverStats = (sectionStats as Record<string, SectionStats | null | undefined>)[sectionKey];
      if (!serverStats) return null;
      return tierBreakdownRows(grTierCountsToUI(serverStats.tier_counts), granularity);
    },
    [sectionStats, granularity],
  );

  const seedTrustForSection = useCallback(
    (key: string, pubkeys: string[]) => {
      // Seed the trust cache from already-known influence values so we never
      // need a per-pubkey apiClient.getUserByPubkey() call for these.
      const seed = (pk: string, val: number | null | undefined) => {
        if (val === undefined) return;
        if (!trustCache.has(pk)) trustCache.set(pk, val);
      };
      if (key === "mutual" || key === "shared_followers" || key === "shared_following") {
        for (const pk of pubkeys) {
          const fromFollowedBy = sectionInfluenceMaps.followed_by.get(pk);
          if (fromFollowedBy !== undefined) {
            seed(pk, fromFollowedBy);
            continue;
          }
          const fromFollowing = sectionInfluenceMaps.following.get(pk);
          if (fromFollowing !== undefined) {
            seed(pk, fromFollowing);
            continue;
          }
          seed(pk, null);
        }
        return;
      }
      const map = (sectionInfluenceMaps as Record<string, Map<string, number | null> | undefined>)[key];
      if (!map) return;
      map.forEach((inf, pk) => seed(pk, inf));
    },
    [sectionInfluenceMaps, trustCache],
  );

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!prev[key]) {
        hasExpandedRef.current = true;
        setSectionVisibleCount((vc) => ({ ...vc, [key]: 10 }));
        const pubkeys =
          key === "mutual"
            ? mutualPubkeys
            : key === "shared_followers"
              ? sharedFollowerPubkeys
              : key === "shared_following"
                ? sharedFollowingPubkeys
                : toPubkeys(getSection(profileResult, key));
        if (pubkeys.length > 0) {
          seedTrustForSection(key, pubkeys);
          fetchSectionProfiles(key, pubkeys);
        }
        if (["reported_by", "reporting", "muted_by", "muting"].includes(key)) {
          fetchSectionMetadata(key);
        }
      } else {
        setSectionVisibleCount((vc) => {
          const copy = { ...vc };
          delete copy[key];
          return copy;
        });
        setSectionSort((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        setSectionFilter((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        setSectionSearch((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        setFilterDropdownOpen((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
      return next;
    });
  };

  const renderTierBadges = (sectionKey: string) => {
    const breakdown = getTierBreakdown(sectionKey);
    if (!breakdown || breakdown.length === 0) return null;
    return (
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5" data-testid={`tier-breakdown-${sectionKey}`}>
        {breakdown.map((t) => (
          <span key={t.tier} className={`text-[9px] font-medium ${t.color} flex items-center gap-0.5`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${t.color.replace("text-", "bg-")}`} />
            {t.count}
          </span>
        ))}
      </div>
    );
  };

  const navigateToProfile = useCallback(
    (pk: string) => {
      const targetNpub = nip19.npubEncode(pk);
      const params = new URLSearchParams();
      if (fromAdmin) {
        params.set("from", "admin");
        if (fromAdmin !== "1") params.set("pubkey", fromAdmin);
      }
      const qs = params.toString();
      navigate(`/profile/${targetNpub}${qs ? `?${qs}` : ""}`);
    },
    [navigate, fromAdmin],
  );

  const handleSetSort = useCallback((k: string, v: SortMode) => {
    setSectionSort((prev) => ({ ...prev, [k]: v }));
  }, []);
  const handleSetFilter = useCallback((k: string, v: FilterMode) => {
    setSectionFilter((prev) => ({ ...prev, [k]: v }));
  }, []);
  const handleSetSearch = useCallback((k: string, v: string) => {
    setSectionSearch((prev) => ({ ...prev, [k]: v }));
  }, []);
  const handleSetReportTypeFilter = useCallback((k: string, v: ReportTypeFilter) => {
    setReportTypeFilterState((prev) => ({ ...prev, [k]: v }));
  }, []);
  const handleSetVisibleCount = useCallback((k: string, n: number) => {
    setSectionVisibleCount((prev) => ({ ...prev, [k]: n }));
  }, []);
  const handleToggleFilterDropdown = useCallback((k: string, open: boolean) => {
    setFilterDropdownOpen((prev) => ({ ...prev, [k]: open }));
  }, []);
  const handleToggleReportTypeDropdown = useCallback((k: string, open: boolean) => {
    setReportTypeDropdownOpen((prev) => ({ ...prev, [k]: open }));
  }, []);
  const handleEnsureVisibleFetched = useCallback(
    (k: string, visiblePubkeys: string[]) => {
      fetchSectionProfiles(k, visiblePubkeys, 0, visiblePubkeys.length);
    },
    [fetchSectionProfiles],
  );

  // Map section key → infinite query (for cursor-paginated fetchNextPage).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- query results change identity per render anyway
  const sectionQueries: Record<
    string,
    {
      hasNextPage?: boolean;
      isFetchingNextPage?: boolean;
      fetchNextPage: () => void;
    }
  > = {
    followed_by: followedByQuery,
    following: followingQuery,
    muted_by: mutedByQuery,
    muting: mutingQuery,
    reported_by: reportedByQuery,
    reporting: reportingQuery,
  };

  const handleShowMore = useCallback(
    (k: string, processed: string[], currentVisible: number) => {
      setSectionVisibleCount((prev) => ({ ...prev, [k]: currentVisible + 10 }));
      fetchSectionProfiles(k, processed, currentVisible, 10);
      if (k === "muted_by") {
        const nextBatch = processed.slice(currentVisible, currentVisible + 10);
        if (nextBatch.length > 0) fetchSectionMetadata("muted_by", nextBatch);
      }
      // If we're approaching the end of what's loaded server-side, fetch the
      // next page. The connection query will append items; profileResult
      // re-composes; the panel will see the larger list on the next render.
      const q = sectionQueries[k];
      if (q && q.hasNextPage && !q.isFetchingNextPage) {
        if (currentVisible + 10 >= processed.length - 30) {
          q.fetchNextPage();
        }
      }
    },
    [fetchSectionProfiles, fetchSectionMetadata, sectionQueries],
  );

  const renderExpandedPanel = (key: string, pubkeys: string[]) => {
    const isExpanded = expandedSections[key];
    if (!isExpanded || pubkeys.length === 0) return null;
    return (
      <ExpandedPanel
        sectionKey={key}
        pubkeys={pubkeys}
        filter={sectionFilter[key] || "all"}
        sort={sectionSort[key] || "trust-desc"}
        search={sectionSearch[key] || ""}
        reportTypeFilter={reportTypeFilterState[key] || "all"}
        visibleCount={sectionVisibleCount[key] || 10}
        sectionTotal={sectionStats[key]?.total}
        filterDropdownOpen={filterDropdownOpen[key] || false}
        reportTypeDropdownOpen={reportTypeDropdownOpen[key] || false}
        reportMetaLoading={!!reportMetadataLoading[key]}
        sectionInfluenceMaps={sectionInfluenceMaps}
        trustCache={trustCache}
        groupsByPubkey={groupsByPubkey}
        getReportForPubkey={getReportForPubkey}
        formatRelativeTime={formatRelativeTime}
        navigateToProfile={navigateToProfile}
        onSetSort={handleSetSort}
        onSetFilter={handleSetFilter}
        onSetSearch={handleSetSearch}
        onSetReportTypeFilter={handleSetReportTypeFilter}
        onSetVisibleCount={handleSetVisibleCount}
        onToggleFilterDropdown={handleToggleFilterDropdown}
        onToggleReportTypeDropdown={handleToggleReportTypeDropdown}
        onShowMore={handleShowMore}
        onEnsureVisibleFetched={handleEnsureVisibleFetched}
        renderToken={forceRender}
      />
    );
  };

  const displayNpub = useMemo(() => {
    if (/^npub1/.test(npubParam)) return npubParam;
    try {
      return nip19.npubEncode(npubParam);
    } catch {
      return npubParam;
    }
  }, [npubParam]);

  const profileShareUrl = useShortLink({ ...profileShortLink(displayNpub), enabled: shareOpen });

  // Fetch the NosFabrica ("house") perspective influence (0..1) for the viewed
  // profile on mount, so the dual-meter widget renders regardless of entry point
  // (Search, Network, deep link, etc). Uses an unauthenticated overview request
  // (always house POV). Skipped when the search-click seed already supplied a value.
  const nosfabricaRankQuery = useQuery({
    ...influenceOptions(hexPubkey, "house"),
    enabled: !!hexPubkey && seed?.wotRankNosfabrica == null,
  });

  // Viewing your OWN profile, the personalized score is always self-POV (you
  // trust yourself → 100), which is meaningless. So on your own profile we show
  // the network/house score instead — Brainstorm's own vantage point, the same
  // default shown on your shareable /p page. Framed as "how Brainstorm sees you",
  // NOT "how others see you": every viewer with their own web of trust computes a
  // different number, so there is no single score to promise.
  const isOwnProfile = !!user?.pubkey && !!hexPubkey && user.pubkey === hexPubkey;
  const searchPostsName = nameIn(displayNostrProfile);
  const searchPostsLabel = isOwnProfile
    ? "Search your posts"
    : searchPostsName
      ? `Search ${searchPostsName}'s posts`
      : "Search their posts";
  const houseInfluence01 = useMemo(() => {
    const r = seed?.wotRankNosfabrica ?? nosfabricaRankQuery.data;
    if (typeof r !== "number" || !Number.isFinite(r)) return null;
    const v01 = r > 1 ? r / 100 : r;
    return Math.min(1, Math.max(0, v01));
  }, [seed?.wotRankNosfabrica, nosfabricaRankQuery.data]);

  if (isAuthRedirecting() || !user) return null;

  const renderTrustBadge = () => {
    if (!profileResult || profileResult.influence === undefined || !hasTier) return null;

    // Own profile → the network's view of you (null = not yet scored, shown as
    // such in the card); anyone else → your personalized view of them.
    const score01 = isOwnProfile
      ? houseInfluence01
      : Math.min(1, Math.max(0, typeof profileResult.influence === "number" ? profileResult.influence : 0));
    // Other profiles: primary = your personal POV, secondary = the network score
    // (shown only when they differ → naturally hidden when logged out, where both
    // resolve to the house score). Own profile: network primary, no secondary.
    return (
      <WotStrengthCard
        score01={score01}
        secondaryScore01={isOwnProfile ? null : houseInfluence01}
        primaryLabel="To you"
        secondaryLabel="Brainstorm"
        className="w-full md:w-64 md:shrink-0"
      />
    );
  };

  return (
    <div
      className="relative flex min-h-page flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-profile"
    >
      <GlossBackground />

      <AppHeader user={user} onLogout={handleLogout} />

      <ShareProfileModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        npub={displayNpub}
        displayName={nameIn(displayNostrProfile) || displayNpub.slice(0, 18) + "…"}
        picture={displayNostrProfile?.picture}
        nip05={displayNostrProfile?.nip05}
        shareUrl={profileShareUrl}
        score01={typeof nosfabricaRankQuery.data === "number" ? nosfabricaRankQuery.data : null}
      />

      {hexPubkey && displayNostrProfile?.lud16 && (
        <ZapModal
          open={zapOpen}
          onOpenChange={setZapOpen}
          recipientPubkey={hexPubkey}
          lud16={displayNostrProfile.lud16}
          displayName={nameIn(displayNostrProfile) || displayNpub.slice(0, 18) + "…"}
          picture={displayNostrProfile?.picture}
        />
      )}

      <main className={cn(pageWidth("standard"), "relative z-10 py-12")}>
        <div className="mb-6 flex items-center gap-2">
          <ProfileBackButton fromAdmin={fromAdmin} />
        </div>

        {isLoading && <ProfileSkeleton />}

        {!isLoading && loadError && <ProfileErrorCard loadError={loadError} />}

        {!loadError && !profileResult && seed && (
          <ProfileSeedPreview
            houseInfluence01={houseInfluence01}
            displayNostrProfile={displayNostrProfile}
            displayNpub={displayNpub}
            emojiTags={liveNostrProfile.event}
          />
        )}

        {!isLoading && !loadError && profileResult && (
          <div style={{ animation: "profileFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            <Card
              className="relative overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
              data-testid="card-profile-result"
            >
              <div className="relative overflow-hidden">
                <ProfileCoverBanner banner={displayNostrProfile?.banner} />

                <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
                  <ProfileIdentity
                    displayNostrProfile={displayNostrProfile}
                    isOwnAssistant={isOwnAssistant}
                    avatarScore={profileResult?.influence ?? houseInfluence01}
                    displayNpub={displayNpub}
                    emojiTags={liveNostrProfile.event}
                    hexPubkey={hexPubkey}
                    npubParam={npubParam}
                    verifiedCounts={verifiedCounts}
                    mutualCount={mutualPubkeys.length}
                    degreeFrom={
                      hasSession && !isOwnProfile && user?.pubkey && hexPubkey && hasOwnScores(user.pubkey)
                        ? user.pubkey
                        : null
                    }
                    theyFollowMe={theyFollowMe}
                    trustBadge={renderTrustBadge()}
                    actions={
                      <ProfileActions
                        hexPubkey={hexPubkey}
                        isOwnProfile={isOwnProfile}
                        social={social}
                        myReport={myReport}
                        setUnreporting={setUnreporting}
                        displayNpub={displayNpub}
                        displayNostrProfile={displayNostrProfile}
                        searchPostsName={searchPostsName}
                        searchPostsLabel={searchPostsLabel}
                        setShareOpen={setShareOpen}
                        setZapOpen={setZapOpen}
                        setReportDialogOpen={setReportDialogOpen}
                      />
                    }
                  />
                  {displayNostrProfile?.about && (
                    <ProfileAbout
                      about={displayNostrProfile.about}
                      aboutExpanded={aboutExpanded}
                      setAboutExpanded={setAboutExpanded}
                      emojiTags={liveNostrProfile.event}
                    />
                  )}

                  <ProfileVerdictBanner
                    isOwnProfile={isOwnProfile}
                    houseInfluence01={houseInfluence01}
                    setShareOpen={setShareOpen}
                    isFlaggedProfile={isFlaggedProfile}
                    verifiedCounts={verifiedCounts}
                    npubParam={npubParam}
                    confidenceGuidance={confidenceGuidance}
                  />

                  <SharedConnectionsBanner
                    profileResult={profileResult}
                    selfFollowedByList={selfFollowedByList}
                    selfFollowingList={selfFollowingList}
                    sharedFollowerPubkeys={sharedFollowerPubkeys}
                    sharedFollowingPubkeys={sharedFollowingPubkeys}
                    followedByQuery={followedByQuery}
                    followingQuery={followingQuery}
                    expandedSections={expandedSections}
                    setExpandedSections={setExpandedSections}
                    toggleSection={toggleSection}
                    renderExpandedPanel={renderExpandedPanel}
                  />

                  {hexPubkey && <ProfileRecentPosts pubkey={hexPubkey} />}

                  {(profileResult.followed_by || profileResult.following || profileResult.influence !== undefined) &&
                    (() => {
                      const ovCounts = profileOverviewQuery.data?.counts;
                      const mutedByCount = sectionCount(ovCounts?.muted_by, profileResult.muted_by);
                      const reportedByCount = sectionCount(ovCounts?.reported_by, profileResult.reported_by);
                      const mutingCount = sectionCount(ovCounts?.muting, profileResult.muting);
                      const reportingCount = sectionCount(ovCounts?.reporting, profileResult.reporting);
                      const hasRiskSignals = mutedByCount > 0 || reportedByCount > 0 || isProfileFlagged;
                      const totalNegativeSignals = mutedByCount + reportedByCount;
                      const vMuted = verifiedCounts.mutedBy;
                      const vReported = verifiedCounts.reportedBy;

                      return (
                        <div className="space-y-5">
                          <SocialReachCard
                            profileResult={profileResult}
                            ovCounts={ovCounts}
                            verifiedCounts={verifiedCounts}
                            mutualPubkeys={mutualPubkeys}
                            isOwnProfile={isOwnProfile}
                            houseInfluence01={houseInfluence01}
                            followerTierBreakdown={followerTierBreakdown}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            renderExpandedPanel={renderExpandedPanel}
                            renderTierBadges={renderTierBadges}
                          />

                          <SocialContextCard
                            profileResult={profileResult}
                            hasRiskSignals={hasRiskSignals}
                            totalNegativeSignals={totalNegativeSignals}
                            isProfileFlagged={isProfileFlagged}
                            mutedByCount={mutedByCount}
                            reportedByCount={reportedByCount}
                            mutingCount={mutingCount}
                            reportingCount={reportingCount}
                            verifiedCounts={verifiedCounts}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            renderExpandedPanel={renderExpandedPanel}
                            renderTierBadges={renderTierBadges}
                          />

                          {hasRiskSignals && (
                            <RiskSignalsCard
                              mutedByCount={mutedByCount}
                              reportedByCount={reportedByCount}
                              isProfileFlagged={isProfileFlagged}
                              vMuted={vMuted}
                              vReported={vReported}
                            />
                          )}
                        </div>
                      );
                    })()}

                  {isAdmin && hexPubkey && <AdminHistoryCard query={adminHistoryQuery} />}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate("/")}
                      className="h-10 rounded-xl border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900"
                      data-testid="button-profile-new-search"
                    >
                      New Search
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      <style>{`
        @keyframes profileFadeIn {
          0% { opacity: 0; transform: translateY(24px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <ReportDialog
        reportDialogOpen={reportDialogOpen}
        setReportDialogOpen={setReportDialogOpen}
        social={social}
        hexPubkey={hexPubkey}
      />

      <Footer />
    </div>
  );
}
