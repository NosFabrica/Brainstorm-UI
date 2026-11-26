import { useState, useEffect, useMemo, useCallback, useDeferredValue, Fragment } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { ADMIN_SUPPORT_QUERY_KEY, adminListTickets } from "@/services/support";
import { unreadCount } from "@/lib/supportSeen";
import { UserTierPicker } from "@/components/admin/scheduling/UserTierPicker";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";
import type { SchedulingItem } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Search,
  Users,
  Shield,
  Activity,
  Server,
  BarChart3,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  FileText,
  UserCheck,
  Globe,
  RefreshCw,
  Eye,
  Play,
  Loader2,
  UserPlus,
  ArrowRight,
  User,
  Square,
  CheckSquare,
  MinusSquare,
  Sparkles,
  CalendarClock,
  LifeBuoy,
  Receipt,
  ListChecks,
  TrendingUp,
  KeyRound,
} from "lucide-react";
import { parseAdminTab, type AdminTab } from "./adminTabs";
import {
  ADMIN_RANGES,
  BACKEND_MAX_DAYS,
  customDays,
  parseAdminRange,
  rangeQuery,
  withinRange,
  type AdminRange,
} from "./adminRange";
import { ALL_USERS_DAYS, readEveryPage, useAdminHeaderMetrics } from "@/components/admin/useAdminHeaderMetrics";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis } from "recharts";
import { FEATURES } from "@/config/featureFlags";
import { searchNostrProfiles, type NostrSearchResult } from "@/services/nostr";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { AdminSearchInput } from "@/components/admin/users/AdminSearchInput";
import { LookupQueryInput } from "@/components/admin/users/LookupQueryInput";
import { matchUsersByName } from "@/components/admin/users/matchUsersByName";
import { useUserLookup } from "@/components/admin/users/useUserLookup";
import { useInFlightTriggers } from "@/components/admin/users/useInFlightTriggers";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { useActiveAccount } from "applesauce-react/hooks";
import { hasSession } from "@/accounts/session";
import type { BrainstormAccount } from "@/accounts/metadata";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useToast } from "@/hooks/use-toast";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import {
  type PageSizeOption,
  type SortState,
  type GrapeRankData,
  type GrapeRankApiResponse,
  type AdminUsersPage,
  type BrainstormRequestInstance,
  type AdminUserHistoryPage,
  type AdminSortKey,
} from "./admin/types";
import {
  POLL_OVERVIEW_MS,
  POLL_USERS_MS,
  POLL_ACTIVITY_MS,
  POLL_STATS_MS,
  BOOST_INTERVAL_MS,
  NONE,
} from "./admin/constants";
import { formatTimestamp, formatNumber, timeAgo, truncateError } from "./admin/format";
import {
  computePipelineMetrics,
  computeTrends,
  countQueued,
  getUserHealth,
  getWindowConfig,
  parseActivityTs,
  queuePositions,
} from "./admin/metrics";
import {
  isFailedActivity,
  isFailedStatus,
  isItemFailed,
  getFailureStage,
  extractErrorMessage,
  normalizeErrorKey,
} from "./admin/failures";
import { ConfirmRetriggerButton } from "./admin/ConfirmRetriggerButton";
import { CopyButton } from "./admin/CopyButton";
import { DeltaIndicator } from "./admin/DeltaIndicator";
import { KpiCard } from "./admin/KpiCard";
import { LiveBadge } from "./admin/LiveBadge";
import { SortHeader } from "./admin/SortHeader";
import { StatusBadge } from "./admin/StatusBadge";
import { grapeRankResultOptions } from "@/services/queries/graperank";
import { ActivityRow } from "./admin/activity/ActivityRow";
import { FailureBreakdownCard } from "./admin/activity/FailureBreakdownCard";
import { UserHistoryRow } from "./admin/users/UserHistoryRow";
import { type BulkSource, useBulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { BulkConfirmDialog } from "./admin/BulkConfirmDialog";
import { useRefreshBoost } from "./admin/useRefreshBoost";
import { BillingTab } from "./admin/BillingTab";
import { CompromisedTab } from "./admin/CompromisedTab";
import { SchedulingTab } from "./admin/SchedulingTab";
import { SupportTab } from "./admin/SupportTab";
import { TrustedListsTab } from "./admin/TrustedListsTab";
import { HealthTab } from "./admin/health/HealthTab";
import { useRelayLatency } from "./admin/health/useRelayLatency";
import { GrowthTab } from "./admin/GrowthTab";
import { tierByPubkey } from "./admin/metrics";

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const [mobileTabDropdownOpen, setMobileTabDropdownOpen] = useState(false);

  // Scrollbars are hidden app-wide (see index.css); admin opts back in while
  // mounted. Its wide tables need the horizontal scrollbar to show there ARE
  // more columns — ScrollableTable even mirrors one above the table. Set on
  // <html> because the window scrollbar lives there, out of reach of any
  // selector scoped inside the page.
  useEffect(() => {
    document.documentElement.classList.add("admin-scrollbars");
    return () => document.documentElement.classList.remove("admin-scrollbars");
  }, []);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    return parseAdminTab(new URLSearchParams(window.location.search).get("tab"), {
      assistants: FEATURES.assistantsAdmin,
    });
  });
  // Who the Users tab's "Publish trusted lists" sent to the Trusted Lists tab.
  const [trustedListsObserver, setTrustedListsObserver] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<SortState>({ key: "last_triggered", dir: "desc" });
  const [userPage, setUserPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [activityPage, setActivityPage] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState<PageSizeOption>(25);
  const [kpiFilter, setKpiFilter] = useState<"scored" | "sp_adopters" | "queue" | "failed" | null>(null);
  // The dashboard's one time range (adminRange): every tab's queries, figures
  // and charts read it, and `?range=` keeps it across tabs and reloads.
  const [range, setRangeState] = useState<AdminRange>(() =>
    parseAdminRange(new URLSearchParams(window.location.search).get("range")),
  );
  const setRange = useCallback((next: AdminRange) => {
    setRangeState(next);
    const params = new URLSearchParams(window.location.search);
    params.set("range", next);
    window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
  }, []);
  const rangeDays = rangeQuery(range, Date.now()).days;
  // The range drives the Overview's figures, the Activity log and Growth;
  // the other tabs are directories and settings, so it isn't shown there.
  const rangeDriven = activeTab === "overview" || activeTab === "activity" || activeTab === "growth";
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => String(customDays(range) ?? 14));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    const params = new URLSearchParams(window.location.search);
    const hl = params.get("highlight");
    return hl ? new Set([hl]) : new Set();
  });
  const { inFlight: triggeringPubkeys, claim: claimTriggers, release: releaseTrigger } = useInFlightTriggers();
  const { isBoostActive, triggerRefreshBoost } = useRefreshBoost();
  const [triggerConfirmPubkey, setTriggerConfirmPubkey] = useState<string | null>(null);

  const [selectedUserPubkeys, setSelectedUserPubkeys] = useState<Set<string>>(new Set());
  const [selectedActivityRows, setSelectedActivityRows] = useState<Map<number, string>>(new Map());
  const [fetchingMatching, setFetchingMatching] = useState(false);
  const SELECT_ALL_MATCHING_CAP = 200;
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupMode, setLookupMode] = useState<"lookup" | "onboard">("lookup");
  const [, setLookupResult] = useState<{ success: boolean; message: string; data?: Record<string, unknown> } | null>(
    null,
  );
  const [highlightedPubkey, setHighlightedPubkey] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight") || null;
  });
  const [onboardSearch, setOnboardSearch] = useState("");
  const [onboardSearching, setOnboardSearching] = useState(false);
  const [onboardResults, setOnboardResults] = useState<NostrSearchResult[]>([]);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardQueue, setOnboardQueue] = useState<NostrSearchResult[]>([]);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteInput, setBulkPasteInput] = useState("");
  const [onboardingAll, setOnboardingAll] = useState(false);
  const [onboardProgress, setOnboardProgress] = useState<{
    done: number;
    total: number;
    results: { pubkey: string; name: string; success: boolean; message: string }[];
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const isNameSearch = useCallback((q: string) => {
    const t = q.trim();
    if (!t) return false;
    if (t.startsWith("npub")) return false;
    if (/^[0-9a-fA-F]{8,64}$/.test(t)) return false;
    return true;
  }, []);

  // `userSearch` is committed by the search box once typing pauses
  // (AdminSearchInput), so the backend's pubkey search reads it as is; a name
  // is matched here, against every user, and never sent.
  const debouncedSearch = isNameSearch(userSearch.trim()) ? "" : userSearch.trim();

  // The claim rides on the Account's Session, so "no Session" is undecided, not
  // "not an admin" — a background re-auth clears it for the length of one
  // round-trip, and that must not bounce an admin off the page they are on.
  const account = useActiveAccount();
  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
      return;
    }
    if (account && hasSession(account as BrainstormAccount) && !user.isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, account, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab") || params.has("highlight")) {
      const kept = new URLSearchParams();
      if (params.has("range")) kept.set("range", params.get("range")!);
      window.history.replaceState({}, "", `${window.location.pathname}${kept.toString() ? `?${kept}` : ""}`);
      if (params.get("highlight")) {
        setTimeout(() => setHighlightedPubkey(null), 2500);
      }
    }
  }, []);

  // `user` is non-null on the first render for anyone signed in — it used to be
  // set only after the admin check passed. The redirect below merely *schedules*
  // a navigation, so gating on `user` alone fires every admin request for a
  // non-admin and collects a handful of 403s on the way out.
  const grapeRankQuery = useQuery({
    ...grapeRankResultOptions(),
    enabled: !!user?.isAdmin,
    select: (raw): GrapeRankApiResponse => raw,
  });

  const adminStatsQuery = useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: () => apiClient.getAdminStats(),
    enabled: !!user?.isAdmin,
    staleTime: 120_000,
    retry: false,
    refetchInterval: isBoostActive ? BOOST_INTERVAL_MS : POLL_STATS_MS,
    refetchOnWindowFocus: "always",
  });
  const adminStats = adminStatsQuery.data ?? null;
  const hasSystemData = adminStats !== null;

  const activeNameSearch = isNameSearch(userSearch.trim());

  const adminUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users", debouncedSearch, userSort.key, userSort.dir, userPage, pageSize],
    queryFn: () =>
      apiClient.getAdminUsers({
        search: debouncedSearch || undefined,
        sort: userSort.key,
        order: userSort.dir,
        days: ALL_USERS_DAYS,
        page: userPage + 1,
        size: pageSize,
      }),
    enabled: !!user?.isAdmin,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: activeTab === "users" ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_USERS_MS) : false,
    refetchOnWindowFocus: "always",
  });

  // Tickets where the user spoke last and hasn't been seen — the Support
  // tab's dot. Shares the tab's query key, so opening the tab dedupes it.
  const adminSupportQuery = useQuery({
    queryKey: ADMIN_SUPPORT_QUERY_KEY,
    queryFn: adminListTickets,
    enabled: !!user?.isAdmin,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const supportUnread = unreadCount("admin", adminSupportQuery.data ?? []);

  const schedulingPoliciesQuery = useQuery<SchedulingItem[]>({
    queryKey: ["/api/admin/scheduling"],
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: !!user?.isAdmin,
    staleTime: 60_000,
  });
  const schedulingPolicies = schedulingPoliciesQuery.data ?? [];

  const adminUsersData = adminUsersQuery.data;
  const adminUsersList = adminUsersData?.items ?? NONE;
  const adminUsersTotal = adminUsersData?.total ?? 0;
  const adminUsersTotalPages = adminUsersData?.pages ?? 1;

  // The boost (a few seconds, for a minute after an admin triggers a run) is
  // there to watch that run move; it applies only where the tables are drawn.
  const wholeTablePoll = (drawnHere: boolean) =>
    drawnHere ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_OVERVIEW_MS) : false;

  // The range's users: the Overview's figures and the Activity tab's tier column.
  const overviewUsersQuery = useQuery<AdminUsersPage>({
    queryKey: ["/api/admin/users/overview", rangeDays],
    queryFn: () => readEveryPage((page) => apiClient.getAdminUsers({ days: rangeDays, page, size: 100 })),
    enabled: !!user?.isAdmin && (activeTab === "overview" || activeTab === "activity"),
    staleTime: 60_000,
    retry: 1,
    refetchInterval: wholeTablePoll(activeTab === "overview" || activeTab === "activity"),
    refetchOnWindowFocus: true,
  });

  // Every user (the header's figures, a KPI filter or name search in Users, a
  // name Lookup, Growth's tiers) and the range's runs (the Overview's charts, the
  // Activity tab's queue positions). Each pages through a whole table, so it
  // runs only where it is drawn; the compact header on the other tabs reads the
  // last answer, or the backend's stats.
  const needsAllUsers =
    activeTab === "overview" ||
    activeTab === "growth" ||
    (activeTab === "users" && (activeNameSearch || !!kpiFilter || lookupOpen));
  const needsRangeActivity = activeTab === "overview" || activeTab === "activity";
  const { allUsersQuery, overviewActivityQuery } = useAdminHeaderMetrics<AdminUsersPage, AdminUserHistoryPage>({
    rangeDays,
    allUsers: { enabled: !!user?.isAdmin && needsAllUsers, refetchInterval: wholeTablePoll(needsAllUsers) },
    activity: {
      enabled: !!user?.isAdmin && needsRangeActivity,
      refetchInterval: wholeTablePoll(needsRangeActivity),
    },
  });

  const adminActivityQuery = useQuery<AdminUserHistoryPage>({
    queryKey: ["/api/admin/activity", rangeDays, activityPage, activityPageSize],
    queryFn: () =>
      apiClient.getAdminActivity({
        page: activityPage + 1,
        size: activityPageSize,
        days: rangeDays,
      }),
    enabled: !!user?.isAdmin && activeTab === "activity",
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: activeTab === "activity" ? (isBoostActive ? BOOST_INTERVAL_MS : POLL_ACTIVITY_MS) : false,
    refetchOnWindowFocus: "always",
  });
  const activityData = adminActivityQuery.data;
  const activityItems = activityData?.items ?? NONE;
  const activityTotal = activityData?.total ?? 0;
  const activityTotalPages = activityData?.pages ?? 1;

  // ----- Brainstorm Assistants admin view -----
  const [assistantSearch, setAssistantSearch] = useState("");
  const [assistantDebouncedSearch, setAssistantDebouncedSearch] = useState("");
  const [assistantPage, setAssistantPage] = useState(0);
  const [assistantPageSize, setAssistantPageSize] = useState<PageSizeOption>(25);
  const [expandedAssistant, setExpandedAssistant] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setAssistantDebouncedSearch(assistantSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [assistantSearch]);
  useEffect(() => {
    setAssistantPage(0);
  }, [assistantDebouncedSearch, assistantPageSize]);

  const assistantStatsQuery = useQuery({
    queryKey: ["/api/admin/assistants/stats"],
    queryFn: () => apiClient.getAdminAssistantStats(),
    enabled: !!user?.isAdmin && activeTab === "assistants" && FEATURES.assistantsAdmin,
    staleTime: 30_000,
    refetchInterval:
      activeTab === "assistants" && FEATURES.assistantsAdmin
        ? isBoostActive
          ? BOOST_INTERVAL_MS
          : POLL_OVERVIEW_MS
        : false,
  });

  const assistantsListQuery = useQuery({
    queryKey: ["/api/admin/assistants", assistantDebouncedSearch, assistantPage, assistantPageSize],
    queryFn: () =>
      apiClient.getAdminAssistants({
        search: assistantDebouncedSearch || undefined,
        page: assistantPage + 1,
        size: assistantPageSize,
      }),
    enabled: !!user?.isAdmin && activeTab === "assistants" && FEATURES.assistantsAdmin,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    refetchInterval:
      activeTab === "assistants" && FEATURES.assistantsAdmin
        ? isBoostActive
          ? BOOST_INTERVAL_MS
          : POLL_ACTIVITY_MS
        : false,
  });

  const assistantHistoryQuery = useQuery({
    queryKey: ["/api/admin/assistants", expandedAssistant, "history"],
    queryFn: () =>
      expandedAssistant ? apiClient.getAdminAssistantHistory(expandedAssistant, { size: 25 }) : Promise.resolve(null),
    enabled: !!user?.isAdmin && activeTab === "assistants" && FEATURES.assistantsAdmin && !!expandedAssistant,
    staleTime: 30_000,
  });

  // One person's run, from any control that isn't the Users row (which confirms
  // first, in handleTriggerGraperank): refused while that person is in flight.
  const retriggerOne = useCallback(
    async (pubkey: string) => {
      if (claimTriggers([pubkey]).length === 0) throw new Error("A run for this user is already in flight.");
      try {
        await apiClient.triggerUserGraperank(pubkey);
      } finally {
        releaseTrigger(pubkey);
      }
    },
    [claimTriggers, releaseTrigger],
  );

  const clearSelection = useCallback((source: BulkSource) => {
    if (source === "users") setSelectedUserPubkeys(new Set());
    else setSelectedActivityRows(new Map());
  }, []);
  const bulk = useBulkRetrigger({
    claim: claimTriggers,
    release: releaseTrigger,
    onFirstSuccess: triggerRefreshBoost,
    onSettled: clearSelection,
  });
  const { running: bulkRunning, statuses: bulkStatuses, lastResult: bulkLastResult } = bulk;
  const { dismissFrom: dismissBulkFrom } = bulk;

  useEffect(() => {
    setSelectedUserPubkeys(new Set());
    dismissBulkFrom("users");
  }, [userSearch, debouncedSearch, kpiFilter, dismissBulkFrom]);

  useEffect(() => {
    setSelectedActivityRows(new Map());
    dismissBulkFrom("activity");
  }, [range, dismissBulkFrom]);

  const relays = useRelayLatency(!!user && activeTab === "health");

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const grapeRank: GrapeRankData | null = grapeRankQuery.data?.data ?? null;
  const queuePosition =
    typeof grapeRank?.how_many_others_with_priority === "number" ? grapeRank.how_many_others_with_priority : null;

  const overviewAllUsers = overviewUsersQuery.data?.items ?? NONE;
  // pubkey → current scheduling tier, for Platform Activity rows (best-effort:
  // only covers users in the loaded set; activity records don't carry the tier).
  const schedulingTierByPubkey = useMemo(() => tierByPubkey(overviewAllUsers), [overviewAllUsers]);
  // What the Overview loaded (the range and the one before it, for deltas)
  // and the part inside the range, which every figure and chart reads.
  const overviewLoadedActivity = overviewActivityQuery.data?.items ?? NONE;
  const overviewAllActivity = useMemo(() => {
    const now = Date.now();
    return overviewLoadedActivity.filter((a) => withinRange(parseActivityTs(a.updated_at), range, now));
  }, [overviewLoadedActivity, range]);
  // Coverage of the loaded activity feed — surfaced so admins know how far the
  // trend windows actually reach (7d/30d may exceed the loaded records).
  const activityCoverage = useMemo(() => {
    const times = overviewAllActivity.map((a) => parseActivityTs(a.updated_at)).filter((t): t is number => !!t);
    return {
      count: overviewAllActivity.length,
      total: overviewActivityQuery.data?.total ?? overviewLoadedActivity.length,
      loaded: overviewLoadedActivity.length,
      loading:
        overviewActivityQuery.isFetching && overviewLoadedActivity.length < (overviewActivityQuery.data?.total ?? 0),
      oldest: times.length ? Math.min(...times) : null,
    };
  }, [
    overviewAllActivity,
    overviewLoadedActivity.length,
    overviewActivityQuery.data,
    overviewActivityQuery.isFetching,
  ]);
  const overviewLoading = overviewUsersQuery.isLoading || overviewActivityQuery.isLoading;

  const allUsers = allUsersQuery.data?.items ?? NONE;
  const allUsersTotal = allUsersQuery.data?.total ?? 0;

  // Names and avatars for the people on screen, store-first and batched
  // (useLiveProfiles). A name search — the directory's or Lookup's — matches
  // against every user, so while one is open every user's profile is asked
  // for, not only the page on screen.
  const nameSearchOpen = activeNameSearch || lookupOpen;
  const profilePubkeys = useMemo(() => {
    const out: string[] = [];
    for (const u of adminUsersList) out.push(u.pubkey);
    for (const u of overviewUsersQuery.data?.items ?? NONE) out.push(u.pubkey);
    for (const a of activityItems) if (a.pubkey) out.push(a.pubkey);
    if (nameSearchOpen) for (const u of allUsers) out.push(u.pubkey);
    return out;
  }, [adminUsersList, overviewUsersQuery.data, activityItems, nameSearchOpen, allUsers]);
  const liveProfiles = useLiveProfiles(profilePubkeys);
  const userProfiles = useMemo(() => {
    const m = new Map<string, { name?: string; picture?: string }>();
    for (const [pk, c] of liveProfiles) m.set(pk, { name: c.display_name || c.name, picture: c.picture });
    return m;
  }, [liveProfiles]);
  // A KPI card's filter or a name search narrows every user (allUsersQuery,
  // loaded whole), paged here; otherwise the directory is the backend's page.
  const clientFilteredUsers = activeNameSearch || !!kpiFilter;
  // Deferred: a long directory filters without holding up the box being typed in.
  const deferredUserSearch = useDeferredValue(userSearch);
  const filteredUsersList = useMemo(() => {
    const trimmed = deferredUserSearch.trim();
    const nameSearch = trimmed && isNameSearch(trimmed);
    let list = nameSearch || kpiFilter ? allUsers : adminUsersList;
    if (nameSearch) {
      const matched = new Set(matchUsersByName(list, userProfiles, trimmed).map((m) => m.pubkey));
      list = list.filter((u) => matched.has(u.pubkey));
    }
    if (kpiFilter) {
      list = list.filter((u) => {
        if (kpiFilter === "scored") return u.latest_status?.toLowerCase() === "success";
        if (kpiFilter === "sp_adopters") return u.latest_ta_status?.toLowerCase() === "success";
        if (kpiFilter === "queue")
          return u.latest_status?.toLowerCase() !== "success" && !isFailedStatus(u.latest_status);
        if (kpiFilter === "failed") return isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status);
        return true;
      });
    }
    return list;
  }, [adminUsersList, allUsers, kpiFilter, deferredUserSearch, isNameSearch, userProfiles]);

  // Everyone, now: the header cards.
  const nowMetrics = useMemo(
    () => computePipelineMetrics(allUsers, overviewLoadedActivity, allUsersTotal),
    [allUsers, overviewLoadedActivity, allUsersTotal],
  );

  const computedQueueDepth = useMemo(() => countQueued(allUsers), [allUsers]);

  const queuePositionByPrivateId = useMemo(
    () => queuePositions(overviewAllActivity, activityItems),
    [overviewAllActivity, activityItems],
  );

  const trends = useMemo(
    () => computeTrends(overviewLoadedActivity, overviewAllActivity, range, Date.now()),
    [overviewAllActivity, overviewLoadedActivity, range],
  );

  // The header's six figures — the system now — drawn once for the cards and
  // for the one-line strip the other tabs show.
  const headerFigures = {
    scored: nowMetrics
      ? `${formatNumber(nowMetrics.successCount)} / ${formatNumber(nowMetrics.total)}`
      : hasSystemData
        ? formatNumber(adminStats!.scoredUsers)
        : "0",
    published: nowMetrics
      ? `${formatNumber(nowMetrics.taSuccessCount)} / ${formatNumber(nowMetrics.total)}`
      : hasSystemData
        ? formatNumber(adminStats!.spAdopters)
        : "0",
    queue:
      computedQueueDepth !== null
        ? formatNumber(computedQueueDepth)
        : hasSystemData
          ? formatNumber(adminStats!.queueDepth)
          : "0",
    // Without the whole-table reads (a tab that doesn't draw them, before they
    // land) a figure the stats don't carry reads as unknown, not as zero.
    calcs: nowMetrics ? formatNumber(nowMetrics.totalCalcs) : "—",
    rate: nowMetrics ? `${nowMetrics.successRate}%` : trends.cmp.curSR !== null ? `${trends.cmp.curSR}%` : "—",
    failed: nowMetrics
      ? formatNumber(nowMetrics.failedCount)
      : overviewActivityQuery.data
        ? formatNumber(trends.cmp.curFailed)
        : "—",
  };

  const handleTriggerGraperank = useCallback(
    async (pubkey: string) => {
      if (claimTriggers([pubkey]).length === 0) return;
      try {
        await apiClient.triggerUserGraperank(pubkey);
        toast({ title: "GrapeRank triggered", description: `Triggered for ${pubkey.slice(0, 12)}...` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
        triggerRefreshBoost();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Trigger failed", description: message, variant: "destructive" });
      } finally {
        releaseTrigger(pubkey);
      }
    },
    [claimTriggers, releaseTrigger, toast, queryClient, triggerRefreshBoost],
  );

  const totalPages = clientFilteredUsers
    ? Math.max(1, Math.ceil(filteredUsersList.length / pageSize))
    : adminUsersTotalPages;

  const handleSort = useCallback((key: AdminSortKey) => {
    setUserSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
    setUserPage(0);
  }, []);

  const handlePageSizeChange = useCallback((val: string) => {
    setPageSize(parseInt(val, 10) as PageSizeOption);
    setUserPage(0);
  }, []);

  const jumpToUser = useCallback(
    (pubkey: string, displayName?: string) => {
      setUserSearch(pubkey);
      setUserPage(0);
      setKpiFilter(null);
      setLookupOpen(false);
      setHighlightedPubkey(pubkey);
      setExpandedRows(new Set([pubkey]));
      setTimeout(() => setHighlightedPubkey(null), 2500);
      const name = displayName || userProfiles.get(pubkey)?.name;
      toast({ title: "Jumped to user", description: name ? `Showing ${name}` : `Showing ${pubkey.slice(0, 16)}...` });
    },
    [toast, userProfiles],
  );

  // A key goes to the backend, which onboards it if it is new.
  const resolveLookupPubkey = useCallback(
    async (hexPubkey: string) => {
      const result = await apiClient.getBrainstormPubkey(hexPubkey);
      const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
      const isNew = data.created === true || data.is_new === true;
      if (isNew) {
        await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        toast({ title: "User Onboarded", description: "New user created — jumping to their row" });
      }
      return typeof data.pubkey === "string"
        ? data.pubkey
        : typeof data.brainstorm_pubkey === "string"
          ? data.brainstorm_pubkey
          : hexPubkey;
    },
    [queryClient, toast],
  );
  const onLookupFailed = useCallback(
    (message: string) => toast({ title: "Lookup Failed", description: message, variant: "destructive" }),
    [toast],
  );
  // A name is matched against every user, so the whole directory is read while
  // Lookup is open (needsAllUsers); until it lands, the page on screen stands in.
  const {
    lookup: handleLookup,
    nameResults: lookupNameResults,
    error: lookupError,
    setError: setLookupError,
    running: lookupRunning,
    reset: resetLookup,
  } = useUserLookup({
    users: allUsersQuery.isSuccess ? allUsers : adminUsersList,
    usersComplete: allUsersQuery.isSuccess,
    profiles: userProfiles,
    resolvePubkey: resolveLookupPubkey,
    jumpToUser,
    onFailed: onLookupFailed,
  });

  const handleOnboardSearch = useCallback(async () => {
    const q = onboardSearch.trim();
    if (!q || q.length < 2) {
      setOnboardError("Enter at least 2 characters to search");
      return;
    }
    setOnboardSearching(true);
    setOnboardError(null);
    setOnboardResults([]);
    try {
      const results = await searchNostrProfiles(q, { limit: 10 });
      if (results.length === 0) {
        setOnboardError("No profiles found — try a different name");
      } else {
        setOnboardResults(results);
      }
    } catch {
      setOnboardError("Search failed — the search relay may be unavailable");
    } finally {
      setOnboardSearching(false);
    }
  }, [onboardSearch]);

  const addToOnboardQueue = useCallback((profile: NostrSearchResult) => {
    setOnboardQueue((prev) => {
      if (prev.some((p) => p.pubkey === profile.pubkey)) return prev;
      return [...prev, profile];
    });
  }, []);

  const removeFromOnboardQueue = useCallback((pubkey: string) => {
    setOnboardQueue((prev) => prev.filter((p) => p.pubkey !== pubkey));
  }, []);

  const handleBulkPasteAdd = useCallback(() => {
    const lines = bulkPasteInput
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: NostrSearchResult[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      let hex = line;
      if (line.startsWith("npub")) {
        try {
          const decoded = nip19.decode(line);
          if (decoded.type === "npub") hex = decoded.data;
          else {
            errors.push(line.slice(0, 20) + "...");
            continue;
          }
        } catch {
          errors.push(line.slice(0, 20) + "...");
          continue;
        }
      } else if (!/^[0-9a-fA-F]{64}$/.test(line)) {
        errors.push(line.slice(0, 20) + "...");
        continue;
      }
      hex = hex.toLowerCase();
      if (!added.some((p) => p.pubkey === hex) && !onboardQueue.some((p) => p.pubkey === hex)) {
        added.push({ pubkey: hex, npub: nip19.npubEncode(hex) });
      }
    }
    if (added.length > 0) {
      setOnboardQueue((prev) => [...prev, ...added]);
      setBulkPasteInput("");
      toast({
        title: `${added.length} added to queue`,
        description: errors.length > 0 ? `${errors.length} invalid entries skipped` : undefined,
      });
    } else if (errors.length > 0) {
      setOnboardError(
        `Could not parse: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`,
      );
    }
  }, [bulkPasteInput, onboardQueue, toast]);

  const handleOnboardAll = useCallback(async () => {
    if (onboardQueue.length === 0) return;
    setOnboardingAll(true);
    setLookupResult(null);
    setLookupError(null);
    const total = onboardQueue.length;
    const results: { pubkey: string; name: string; success: boolean; message: string }[] = [];
    setOnboardProgress({ done: 0, total, results });

    for (let i = 0; i < onboardQueue.length; i++) {
      const profile = onboardQueue[i];
      const displayName = profile.displayName || profile.name || profile.pubkey.slice(0, 12) + "...";
      try {
        const result = await apiClient.getBrainstormPubkey(profile.pubkey);
        const data = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
        const isNew = data.created === true || data.is_new === true;
        results.push({
          pubkey: profile.pubkey,
          name: displayName,
          success: true,
          message: isNew ? "Onboarded" : "Already exists",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed";
        results.push({ pubkey: profile.pubkey, name: displayName, success: false, message: msg });
      }
      setOnboardProgress({ done: i + 1, total, results: [...results] });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    toast({
      title: `Onboarding complete`,
      description: `${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ""}`,
    });
    setOnboardQueue([]);
    setOnboardingAll(false);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  }, [onboardQueue, toast, queryClient, setLookupError]);

  const handleViewRequestDetail = useCallback((item: BrainstormRequestInstance) => {
    setDetailRequestId(item.private_id);
    setDetailOpen(true);
    setDetailLoading(false);
    setDetailError(null);
    const sensitiveKeys = new Set(["password"]);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (!sensitiveKeys.has(key)) {
        data[key] = value;
      }
    }
    setDetailData(data);
  }, []);

  // Another tab's link to a person: the Users tab, searched to them, their row open and lit.
  const openInUsers = (pubkey: string) => {
    setUserSearch(pubkey);
    setActiveTab("users");
    setKpiFilter(null);
    setUserPage(0);
    setExpandedRows(new Set([pubkey]));
    setHighlightedPubkey(pubkey);
    setTimeout(() => setHighlightedPubkey(null), 2500);
  };

  if (!user || isAuthRedirecting()) return null;

  const tabs: { key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "scheduling", label: "Scheduling", icon: CalendarClock },
    { key: "support", label: "Support", icon: LifeBuoy },
    // Gated on nothing. A fresh instance has billing enabled and zero plan
    // mappings, which is exactly when an admin needs this tab to create the
    // first one — gating on plans existing would be a bootstrap deadlock, and
    // the mock flag answers an unrelated question. Where billing isn't
    // configured the endpoints 404 and the cards say so.
    { key: "billing" as AdminTab, label: "Billing", icon: Receipt },
    { key: "users", label: "Users", icon: Users },
    { key: "trusted-lists", label: "Trusted Lists", icon: ListChecks },
    { key: "compromised", label: "Compromised", icon: KeyRound },
    { key: "growth", label: "Growth", icon: TrendingUp },
    ...(FEATURES.assistantsAdmin ? [{ key: "assistants" as AdminTab, label: "Assistants", icon: Sparkles }] : []),
    { key: "health", label: "System Health", icon: Server },
  ];

  return (
    <div
      className="relative flex min-h-page flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-admin"
    >
      <PageBackground />

      <AppHeader user={user} onLogout={handleLogout} active="admin" />

      <main className={cn(pageWidth("wide"), "relative z-10 flex-1 py-6 sm:py-8")}>
        <DeferredSessionNotice className="mb-6" />
        <div className="animate-fade-up space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-admin-header">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="amber" size="sm" dot className="font-bold uppercase tracking-[0.15em]">
                  NosFabrica Admin
                </Chip>
              </div>
              <h1
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span className="block pb-1">Admin Dashboard</span>
              </h1>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 sm:text-base">
                System overview and management for NosFabrica operators.
              </p>
            </div>
          </div>

          {/* One line on a desk; on a phone the kicker and "live now" share the
              first line and the note takes a line of its own beneath — three
              narrow columns of wrapped words was the alternative. */}
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="system-state-line">
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current system state
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              live now
            </span>
            <span
              className="basis-full text-[10px] text-slate-400 dark:text-slate-500 sm:basis-auto"
              data-testid="system-state-note"
            >
              <span className="hidden sm:inline">· </span>values are now
              {rangeDriven ? ` · sparklines and everything below: ${trends.cfg.longLabel.toLowerCase()}` : ""}
            </span>
            {rangeDriven && (
              <div className="flex basis-full items-center gap-2 sm:ml-auto sm:basis-auto">
                <div
                  className="hidden gap-0.5 rounded-lg border-2 border-brand-accent/40 bg-white p-1 shadow-sm dark:bg-slate-900 sm:inline-flex"
                  role="tablist"
                  aria-label="Time range"
                  data-testid="range-selector"
                >
                  {ADMIN_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={range === r}
                      onClick={() => setRange(r)}
                      className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold transition-all active:scale-95 ${range === r ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
                      data-testid={`button-range-${r}`}
                    >
                      {r === "all" ? "All" : r}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={customDays(range) !== null}
                    onClick={() => setCustomOpen((o) => !o)}
                    className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold transition-all active:scale-95 ${customDays(range) !== null ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
                    data-testid="button-range-custom"
                  >
                    {customDays(range) !== null ? `${customDays(range)}d` : "Custom"}
                  </button>
                </div>
                <select
                  value={customDays(range) !== null ? "custom" : range}
                  onChange={(e) =>
                    e.target.value === "custom" ? setCustomOpen(true) : setRange(e.target.value as AdminRange)
                  }
                  className="rounded-lg border border-brand-accent/30 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200 sm:hidden"
                  aria-label="Time range"
                  data-testid="select-range"
                >
                  {ADMIN_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {getWindowConfig(r).longLabel}
                    </option>
                  ))}
                  <option value="custom">
                    {customDays(range) !== null ? `Last ${customDays(range)} days` : "Custom…"}
                  </option>
                </select>
                {(customOpen || customDays(range) !== null) && (
                  <form
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"
                    data-testid="form-range-days"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Math.floor(Number(customDraft));
                      if (n >= 1 && n <= BACKEND_MAX_DAYS) {
                        setRange(`${n}d`);
                        setCustomOpen(false);
                      }
                    }}
                  >
                    last
                    <input
                      type="number"
                      min={1}
                      max={BACKEND_MAX_DAYS}
                      value={customDraft}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      aria-label="Days"
                      data-testid="input-range-days"
                    />
                    days
                    <button
                      type="submit"
                      className="rounded-md bg-brand-primary px-2 py-0.5 text-[11px] font-bold text-white"
                      data-testid="button-range-days-apply"
                    >
                      Go
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
          {activeTab === "overview" && (
            <div
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
              data-testid="section-kpi-strip"
            >
              <KpiCard
                label="Scored Users"
                value={headerFigures.scored}
                icon={UserCheck}
                subtitle={
                  nowMetrics ? `${nowMetrics.successRate}% have a GrapeRank score` : "Users with a GrapeRank score"
                }
                tooltip="Users whose last GrapeRank run succeeded — click to list them"
                onClick={() => {
                  setKpiFilter("scored");
                  setActiveTab("users");
                  setUserPage(0);
                }}
                sparklineData={trends.successSeries}
                sparklineTimestamps={trends.bucketTimestamps}
                sparklineColor="#10b981"
                sparklineValueLabel="successes"
              />
              <KpiCard
                label="Assertions Published"
                value={headerFigures.published}
                icon={Shield}
                subtitle={
                  nowMetrics
                    ? `${nowMetrics.taAdoptionRate}% publish trusted assertions`
                    : "Users publishing trusted assertions"
                }
                tooltip="Users whose scores are published to relays as NIP-85 trusted assertions — click to list them"
                onClick={() => {
                  setKpiFilter("sp_adopters");
                  setActiveTab("users");
                  setUserPage(0);
                }}
              />
              <KpiCard
                label="Queue Depth"
                value={headerFigures.queue}
                icon={Clock}
                subtitle={
                  computedQueueDepth !== null
                    ? "Users awaiting calculation"
                    : hasSystemData
                      ? "Users awaiting calculation"
                      : queuePosition !== null
                        ? "Position in queue"
                        : "Via graperankResult"
                }
                tooltip="Click to view queued users"
                onClick={() => {
                  setKpiFilter("queue");
                  setActiveTab("users");
                  setUserPage(0);
                }}
              />
              <KpiCard
                label="Total Calcs"
                value={headerFigures.calcs}
                icon={Activity}
                subtitle="Cumulative attempts, all users"
                tooltip="Cumulative calculation attempts across all users"
                sparklineData={trends.totalSeries}
                sparklineTimestamps={trends.bucketTimestamps}
                sparklineColor="#13d2e5"
                sparklineValueLabel="calcs / hr"
              />
              <KpiCard
                label="Success Rate"
                value={headerFigures.rate}
                icon={CheckCircle2}
                subtitle="Cumulative success rate"
                tooltip="Successful calculations as % of attempted"
                sparklineData={trends.rateSeries}
                sparklineTimestamps={trends.bucketTimestamps}
                sparklineColor="#10b981"
                sparklineValueLabel="success rate"
                sparklineValueSuffix="%"
              />
              <KpiCard
                label="Failed Count"
                value={headerFigures.failed}
                icon={AlertTriangle}
                subtitle="Users with a failed run"
                tooltip="Click to view users with failures"
                onClick={() => {
                  setKpiFilter("failed");
                  setActiveTab("users");
                  setUserPage(0);
                }}
                sparklineData={trends.failedSeries}
                sparklineTimestamps={trends.bucketTimestamps}
                sparklineColor="#f87171"
                sparklineValueLabel="failures"
              />
            </div>
          )}
          {activeTab !== "overview" && (
            <p
              className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300"
              data-testid="kpi-compact"
            >
              <span>
                <b className="font-semibold text-slate-900 dark:text-slate-100">{headerFigures.scored}</b> scored
              </span>
              <span>
                <b className="font-semibold text-slate-900 dark:text-slate-100">{headerFigures.published}</b> published
              </span>
              <span>
                <b className="font-semibold text-slate-900 dark:text-slate-100">{headerFigures.queue}</b> queued
              </span>
              <span>
                <b className="font-semibold text-slate-900 dark:text-slate-100">{headerFigures.calcs}</b> calcs
              </span>
              <span>
                <b className="font-semibold text-slate-900 dark:text-slate-100">{headerFigures.rate}</b> success
              </span>
              <span>
                <b className="font-semibold text-slate-900 dark:text-slate-100">{headerFigures.failed}</b> failed
              </span>
            </p>
          )}

          <div className="scrollbar-hide -mx-4 hidden overflow-x-auto px-4 sm:mx-0 sm:block sm:px-0">
            <div
              className="flex w-fit gap-1 rounded-2xl border border-brand-accent/10 bg-white/60 p-1 backdrop-blur-sm dark:bg-slate-900/60"
              data-testid="admin-tab-bar"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setUserPage(0);
                      if (tab.key === "users") setKpiFilter(null);
                    }}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 sm:gap-2 sm:px-4 sm:text-sm ${
                      active
                        ? "bg-brand-primary text-white shadow-md"
                        : "text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
                    }`}
                    data-testid={`tab-${tab.key}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.key === "support" && supportUnread > 0 && (
                      <span
                        className={`h-2 w-2 rounded-full ${active ? "bg-white" : "bg-brand-accent"}`}
                        aria-label={`${supportUnread} tickets awaiting reply`}
                        data-testid="tab-support-dot"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:hidden" data-testid="admin-tab-bar-mobile">
            {(() => {
              const [mobileTabOpen, setMobileTabOpen] = [mobileTabDropdownOpen, setMobileTabDropdownOpen];
              const activeTabData = tabs.find((t) => t.key === activeTab);
              const ActiveIcon = activeTabData?.icon ?? BarChart3;
              return (
                <div className="relative">
                  <button
                    onClick={() => setMobileTabOpen(!mobileTabOpen)}
                    className="flex w-full items-center justify-between rounded-2xl border border-brand-accent/10 bg-white/60 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:bg-slate-900/60 dark:text-slate-200"
                    data-testid="button-tab-mobile-trigger"
                  >
                    <span className="flex items-center gap-2">
                      <ActiveIcon className="h-4 w-4 text-brand-deep" />
                      {activeTabData?.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${mobileTabOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {mobileTabOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMobileTabOpen(false)} />
                      <div
                        className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-brand-accent/15 bg-white shadow-lg dark:bg-slate-900"
                        data-testid="dropdown-tab-mobile"
                      >
                        {tabs.map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.key;
                          return (
                            <button
                              key={tab.key}
                              onClick={() => {
                                setActiveTab(tab.key);
                                setUserPage(0);
                                if (tab.key === "users") setKpiFilter(null);
                                setMobileTabOpen(false);
                              }}
                              className={`flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors ${
                                isActive
                                  ? "bg-gradient-to-r from-brand-deep/10 to-brand-accent/10 text-brand-deep"
                                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                              }`}
                              data-testid={`tab-mobile-${tab.key}`}
                            >
                              <Icon
                                className={`h-4 w-4 ${isActive ? "text-brand-deep" : "text-slate-400 dark:text-slate-500"}`}
                              />
                              {tab.label}
                              {isActive && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-brand-deep" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {activeTab === "overview" && (
            <div className="space-y-6" data-testid="panel-overview">
              <p className="text-[11px] text-slate-400 dark:text-slate-500" data-testid="trend-window-caption">
                <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {trends.cfg.longLabel}
                </span>
                {activityCoverage.count > 0 && ` · ${activityCoverage.count} records`}
                {activityCoverage.oldest ? ` since ${new Date(activityCoverage.oldest).toLocaleDateString()}` : ""}
                {activityCoverage.loading
                  ? ` · loading ${activityCoverage.loaded.toLocaleString()} of ${activityCoverage.total.toLocaleString()}…`
                  : ""}
              </p>

              {(() => {
                const actSummaryActivity = overviewAllActivity;
                const actSummaryUsers = overviewAllUsers;
                const actSummaryLoading = overviewLoading;
                // Already cut to the dashboard's range.
                const filteredItems = actSummaryActivity;
                const rangeLong = trends.cfg.longLabel;
                const rangeShort = trends.cfg.shortLabel;
                const filteredSuccess = filteredItems.filter((a) => a.status?.toLowerCase() === "success").length;
                const filteredFailed = filteredItems.filter(isFailedActivity).length;
                const filteredTotal = filteredItems.length;
                const sortedByUpdate = [...actSummaryUsers].sort((a, b) => {
                  const ta = new Date(a.last_updated || "").getTime() || 0;
                  const tb = new Date(b.last_updated || "").getTime() || 0;
                  return tb - ta;
                });
                const lastActivityTs = sortedByUpdate[0]?.last_updated ?? null;
                const uniquePubkeys = new Set(filteredItems.map((a) => a.pubkey).filter(Boolean)).size;

                return (
                  <div
                    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                    data-testid="card-activity-summary"
                  >
                    <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 items-center gap-2">
                          <div>
                            <h3
                              className="text-sm font-bold text-slate-900 dark:text-slate-100"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              Activity Summary
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              Platform-wide throughput —{" "}
                              <span className="font-semibold text-brand-deep">{rangeLong}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={
                              overviewActivityQuery.isSuccess && overviewUsersQuery.isSuccess
                                ? "connected"
                                : overviewActivityQuery.isError || overviewUsersQuery.isError
                                  ? "disconnected"
                                  : "degraded"
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      {actSummaryLoading ? (
                        <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-total"
                          >
                            <Activity className="mx-auto mb-1 h-4 w-4 text-brand-deep" />
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {filteredTotal.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Requests</p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-success"
                          >
                            <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                              {filteredSuccess.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Succeeded</p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-failed"
                          >
                            <XCircle className="mx-auto mb-1 h-4 w-4 text-red-400" />
                            <p className="text-lg font-bold text-red-500">{filteredFailed.toLocaleString()}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Failed</p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/50 p-3 text-center dark:border-slate-800/60 dark:bg-slate-900/50"
                            data-testid="summary-unique-users"
                          >
                            <Users className="mx-auto mb-1 h-4 w-4 text-blue-500" />
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {uniquePubkeys.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{rangeShort} Active Users</p>
                          </div>
                        </div>
                      )}
                      {lastActivityTs && !actSummaryLoading && (
                        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                          Last platform activity:{" "}
                          {(() => {
                            try {
                              const d = new Date(lastActivityTs.endsWith("Z") ? lastActivityTs : lastActivityTs + "Z");
                              return d.toLocaleString();
                            } catch {
                              return lastActivityTs;
                            }
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-trend-strip"
              >
                <div className="flex items-center justify-between gap-3 border-b border-brand-accent/10 px-5 py-3">
                  <div>
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                      data-testid="text-trend-strip-title"
                    >
                      {trends.cfg.longLabel}
                    </h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {trends.cmp.curTotal.toLocaleString()} calc{trends.cmp.curTotal === 1 ? "" : "s"}
                        {trends.cmp.curSR !== null ? `, ${trends.cmp.curSR}% succeeded` : ""}
                        {!trends.dataCoversWindow && trends.hasAnyActivity ? " · data may be partial" : ""}
                      </span>
                      <DeltaIndicator
                        delta={trends.hasPriorWindow ? trends.cmp.curTotal - trends.cmp.prevTotal : null}
                        insufficient={!trends.hasPriorWindow}
                        label={trends.cfg.priorLabel}
                      />
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" /> {trends.cfg.bucketUnitLabel}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Failure rate
                    </span>
                  </div>
                </div>
                <div className="px-3 py-3" style={{ height: 140 }}>
                  {overviewActivityQuery.isLoading && !trends.hasAnyActivity ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  ) : !trends.hasAnyActivity ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-slate-400 dark:text-slate-500">
                      No activity in the {trends.cfg.longLabel.toLowerCase()}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trends.buckets.map((b) => ({
                          bucket: trends.cfg.bucketLabelFn(b.t),
                          ts: b.t,
                          total: b.total,
                          failureRate:
                            b.success + b.failed === 0 ? 0 : Math.round((b.failed / (b.success + b.failed)) * 100),
                        }))}
                        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#13d2e5" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#13d2e5" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="failRateGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="bucket"
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          interval={trends.cfg.xAxisInterval}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 9, fill: "#fca5a5" }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                          domain={[0, 100]}
                          unit="%"
                        />
                        <RcTooltip
                          contentStyle={{
                            fontSize: 11,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            padding: "6px 8px",
                          }}
                          labelFormatter={(_, items) => {
                            const ts = items?.[0]?.payload?.ts as number | undefined;
                            return ts ? trends.cfg.bucketTooltipFn(ts) : "";
                          }}
                          formatter={(v: number, name: string) =>
                            name === "Failure rate" ? [`${v}%`, name] : [v, name]
                          }
                        />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="total"
                          name={trends.cfg.bucketUnitLabel}
                          stroke="#13d2e5"
                          strokeWidth={1.5}
                          fill="url(#totalGrad)"
                        />
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="failureRate"
                          name="Failure rate"
                          stroke="#f87171"
                          strokeWidth={1}
                          fill="url(#failRateGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {(() => {
                  const failureWindowMs = trends.cfg.windowMs;
                  const failureNow = Date.now();
                  const failedItems = overviewAllActivity.filter((item) => {
                    if (!isItemFailed(item)) return false;
                    const t = parseActivityTs(item.updated_at);
                    if (!t) return false;
                    const age = failureNow - t;
                    return age >= 0 && age < failureWindowMs;
                  });
                  const groups = new Map<
                    string,
                    { count: number; latest: BrainstormRequestInstance; pubkeys: Set<string> }
                  >();
                  for (const item of failedItems) {
                    const key = normalizeErrorKey(extractErrorMessage(item)) + "|" + (getFailureStage(item) ?? "");
                    const existing = groups.get(key);
                    if (existing) {
                      existing.count += 1;
                      if (item.pubkey) existing.pubkeys.add(item.pubkey);
                      const latestT = new Date(
                        existing.latest.updated_at.endsWith("Z")
                          ? existing.latest.updated_at
                          : existing.latest.updated_at + "Z",
                      ).getTime();
                      const itemT = new Date(
                        item.updated_at.endsWith("Z") ? item.updated_at : item.updated_at + "Z",
                      ).getTime();
                      if (itemT > latestT) existing.latest = item;
                    } else {
                      groups.set(key, { count: 1, latest: item, pubkeys: new Set(item.pubkey ? [item.pubkey] : []) });
                    }
                  }
                  const sortedGroups = Array.from(groups.values())
                    .sort((a, b) => {
                      const at = new Date(
                        a.latest.updated_at.endsWith("Z") ? a.latest.updated_at : a.latest.updated_at + "Z",
                      ).getTime();
                      const bt = new Date(
                        b.latest.updated_at.endsWith("Z") ? b.latest.updated_at : b.latest.updated_at + "Z",
                      ).getTime();
                      if (bt !== at) return bt - at;
                      return b.count - a.count;
                    })
                    .slice(0, 8);
                  const totalFailures = failedItems.length;
                  const dataUnavailable =
                    overviewActivityQuery.isError ||
                    (!overviewActivityQuery.isSuccess && !overviewActivityQuery.isLoading);
                  // Nothing to act on: one line, not a block of empty space.
                  const quiet = !dataUnavailable && !overviewLoading && totalFailures === 0;
                  return (
                    <div
                      className={`overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm dark:shadow-none lg:col-span-2 ${quiet ? "border-border" : "border-red-200/70 dark:border-red-500/25"}`}
                      data-testid="card-recent-failures"
                    >
                      <div className={quiet ? "px-5 py-3" : "border-b border-red-100 px-5 py-4 dark:border-red-500/20"}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3
                              className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {quiet ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              )}
                              Recent Failures
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {totalFailures === 0
                                ? `No failures in ${trends.cfg.windowPhrase}.`
                                : `${totalFailures} failed request${totalFailures === 1 ? "" : "s"} in ${trends.cfg.windowPhrase}, grouped into ${sortedGroups.length} pattern${sortedGroups.length === 1 ? "" : "s"}.`}
                            </p>
                          </div>
                          <Chip
                            tone={totalFailures === 0 ? "emerald" : "red"}
                            className="px-2 py-1 font-bold tabular-nums"
                            data-testid="badge-failure-count"
                          >
                            {totalFailures}
                          </Chip>
                        </div>
                      </div>
                      {quiet ? null : (
                        <div className="p-5">
                          {overviewActivityQuery.isError ? (
                            <div
                              className="flex flex-col items-center justify-center py-6 text-center"
                              data-testid="failures-error-state"
                            >
                              <XCircle className="mb-2 h-8 w-8 text-red-400" />
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Couldn't load failure data
                              </p>
                              <p className="mt-1 max-w-md text-[11px] text-slate-500 dark:text-slate-400">
                                {overviewActivityQuery.error instanceof Error
                                  ? overviewActivityQuery.error.message
                                  : "The /admin/activity endpoint did not respond. Failure status is unknown."}
                              </p>
                            </div>
                          ) : overviewLoading && totalFailures === 0 ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                            </div>
                          ) : dataUnavailable ? (
                            <div
                              className="flex flex-col items-center justify-center py-6 text-center"
                              data-testid="failures-unknown-state"
                            >
                              <AlertTriangle className="mb-2 h-8 w-8 text-amber-400" />
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Failure status unavailable
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                Activity data has not loaded yet.
                              </p>
                            </div>
                          ) : totalFailures === 0 ? (
                            <div
                              className="flex flex-col items-center justify-center py-6 text-center"
                              data-testid="failures-empty-state"
                            >
                              <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                All recent requests succeeded
                              </p>
                              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                No errors found in the latest activity feed.
                              </p>
                            </div>
                          ) : (
                            <ul className="space-y-2.5" data-testid="list-recent-failures">
                              {sortedGroups.map((g, idx) => {
                                const stage = getFailureStage(g.latest) ?? "Pipeline";
                                const errMsg = extractErrorMessage(g.latest);
                                const userCount = g.pubkeys.size;
                                return (
                                  <li
                                    key={idx}
                                    className="rounded-lg border border-red-200 bg-white/70 p-3 dark:border-red-500/25 dark:bg-slate-900/70"
                                    data-testid={`failure-group-${idx}`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                      <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                                            {stage}
                                          </span>
                                          {g.count > 1 && (
                                            <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-700 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300">
                                              {g.count}× occurrences
                                            </span>
                                          )}
                                          {userCount > 0 && (
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                              {userCount} user{userCount === 1 ? "" : "s"} affected
                                            </span>
                                          )}
                                          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                                            {timeAgo(g.latest.updated_at) || formatTimestamp(g.latest.updated_at)}
                                          </span>
                                        </div>
                                        <p className="break-words font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
                                          {truncateError(errMsg, 220)}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          {g.latest.pubkey && (
                                            <button
                                              onClick={() => {
                                                const pk = g.latest.pubkey!;
                                                openInUsers(pk);
                                              }}
                                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-deep hover:text-brand-accent"
                                              data-testid={`failure-group-view-user-${idx}`}
                                            >
                                              <Eye className="h-3 w-3" /> View latest affected user
                                            </button>
                                          )}
                                          {g.latest.pubkey && (
                                            <ConfirmRetriggerButton
                                              pubkey={g.latest.pubkey}
                                              testId={`failure-group-retrigger-${idx}`}
                                              onConfirm={async (pk) => {
                                                try {
                                                  await retriggerOne(pk);
                                                  toast({
                                                    title: "Request Queued",
                                                    description: `Re-triggered GrapeRank for ${pk.slice(0, 12)}...`,
                                                  });
                                                  queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                                                  queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                                  triggerRefreshBoost();
                                                } catch (err: unknown) {
                                                  const msg = err instanceof Error ? err.message : "Unknown error";
                                                  toast({
                                                    title: "Re-trigger Failed",
                                                    description: msg,
                                                    variant: "destructive",
                                                  });
                                                  throw err;
                                                }
                                              }}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <>
              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="panel-users"
              >
                <div className="flex flex-col gap-3 border-b border-brand-accent/10 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <h3
                      className="text-sm font-bold text-slate-900 dark:text-slate-100"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      User Database
                    </h3>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {(clientFilteredUsers ? filteredUsersList.length : adminUsersTotal).toLocaleString()} users
                        {activeNameSearch && userSearch.trim() ? " (filtered)" : ""}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        Page {userPage + 1} of {totalPages}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <AdminSearchInput
                        value={userSearch}
                        onCommit={(text) => {
                          setUserSearch(text);
                          setUserPage(0);
                        }}
                        onClear={() => {
                          setUserSearch("");
                          setUserPage(0);
                          setHighlightedPubkey(null);
                          setExpandedRows(new Set());
                        }}
                        placeholder="Search name, pubkey, npub..."
                        className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 pr-7 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                        testId="input-user-search"
                        clearTestId="button-clear-search"
                      />
                    </div>
                    <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger
                        className="h-8 w-20 rounded-xl border-slate-200 text-xs dark:border-slate-800"
                        data-testid="select-page-size"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLookupOpen(true);
                        setLookupMode("lookup");
                        setLookupResult(null);
                        setLookupError(null);
                        resetLookup();
                        setOnboardSearch("");
                        setOnboardResults([]);
                        setOnboardError(null);
                        setOnboardQueue([]);
                        setBulkPasteOpen(false);
                        setBulkPasteInput("");
                        setOnboardProgress(null);
                      }}
                      className="no-default-hover-elevate no-default-active-elevate h-8 gap-1.5 text-xs"
                      data-testid="button-lookup-pubkey"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Lookup / Onboard
                    </Button>
                  </div>

                  <Dialog
                    open={lookupOpen}
                    onOpenChange={(open) => {
                      if (onboardingAll) return;
                      setLookupOpen(open);
                      if (!open) {
                        setLookupResult(null);
                        setLookupError(null);
                        setOnboardResults([]);
                        setOnboardError(null);
                        setOnboardProgress(null);
                      }
                    }}
                  >
                    <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          {lookupMode === "lookup" ? (
                            <Search className="h-5 w-5 text-brand-deep" />
                          ) : (
                            <UserPlus className="h-5 w-5 text-brand-deep" />
                          )}
                          {lookupMode === "lookup" ? "Lookup User" : "Onboard User"}
                        </DialogTitle>
                        <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
                          {lookupMode === "lookup"
                            ? "Find a user by name, pubkey, or npub and jump to their row in the table."
                            : "Search Nostr by name to find and onboard a user into Brainstorm."}
                        </DialogDescription>
                      </DialogHeader>

                      <div
                        className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800"
                        data-testid="toggle-lookup-mode"
                      >
                        <button
                          onClick={() => {
                            setLookupMode("lookup");
                            setLookupResult(null);
                            setLookupError(null);
                            resetLookup();
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${lookupMode === "lookup" ? "border border-slate-200 bg-white text-brand-deep shadow-sm dark:border-slate-800 dark:bg-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
                          data-testid="button-mode-lookup"
                        >
                          <Search className="h-3 w-3" />
                          Lookup
                        </button>
                        <button
                          onClick={() => {
                            setLookupMode("onboard");
                            setLookupResult(null);
                            setLookupError(null);
                          }}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${lookupMode === "onboard" ? "border border-slate-200 bg-white text-brand-deep shadow-sm dark:border-slate-800 dark:bg-slate-900" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
                          data-testid="button-mode-onboard"
                        >
                          <UserPlus className="h-3 w-3" />
                          Onboard
                        </button>
                      </div>

                      {lookupMode === "lookup" ? (
                        <div className="space-y-3 overflow-hidden pt-1">
                          <LookupQueryInput running={lookupRunning} onSubmit={handleLookup} onEdit={resetLookup} />

                          {lookupNameResults.length > 0 && (
                            <div className="space-y-1" data-testid="lookup-name-results">
                              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {lookupNameResults.length} user{lookupNameResults.length !== 1 ? "s" : ""} found
                              </p>
                              <div className="-mx-1 max-h-[200px] space-y-1 overflow-y-auto px-1">
                                {lookupNameResults.map((u) => {
                                  const npub = nip19.npubEncode(u.pubkey);
                                  return (
                                    <div
                                      key={u.pubkey}
                                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 transition-all hover:border-brand-accent/30 hover:bg-brand-primary/10 dark:border-slate-800 dark:bg-slate-900/80"
                                      onClick={() => jumpToUser(u.pubkey, u.name)}
                                      data-testid={`lookup-name-result-${u.pubkey.slice(0, 8)}`}
                                    >
                                      {u.picture ? (
                                        <img
                                          src={u.picture}
                                          alt=""
                                          className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
                                        />
                                      ) : (
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
                                          <User className="h-3.5 w-3.5 text-brand-deep/60" />
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                                          {u.name || "Unknown"}
                                        </p>
                                        <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                          {npub.slice(0, 20)}...{npub.slice(-6)}
                                        </p>
                                      </div>
                                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 overflow-hidden pt-1">
                          <div className="flex min-w-0 gap-2">
                            <input
                              type="text"
                              placeholder="Search by name..."
                              value={onboardSearch}
                              onChange={(e) => {
                                setOnboardSearch(e.target.value);
                                setOnboardError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !onboardSearching) handleOnboardSearch();
                              }}
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                              data-testid="input-onboard-search"
                              disabled={onboardingAll}
                            />
                            <Button
                              size="sm"
                              onClick={handleOnboardSearch}
                              disabled={onboardSearching || !onboardSearch.trim() || onboardingAll}
                              className="no-default-hover-elevate no-default-active-elevate shrink-0 gap-1.5 text-xs"
                              data-testid="button-submit-onboard-search"
                            >
                              {onboardSearching ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Search className="h-3.5 w-3.5" />
                              )}
                              {onboardSearching ? "..." : "Search"}
                            </Button>
                          </div>
                          <p className="-mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                            <Globe className="h-2.5 w-2.5 shrink-0" />
                            Powered by Brainstorm WoT search
                          </p>

                          {onboardResults.length > 0 && !onboardingAll && (
                            <div
                              className="-mx-1 max-h-[180px] space-y-1 overflow-y-auto overflow-x-hidden px-1"
                              data-testid="onboard-results"
                            >
                              {onboardResults.map((profile) => {
                                const displayName =
                                  profile.displayName || profile.name || profile.npub.slice(0, 16) + "...";
                                const isQueued = onboardQueue.some((p) => p.pubkey === profile.pubkey);
                                return (
                                  <div
                                    key={profile.pubkey}
                                    className={`flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border p-2 transition-all ${isQueued ? "border-brand-accent/40 bg-brand-primary/10" : "border-slate-200 bg-white/80 hover:border-brand-accent/20 hover:bg-brand-primary/10 dark:border-slate-800 dark:bg-slate-900/80"}`}
                                    onClick={() =>
                                      isQueued ? removeFromOnboardQueue(profile.pubkey) : addToOnboardQueue(profile)
                                    }
                                    data-testid={`onboard-result-${profile.pubkey.slice(0, 8)}`}
                                  >
                                    <div
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${isQueued ? "border-brand-deep bg-brand-deep" : "border-slate-300 dark:border-slate-700"}`}
                                    >
                                      {isQueued && <CheckCircle2 className="h-3 w-3 text-white" />}
                                    </div>
                                    {profile.picture ? (
                                      <img
                                        src={profile.picture}
                                        alt=""
                                        className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
                                        <Users className="h-3 w-3 text-brand-deep/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                      <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                                        {displayName}
                                      </p>
                                      <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                        {profile.npub.slice(0, 16)}...{profile.npub.slice(-4)}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {!onboardingAll && (
                            <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
                              <button
                                onClick={() => setBulkPasteOpen((prev) => !prev)}
                                className="flex w-full items-center gap-1.5 text-[10px] font-semibold text-slate-500 transition-colors hover:text-brand-deep dark:text-slate-400"
                                data-testid="button-toggle-bulk-paste"
                              >
                                <FileText className="h-3 w-3" />
                                Import by npub list
                                <ChevronDown
                                  className={`ml-auto h-3 w-3 transition-transform ${bulkPasteOpen ? "rotate-180" : ""}`}
                                />
                              </button>
                              {bulkPasteOpen && (
                                <div className="mt-2 space-y-2">
                                  <textarea
                                    placeholder={"Paste npubs or hex pubkeys\nOne per line or comma-separated"}
                                    value={bulkPasteInput}
                                    onChange={(e) => setBulkPasteInput(e.target.value)}
                                    className="h-16 w-full resize-none rounded-lg border border-slate-200 bg-white/80 px-3 py-2 font-mono text-[10px] focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
                                    data-testid="textarea-bulk-paste"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleBulkPasteAdd}
                                    disabled={!bulkPasteInput.trim()}
                                    className="no-default-hover-elevate no-default-active-elevate h-7 w-full gap-1 text-[10px]"
                                    data-testid="button-bulk-paste-add"
                                  >
                                    <UserPlus className="h-3 w-3" />
                                    Add to queue
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}

                          {onboardError && (
                            <div
                              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-500/25 dark:bg-red-500/10"
                              data-testid="onboard-error"
                            >
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                              <p className="text-[11px] text-red-700 dark:text-red-300">{onboardError}</p>
                            </div>
                          )}

                          {onboardQueue.length > 0 && (
                            <div
                              className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800"
                              data-testid="onboard-queue"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Onboard Queue ({onboardQueue.length})
                                </span>
                                {!onboardingAll && (
                                  <button
                                    onClick={() => setOnboardQueue([])}
                                    className="text-[10px] text-slate-400 transition-colors hover:text-red-500 dark:text-slate-500"
                                    data-testid="button-clear-queue"
                                  >
                                    Clear all
                                  </button>
                                )}
                              </div>
                              <div className="flex max-h-[100px] flex-wrap gap-1.5 overflow-y-auto overflow-x-hidden">
                                {onboardQueue.map((profile) => {
                                  const displayName =
                                    profile.displayName || profile.name || profile.npub.slice(0, 10) + "...";
                                  const progressItem = onboardProgress?.results.find(
                                    (r) => r.pubkey === profile.pubkey,
                                  );
                                  return (
                                    <div
                                      key={profile.pubkey}
                                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] transition-all ${
                                        progressItem
                                          ? progressItem.success
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                            : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                          : "border-brand-accent/20 bg-brand-primary/10 text-slate-700 dark:bg-brand-primary/10 dark:text-slate-200"
                                      }`}
                                      data-testid={`queue-item-${profile.pubkey.slice(0, 8)}`}
                                    >
                                      {profile.picture ? (
                                        <img
                                          src={profile.picture}
                                          alt=""
                                          className="h-4 w-4 shrink-0 rounded-full object-cover"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                          }}
                                        />
                                      ) : null}
                                      <span className="max-w-[80px] truncate font-medium">{displayName}</span>
                                      {progressItem ? (
                                        progressItem.success ? (
                                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                                        ) : (
                                          <XCircle className="h-3 w-3 shrink-0 text-red-500" />
                                        )
                                      ) : !onboardingAll ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeFromOnboardQueue(profile.pubkey);
                                          }}
                                          className="shrink-0 transition-colors hover:text-red-500"
                                          data-testid={`button-remove-${profile.pubkey.slice(0, 8)}`}
                                        >
                                          <XCircle className="h-3 w-3" />
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>

                              {onboardingAll && onboardProgress && (
                                <div className="space-y-1.5">
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-brand-accent to-brand-deep transition-all duration-300"
                                      style={{ width: `${(onboardProgress.done / onboardProgress.total) * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                                    {onboardProgress.done} of {onboardProgress.total} processed
                                  </p>
                                </div>
                              )}

                              {!onboardingAll && !onboardProgress && (
                                <Button
                                  size="sm"
                                  onClick={handleOnboardAll}
                                  className="no-default-hover-elevate no-default-active-elevate h-8 w-full gap-1.5 text-xs"
                                  data-testid="button-onboard-all"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Onboard All ({onboardQueue.length})
                                </Button>
                              )}

                              {onboardProgress && !onboardingAll && (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                                      {onboardProgress.results.filter((r) => r.success).length} onboarded
                                      {onboardProgress.results.filter((r) => !r.success).length > 0 &&
                                        `, ${onboardProgress.results.filter((r) => !r.success).length} failed`}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {lookupError && lookupMode === "lookup" && (
                        <div
                          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10"
                          data-testid="lookup-error"
                        >
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                          <p className="text-xs text-red-700 dark:text-red-300">{lookupError}</p>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>

                {(selectedUserPubkeys.size > 0 || (bulkLastResult && bulkLastResult.source !== "activity")) && (
                  <div className="space-y-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800/60 sm:px-5">
                    {selectedUserPubkeys.size > 0 &&
                      (() => {
                        const dedupePubkeys = Array.from(selectedUserPubkeys);
                        const liveCount = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
                          : 0;
                        const liveTotal = bulkRunning ? bulkStatuses.size : 0;
                        const liveFailed = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length
                          : 0;
                        const clientFiltered = clientFilteredUsers;
                        const matchingTotal = clientFiltered ? filteredUsersList.length : adminUsersTotal;
                        const visibleCount = (
                          clientFilteredUsers
                            ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                            : filteredUsersList
                        ).length;
                        const filtersActive = activeNameSearch || !!debouncedSearch || !!kpiFilter;
                        const canSelectAllMatching = filtersActive && matchingTotal > visibleCount;
                        const matchingLabelSuffix = kpiFilter && !activeNameSearch ? " in cache" : "";
                        const handleSelectAllMatching = async () => {
                          const cap = Math.min(matchingTotal, SELECT_ALL_MATCHING_CAP);
                          if (clientFiltered) {
                            setSelectedUserPubkeys(new Set(filteredUsersList.slice(0, cap).map((u) => u.pubkey)));
                            return;
                          }
                          try {
                            setFetchingMatching(true);
                            const resp = await apiClient.getAdminUsers({
                              search: debouncedSearch || undefined,
                              sort: userSort.key,
                              order: userSort.dir,
                              days: ALL_USERS_DAYS,
                              page: 1,
                              size: cap,
                            });
                            setSelectedUserPubkeys(
                              new Set((resp.items ?? []).slice(0, cap).map((u: { pubkey: string }) => u.pubkey)),
                            );
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : "Unknown error";
                            toast({
                              title: "Failed to fetch matching users",
                              description: msg,
                              variant: "destructive",
                            });
                          } finally {
                            setFetchingMatching(false);
                          }
                        };
                        return (
                          <div
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10"
                            data-testid="bulk-toolbar-users"
                          >
                            <CheckSquare className="h-4 w-4 text-brand-deep" />
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {dedupePubkeys.length} selected
                            </span>
                            {canSelectAllMatching && (
                              <button
                                onClick={handleSelectAllMatching}
                                disabled={bulkRunning || fetchingMatching}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-deep hover:underline disabled:opacity-40"
                                data-testid="button-bulk-select-all-matching-users"
                              >
                                {fetchingMatching && <Loader2 className="h-3 w-3 animate-spin" />}
                                Select all {Math.min(matchingTotal, SELECT_ALL_MATCHING_CAP)} matching
                                {matchingLabelSuffix}
                                {matchingTotal > SELECT_ALL_MATCHING_CAP
                                  ? ` (capped at ${SELECT_ALL_MATCHING_CAP})`
                                  : ""}
                              </button>
                            )}
                            {bulkRunning && (
                              <span
                                className="text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                data-testid="bulk-progress-users"
                              >
                                {liveCount} of {liveTotal} triggered… {liveFailed > 0 ? `${liveFailed} failed` : ""}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => bulk.ask({ pubkeys: dedupePubkeys, source: "users" })}
                                disabled={bulkRunning || dedupePubkeys.length === 0}
                                className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                                data-testid="button-bulk-retrigger-users"
                              >
                                {bulkRunning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Re-trigger {dedupePubkeys.length} user{dedupePubkeys.length !== 1 ? "s" : ""}
                              </Button>
                              <button
                                onClick={() => setSelectedUserPubkeys(new Set())}
                                disabled={bulkRunning}
                                className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                                data-testid="button-bulk-clear-users"
                              >
                                Clear selection
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    {bulkLastResult && bulkLastResult.source === "users" && (
                      <div
                        className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${bulkLastResult.failures.length === 0 ? "border-emerald-300/50 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-300/50 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"}`}
                        data-testid="bulk-result-users"
                      >
                        {bulkLastResult.failures.length === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {bulkLastResult.successes.length} succeeded · {bulkLastResult.failures.length} failed
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          {bulkLastResult.failures.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                bulk.ask({
                                  pubkeys: bulkLastResult.failures.map((f) => f.pubkey),
                                  source: "retry",
                                })
                              }
                              disabled={bulkRunning}
                              className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 text-xs"
                              data-testid="button-bulk-retry-failed-users"
                            >
                              <RefreshCw className="h-3 w-3" /> Retry failed only
                            </Button>
                          )}
                          <button
                            onClick={bulk.dismiss}
                            className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                            data-testid="button-bulk-dismiss-users"
                          >
                            Dismiss
                          </button>
                        </div>
                        {bulkLastResult.failures.length > 0 && (
                          <details className="mt-1.5 basis-full">
                            <summary className="cursor-pointer select-none text-[10px] font-semibold text-red-700 dark:text-red-300">
                              View failure details ({bulkLastResult.failures.length})
                            </summary>
                            <ul
                              className="mt-1.5 max-h-40 space-y-0.5 overflow-auto"
                              data-testid="list-bulk-errors-users"
                            >
                              {bulkLastResult.failures.map((f, i) => (
                                <li
                                  key={`${f.pubkey}-${i}`}
                                  className="truncate font-mono text-[10px] text-red-900/90 dark:text-red-300/90"
                                  title={`${f.pubkey}: ${f.error}`}
                                >
                                  <span className="text-red-600 dark:text-red-400">{f.pubkey.slice(0, 12)}…</span> —{" "}
                                  {f.error}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {kpiFilter && (
                  <div
                    className="flex items-center gap-2 border-b border-brand-accent/10 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10 sm:px-5"
                    data-testid="kpi-filter-badge"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Filtered:
                    </span>
                    <Chip
                      size="sm"
                      tone={
                        kpiFilter === "scored"
                          ? "emerald"
                          : kpiFilter === "sp_adopters"
                            ? "indigo"
                            : kpiFilter === "failed"
                              ? "red"
                              : "amber"
                      }
                      className="gap-1.5 px-2.5 py-1 font-bold uppercase tracking-wider"
                    >
                      {kpiFilter === "scored" && (
                        <>
                          <UserCheck className="h-3 w-3" /> Scored Users
                        </>
                      )}
                      {kpiFilter === "sp_adopters" && (
                        <>
                          <Shield className="h-3 w-3" /> SP Adopters
                        </>
                      )}
                      {kpiFilter === "queue" && (
                        <>
                          <Clock className="h-3 w-3" /> In Queue
                        </>
                      )}
                      {kpiFilter === "failed" && (
                        <>
                          <AlertTriangle className="h-3 w-3" /> Failed
                        </>
                      )}
                    </Chip>
                    <button
                      onClick={() => setKpiFilter(null)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-200"
                      data-testid="button-clear-kpi-filter"
                    >
                      <XCircle className="h-3 w-3" />
                      Clear filter
                    </button>
                  </div>
                )}

                <div className="hidden md:block">
                  <ScrollableTable>
                    <table
                      className="w-full min-w-[900px] border-collapse border border-slate-200 text-left dark:border-slate-800"
                      data-testid="table-users"
                    >
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                          <th className="sticky left-0 z-20 w-8 border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle dark:border-slate-800 dark:bg-slate-900">
                            {(() => {
                              const visible = clientFilteredUsers
                                ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                                : filteredUsersList;
                              const visiblePks = visible.map((u) => u.pubkey);
                              const selectedCount = visiblePks.filter((pk) => selectedUserPubkeys.has(pk)).length;
                              const allSelected = visiblePks.length > 0 && selectedCount === visiblePks.length;
                              const someSelected = selectedCount > 0 && !allSelected;
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (allSelected) {
                                      setSelectedUserPubkeys((prev) => {
                                        const next = new Set(prev);
                                        for (const pk of visiblePks) next.delete(pk);
                                        return next;
                                      });
                                    } else {
                                      setSelectedUserPubkeys((prev) => {
                                        const next = new Set(prev);
                                        for (const pk of visiblePks) next.add(pk);
                                        return next;
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center justify-center"
                                  title={allSelected ? "Deselect all on page" : "Select all on page"}
                                  data-testid="checkbox-users-select-all"
                                  disabled={visiblePks.length === 0}
                                >
                                  {allSelected ? (
                                    <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                  ) : someSelected ? (
                                    <MinusSquare className="h-3.5 w-3.5 text-brand-deep" />
                                  ) : (
                                    <Square
                                      className={`h-3.5 w-3.5 ${visiblePks.length ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                                    />
                                  )}
                                </button>
                              );
                            })()}
                          </th>
                          <th className="sticky left-8 z-20 w-12 border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle dark:border-slate-800 dark:bg-slate-900"></th>
                          <th className="sticky left-20 z-20 whitespace-nowrap border-r border-slate-200 bg-slate-50 px-2 py-2.5 align-middle shadow-[8px_0_10px_-8px_rgba(15,23,42,0.15)] dark:border-slate-800 dark:bg-slate-900">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Person
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Status
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Tier
                            </span>
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <SortHeader
                              label="Runs"
                              sortKey="times_calculated"
                              currentSort={userSort}
                              onSort={handleSort}
                            />
                          </th>
                          <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2.5 align-middle dark:border-slate-800">
                            <SortHeader
                              label="Last run"
                              sortKey="last_triggered"
                              currentSort={userSort}
                              onSort={handleSort}
                            />
                          </th>
                          <th className="sticky right-0 z-20 whitespace-nowrap bg-slate-50 px-2 py-2.5 text-center align-middle shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)] dark:bg-slate-900">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Actions
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                            >
                              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                              Loading users...
                            </td>
                          </tr>
                        ) : adminUsersQuery.isError ? (
                          <tr>
                            <td colSpan={13} className="px-5 py-10 text-center text-sm text-red-400">
                              Failed to load users. Check your admin access.
                            </td>
                          </tr>
                        ) : adminUsersList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                            >
                              {userSearch ? "No users match your search" : "No user data available"}
                            </td>
                          </tr>
                        ) : filteredUsersList.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                            >
                              No users match the current filter
                            </td>
                          </tr>
                        ) : (
                          (clientFilteredUsers
                            ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                            : filteredUsersList
                          ).map((u, i) => {
                            const isExpanded = expandedRows.has(u.pubkey);
                            const prof = userProfiles.get(u.pubkey);
                            let npub: string;
                            try {
                              npub = nip19.npubEncode(u.pubkey);
                            } catch {
                              npub = u.pubkey;
                            }
                            const isTriggering = triggeringPubkeys.has(u.pubkey);
                            return (
                              <Fragment key={u.pubkey}>
                                <tr
                                  className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-900/60 ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : ""}`}
                                  onClick={() => {
                                    setExpandedRows((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(u.pubkey)) next.delete(u.pubkey);
                                      else next.add(u.pubkey);
                                      return next;
                                    });
                                  }}
                                  data-testid={`row-user-${i}`}
                                >
                                  <td
                                    className="sticky left-0 z-10 w-8 border-r border-slate-100 bg-white px-2 py-2.5 group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedUserPubkeys((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(u.pubkey)) next.delete(u.pubkey);
                                        else next.add(u.pubkey);
                                        return next;
                                      });
                                    }}
                                  >
                                    {(() => {
                                      const isSelected = selectedUserPubkeys.has(u.pubkey);
                                      const bs = bulkStatuses.get(u.pubkey);
                                      return (
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center"
                                          data-testid={`checkbox-user-${i}`}
                                          title={isSelected ? "Deselect" : "Select"}
                                        >
                                          {bs === "running" ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                                          ) : bs === "success" ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                          ) : bs === "failed" ? (
                                            <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                          ) : isSelected ? (
                                            <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                          ) : (
                                            <Square className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </td>
                                  <td className="sticky left-8 z-10 w-12 border-r border-slate-100 bg-white px-2 py-2.5 group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      {(() => {
                                        const health = getUserHealth(
                                          u.latest_status,
                                          u.latest_ta_status,
                                          u.times_calculated,
                                        );
                                        const colors = {
                                          green: "bg-emerald-400",
                                          amber: "bg-amber-400",
                                          red: "bg-red-400",
                                          gray: "bg-slate-300",
                                        };
                                        const titles = {
                                          green: "Healthy",
                                          amber: "Partial failure",
                                          red: "Failing",
                                          gray: "No calculations",
                                        };
                                        return (
                                          <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${colors[health]}`}
                                            title={titles[health]}
                                            data-testid={`health-dot-${i}`}
                                          />
                                        );
                                      })()}
                                      <ChevronDown
                                        className={`h-3 w-3 text-slate-400 transition-transform dark:text-slate-500 ${isExpanded ? "rotate-180" : ""}`}
                                      />
                                    </div>
                                  </td>
                                  <td
                                    className="sticky left-20 z-10 border-r border-slate-100 bg-white px-2 py-2.5 shadow-[8px_0_10px_-8px_rgba(15,23,42,0.15)] group-hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 dark:group-hover:bg-slate-900"
                                    data-testid={`cell-profile-${i}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Avatar className="h-6 w-6 shrink-0">
                                        {prof?.picture ? (
                                          <AvatarImage
                                            src={prof.picture}
                                            alt={prof.name || "User"}
                                            className="object-cover"
                                          />
                                        ) : null}
                                        <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                                          {prof?.name?.charAt(0)?.toUpperCase() || (
                                            <Users className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                                          )}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="min-w-0">
                                        <span className="block max-w-[140px] truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                                          {prof?.name || npub.slice(0, 12) + "…"}
                                        </span>
                                        <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                                          {npub.slice(0, 12)}…{npub.slice(-4)}
                                          <CopyButton text={npub} />
                                        </span>
                                      </span>
                                    </div>
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-status-${i}`}
                                  >
                                    {(() => {
                                      const run = u.latest_status?.toLowerCase();
                                      const pub = u.latest_ta_status?.toLowerCase();
                                      const runFailed = isFailedStatus(u.latest_status);
                                      const pubFailed = isFailedStatus(u.latest_ta_status);
                                      const chip = (tone: "emerald" | "red" | "slate", text: string) => (
                                        <span
                                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                            tone === "emerald"
                                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                              : tone === "red"
                                                ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                                : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                          }`}
                                        >
                                          {text}
                                        </span>
                                      );
                                      if (runFailed || pubFailed)
                                        return (
                                          <div className="flex items-center gap-1">
                                            {chip("red", runFailed ? "calculation failed" : "publishing failed")}
                                            <span
                                              title="Failed — click the row to see the error"
                                              data-testid={
                                                runFailed ? `icon-status-failed-${i}` : `icon-ta-status-failed-${i}`
                                              }
                                            >
                                              <AlertTriangle className="h-3 w-3 text-red-500" />
                                            </span>
                                          </div>
                                        );
                                      if (run === "success" && pub === "success")
                                        return chip("emerald", "scored · published");
                                      if (run === "success") return chip("emerald", "scored");
                                      if (!run) return chip("slate", "pending");
                                      return chip("slate", u.latest_status ?? "pending");
                                    })()}
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {schedulingPolicies.length > 0 ? (
                                      <UserTierPicker
                                        pubkey={u.pubkey}
                                        schedulingId={u.scheduling_id}
                                        schedulingName={u.scheduling_name}
                                        policies={schedulingPolicies}
                                        displayName={prof?.name}
                                        picture={prof?.picture}
                                      />
                                    ) : (
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                        {u.scheduling_name}
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-times-calc-${i}`}
                                  >
                                    <span className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                                      {u.times_calculated}
                                    </span>
                                  </td>
                                  <td
                                    className="border-r border-slate-100 px-2 py-2.5 dark:border-slate-800/60"
                                    data-testid={`cell-last-triggered-${i}`}
                                  >
                                    <div>
                                      <span className="block text-[10px] text-slate-600 dark:text-slate-300">
                                        {formatTimestamp(u.last_triggered)}
                                      </span>
                                      {timeAgo(u.last_triggered) && (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                          {timeAgo(u.last_triggered)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="sticky right-0 z-10 bg-white px-2 py-2.5 text-center shadow-[-8px_0_10px_-8px_rgba(15,23,42,0.15)] group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-900">
                                    <UserActionsMenu
                                      pubkey={u.pubkey}
                                      triggering={isTriggering}
                                      triggerDisabled={bulkRunning || bulkStatuses.get(u.pubkey) === "running"}
                                      onTrigger={() => setTriggerConfirmPubkey(u.pubkey)}
                                      onView={() => {
                                        window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                                        navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                                      }}
                                      onPublishTrustedLists={() => {
                                        setTrustedListsObserver(u.pubkey);
                                        setActiveTab("trusted-lists");
                                        window.scrollTo({ top: 0 });
                                      }}
                                      dictionary={{
                                        taPubkey: u.ta_pubkey,
                                        name: prof?.name || `${npub.slice(0, 12)}…`,
                                      }}
                                      testIdSuffix={i}
                                    />
                                  </td>
                                </tr>
                                {(isFailedStatus(u.latest_status) || isFailedStatus(u.latest_ta_status)) &&
                                  !isExpanded && (
                                    <tr
                                      className="border-b border-red-100 bg-red-50/40 dark:border-red-500/25 dark:bg-red-500/10"
                                      data-testid={`row-failure-summary-${i}`}
                                    >
                                      <td colSpan={8} className="px-3 py-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                                          <span className="text-[10px] font-medium text-red-800 dark:text-red-300">
                                            {isFailedStatus(u.latest_status) && isFailedStatus(u.latest_ta_status)
                                              ? "GrapeRank and TA Attestation both failed on the most recent run."
                                              : isFailedStatus(u.latest_status)
                                                ? "GrapeRank calculation failed on the most recent run."
                                                : "TA Attestation failed on the most recent run."}
                                          </span>
                                          <span className="text-[10px] text-red-600/80 dark:text-red-400/80">
                                            Open the error history to see the full message.
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedRows((prev) => {
                                                const next = new Set(prev);
                                                next.add(u.pubkey);
                                                return next;
                                              });
                                            }}
                                            className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/15"
                                            data-testid={`button-view-error-history-${i}`}
                                          >
                                            <Eye className="h-3 w-3" /> View error history
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                {isExpanded && (
                                  <UserHistoryRow
                                    pubkey={u.pubkey}
                                    npub={npub}
                                    taPubkey={u.ta_pubkey}
                                    schedulingName={u.scheduling_name}
                                  />
                                )}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </ScrollableTable>
                </div>

                {/* Mobile: stacked user cards (the wide table is md+ only) */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 md:hidden" data-testid="cards-users">
                  {adminUsersQuery.isLoading && adminUsersList.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
                      Loading users...
                    </div>
                  ) : adminUsersQuery.isError ? (
                    <div className="px-4 py-10 text-center text-sm text-red-400">
                      Failed to load users. Check your admin access.
                    </div>
                  ) : adminUsersList.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      {userSearch ? "No users match your search" : "No user data available"}
                    </div>
                  ) : filteredUsersList.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      No users match the current filter
                    </div>
                  ) : (
                    (activeNameSearch
                      ? filteredUsersList.slice(userPage * pageSize, (userPage + 1) * pageSize)
                      : filteredUsersList
                    ).map((u, i) => {
                      const prof = userProfiles.get(u.pubkey);
                      let npub: string;
                      try {
                        npub = nip19.npubEncode(u.pubkey);
                      } catch {
                        npub = u.pubkey;
                      }
                      const isTriggering = triggeringPubkeys.has(u.pubkey);
                      const isSelected = selectedUserPubkeys.has(u.pubkey);
                      const bs = bulkStatuses.get(u.pubkey);
                      const health = getUserHealth(u.latest_status, u.latest_ta_status, u.times_calculated);
                      const healthColors = {
                        green: "bg-emerald-400",
                        amber: "bg-amber-400",
                        red: "bg-red-400",
                        gray: "bg-slate-300",
                      } as const;
                      return (
                        <div
                          key={u.pubkey}
                          className={`p-3 ${highlightedPubkey === u.pubkey ? "animate-highlight-row" : "bg-white dark:bg-slate-900"}`}
                          data-testid={`card-user-${i}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedUserPubkeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(u.pubkey)) next.delete(u.pubkey);
                                  else next.add(u.pubkey);
                                  return next;
                                })
                              }
                              className="mt-0.5 shrink-0"
                              title={isSelected ? "Deselect" : "Select"}
                              data-testid={`card-checkbox-user-${i}`}
                            >
                              {bs === "running" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                              ) : bs === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              ) : bs === "failed" ? (
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                              ) : isSelected ? (
                                <CheckSquare className="h-4 w-4 text-brand-deep" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                              )}
                            </button>
                            <Avatar className="h-9 w-9 shrink-0">
                              {prof?.picture ? (
                                <AvatarImage src={prof.picture} alt={prof.name || "User"} className="object-cover" />
                              ) : null}
                              <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                                {prof?.name?.charAt(0)?.toUpperCase() || (
                                  <Users className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${healthColors[health]}`} />
                                <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                  {prof?.name || npub.slice(0, 12) + "..."}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1">
                                <span className="truncate font-mono text-[10px] text-brand-primary/80">
                                  {npub.slice(0, 16)}...{npub.slice(-4)}
                                </span>
                                <CopyButton text={npub} />
                              </div>
                            </div>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              {schedulingPolicies.length > 0 ? (
                                <UserTierPicker
                                  pubkey={u.pubkey}
                                  schedulingId={u.scheduling_id}
                                  schedulingName={u.scheduling_name}
                                  policies={schedulingPolicies}
                                  displayName={prof?.name}
                                  picture={prof?.picture}
                                />
                              ) : (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {u.scheduling_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {u.latest_status && (
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${u.latest_status.toLowerCase() === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300" : isFailedStatus(u.latest_status) ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}
                              >
                                {u.latest_status}
                              </span>
                            )}
                            {u.latest_ta_status && (
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${u.latest_ta_status.toLowerCase() === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300" : isFailedStatus(u.latest_ta_status) ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300" : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}
                              >
                                TA {u.latest_ta_status}
                              </span>
                            )}
                            <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                              {u.times_calculated} calcs
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              · Updated {timeAgo(u.last_updated) || formatTimestamp(u.last_updated)}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center justify-end">
                            <UserActionsMenu
                              pubkey={u.pubkey}
                              triggering={isTriggering}
                              triggerDisabled={bulkRunning || bulkStatuses.get(u.pubkey) === "running"}
                              onTrigger={() => setTriggerConfirmPubkey(u.pubkey)}
                              onView={() => {
                                window.history.replaceState({}, "", `/admin?tab=users&highlight=${u.pubkey}`);
                                navigate(`/profile/${npub}?from=admin&pubkey=${u.pubkey}`);
                              }}
                              onPublishTrustedLists={() => {
                                setTrustedListsObserver(u.pubkey);
                                setActiveTab("trusted-lists");
                                window.scrollTo({ top: 0 });
                              }}
                              dictionary={{
                                taPubkey: u.ta_pubkey,
                                name: prof?.name || `${npub.slice(0, 12)}…`,
                              }}
                              testIdSuffix={`card-${i}`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/60 sm:gap-3 sm:px-5">
                  {adminUsersQuery.isFetching && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400 dark:text-slate-500" />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Refreshing...</span>
                    </div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/60 sm:px-5"
                    data-testid="pagination-users"
                  >
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Page {userPage + 1} of {totalPages} (
                      {(activeNameSearch ? filteredUsersList.length : adminUsersTotal).toLocaleString()} total)
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={userPage === 0}
                        onClick={() => setUserPage((p) => p - 1)}
                        className="no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={userPage >= totalPages - 1}
                        onClick={() => setUserPage((p) => p + 1)}
                        className="no-default-hover-elevate no-default-active-elevate"
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Dialog
                open={triggerConfirmPubkey !== null}
                onOpenChange={(open) => {
                  if (!open) setTriggerConfirmPubkey(null);
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Play className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      Confirm GrapeRank Trigger
                    </DialogTitle>
                    <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
                      You are about to manually trigger a GrapeRank calculation. Please review the details below before
                      confirming.
                    </DialogDescription>
                  </DialogHeader>
                  {triggerConfirmPubkey && (
                    <div className="space-y-4 pt-2">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          What happens when you confirm
                        </p>
                        <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                          <li>
                            A GrapeRank calculation request is sent to the Brainstorm server for this user's pubkey
                          </li>
                          <li>
                            The server crawls the user's Nostr social graph — follows, mutes, and interactions — to
                            compute personalized scores
                          </li>
                          <li>
                            This is <span className="font-semibold">resource-intensive</span> and may take several
                            minutes depending on graph size
                          </li>
                          <li>
                            Progress and results will appear in the <span className="font-semibold">Activity tab</span>{" "}
                            once processing begins
                          </li>
                          <li>If a calculation is already running for this user, a duplicate request may be queued</li>
                        </ul>
                      </div>
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-500/25 dark:bg-blue-500/10">
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                          Good to know
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          GrapeRank scores are calculated relative to the user's own social graph. Each user's network
                          is unique. Triggering this does not affect other users' scores.
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Target Pubkey
                        </p>
                        <p
                          className="break-all font-mono text-xs text-slate-800 dark:text-slate-200"
                          data-testid="text-trigger-confirm-pubkey"
                        >
                          {triggerConfirmPubkey}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTriggerConfirmPubkey(null)}
                          className="no-default-hover-elevate no-default-active-elevate text-xs"
                          data-testid="button-cancel-trigger"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const pk = triggerConfirmPubkey;
                            setTriggerConfirmPubkey(null);
                            handleTriggerGraperank(pk);
                          }}
                          className="no-default-hover-elevate no-default-active-elevate gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                          data-testid="button-confirm-trigger"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Confirm Trigger
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}

          {activeTab === "support" && <SupportTab />}

          {activeTab === "scheduling" && <SchedulingTab />}

          {activeTab === "billing" && <BillingTab />}

          {activeTab === "trusted-lists" && <TrustedListsTab observer={trustedListsObserver} />}

          {activeTab === "compromised" && <CompromisedTab />}

          {activeTab === "growth" && (
            <GrowthTab
              isAdmin={!!user.isAdmin}
              range={range}
              allUsers={allUsers}
              profiles={userProfiles}
              onOpenPerson={openInUsers}
            />
          )}

          {activeTab === "health" && (
            <HealthTab
              endpoints={{ grapeRank: grapeRankQuery, users: adminUsersQuery, activity: adminActivityQuery }}
              relays={relays}
            />
          )}

          {activeTab === "activity" && (
            <div className="space-y-6" data-testid="panel-activity">
              <FailureBreakdownCard
                items={overviewAllActivity}
                isLoading={overviewLoading}
                isError={overviewActivityQuery.isError}
                errorMessage={
                  overviewActivityQuery.error instanceof Error ? overviewActivityQuery.error.message : undefined
                }
                onViewUser={(pk) => {
                  openInUsers(pk);
                }}
              />

              <div
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                data-testid="card-platform-activity"
              >
                <div className="border-b border-brand-accent/10 px-4 py-4 sm:px-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h3
                        className="text-sm font-bold text-slate-900 dark:text-slate-100"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        Platform Activity
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Every GrapeRank calculation record,{" "}
                        {rangeDays === 1
                          ? "last 24 hours"
                          : rangeDays === BACKEND_MAX_DAYS
                            ? "all time"
                            : `last ${rangeDays} days`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {activityTotal.toLocaleString()} total
                      </span>
                      <LiveBadge
                        updatedAt={adminActivityQuery.dataUpdatedAt}
                        boosting={isBoostActive}
                        isFetching={adminActivityQuery.isFetching}
                      />
                      <StatusBadge
                        status={
                          adminActivityQuery.isSuccess
                            ? "connected"
                            : adminActivityQuery.isError
                              ? "disconnected"
                              : adminActivityQuery.fetchStatus === "idle" && !adminActivityQuery.isError
                                ? "connected"
                                : "degraded"
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="p-3 sm:p-5">
                  {adminActivityQuery.isLoading && !activityItems.length ? (
                    <div className="animate-pulse space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800" />
                      ))}
                    </div>
                  ) : adminActivityQuery.isError ? (
                    <div className="py-8 text-center">
                      <XCircle className="mx-auto mb-2 h-8 w-8 text-red-300" />
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Failed to load activity
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        {adminActivityQuery.error instanceof Error ? adminActivityQuery.error.message : "Unknown error"}
                      </p>
                    </div>
                  ) : activityItems.length === 0 ? (
                    <div className="py-8 text-center">
                      <Activity className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">No activity records</p>
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        No GrapeRank calculations have been recorded yet.
                      </p>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const selectedCount = selectedActivityRows.size;
                        const dedupePubkeys = Array.from(
                          new Set(Array.from(selectedActivityRows.values()).filter((p): p is string => !!p)),
                        );
                        if (selectedCount === 0) return null;
                        const liveCount = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "success" || s === "failed").length
                          : 0;
                        const liveTotal = bulkRunning ? bulkStatuses.size : 0;
                        const liveFailed = bulkRunning
                          ? Array.from(bulkStatuses.values()).filter((s) => s === "failed").length
                          : 0;
                        return (
                          <div
                            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-primary/10 px-3 py-2 dark:bg-brand-primary/10"
                            data-testid="bulk-toolbar-activity"
                          >
                            <CheckSquare className="h-4 w-4 text-brand-deep" />
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {selectedCount} selected
                              {dedupePubkeys.length !== selectedCount && (
                                <span className="font-normal text-slate-500 dark:text-slate-400">
                                  {" "}
                                  ({dedupePubkeys.length} unique)
                                </span>
                              )}
                            </span>
                            {bulkRunning && (
                              <span
                                className="text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                data-testid="bulk-progress-activity"
                              >
                                {liveCount} of {liveTotal} triggered… {liveFailed > 0 ? `${liveFailed} failed` : ""}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => bulk.ask({ pubkeys: dedupePubkeys, source: "activity" })}
                                disabled={bulkRunning || dedupePubkeys.length === 0}
                                className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                                data-testid="button-bulk-retrigger-activity"
                              >
                                {bulkRunning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Re-trigger {dedupePubkeys.length} user{dedupePubkeys.length !== 1 ? "s" : ""}
                              </Button>
                              <button
                                onClick={() => setSelectedActivityRows(new Map())}
                                disabled={bulkRunning}
                                className="text-[10px] text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                                data-testid="button-bulk-clear-activity"
                              >
                                Clear selection
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      {bulkLastResult && bulkLastResult.source === "activity" && (
                        <div
                          className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${bulkLastResult.failures.length === 0 ? "border-emerald-300/50 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-300/50 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"}`}
                          data-testid="bulk-result-activity"
                        >
                          {bulkLastResult.failures.length === 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {bulkLastResult.successes.length} succeeded · {bulkLastResult.failures.length} failed
                          </span>
                          <div className="ml-auto flex items-center gap-2">
                            {bulkLastResult.failures.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  bulk.ask({
                                    pubkeys: bulkLastResult.failures.map((f) => f.pubkey),
                                    source: "retry",
                                  })
                                }
                                disabled={bulkRunning}
                                className="no-default-hover-elevate no-default-active-elevate h-7 gap-1.5 text-xs"
                                data-testid="button-bulk-retry-failed-activity"
                              >
                                <RefreshCw className="h-3 w-3" /> Retry failed only
                              </Button>
                            )}
                            <button
                              onClick={bulk.dismiss}
                              className="text-[10px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                              data-testid="button-bulk-dismiss-activity"
                            >
                              Dismiss
                            </button>
                          </div>
                          {bulkLastResult.failures.length > 0 && (
                            <details className="mt-1.5 basis-full">
                              <summary className="cursor-pointer select-none text-[10px] font-semibold text-red-700 dark:text-red-300">
                                View failure details ({bulkLastResult.failures.length})
                              </summary>
                              <ul
                                className="mt-1.5 max-h-40 space-y-0.5 overflow-auto"
                                data-testid="list-bulk-errors-activity"
                              >
                                {bulkLastResult.failures.map((f, i) => (
                                  <li
                                    key={`${f.pubkey}-${i}`}
                                    className="truncate font-mono text-[10px] text-red-900/90 dark:text-red-300/90"
                                    title={`${f.pubkey}: ${f.error}`}
                                  >
                                    <span className="text-red-600 dark:text-red-400">{f.pubkey.slice(0, 12)}…</span> —{" "}
                                    {f.error}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-left" data-testid="table-platform-activity">
                          <thead>
                            <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                              <th className="w-8 px-2 py-2">
                                {(() => {
                                  const eligible = activityItems.filter(
                                    (a) => !!a.pubkey && a.private_id !== undefined && a.private_id !== null,
                                  );
                                  const selectedOnPage = eligible.filter((a) =>
                                    selectedActivityRows.has(a.private_id as number),
                                  ).length;
                                  const allSelected = eligible.length > 0 && selectedOnPage === eligible.length;
                                  const someSelected = selectedOnPage > 0 && !allSelected;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (allSelected) {
                                          setSelectedActivityRows((prev) => {
                                            const next = new Map(prev);
                                            for (const a of eligible) next.delete(a.private_id as number);
                                            return next;
                                          });
                                        } else {
                                          setSelectedActivityRows((prev) => {
                                            const next = new Map(prev);
                                            for (const a of eligible)
                                              next.set(a.private_id as number, a.pubkey as string);
                                            return next;
                                          });
                                        }
                                      }}
                                      className="inline-flex items-center justify-center"
                                      title={allSelected ? "Deselect all on page" : "Select all on page"}
                                      data-testid="checkbox-activity-select-all"
                                      disabled={eligible.length === 0}
                                    >
                                      {allSelected ? (
                                        <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
                                      ) : someSelected ? (
                                        <MinusSquare className="h-3.5 w-3.5 text-brand-deep" />
                                      ) : (
                                        <Square
                                          className={`h-3.5 w-3.5 ${eligible.length ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                                        />
                                      )}
                                    </button>
                                  );
                                })()}
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Created
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Updated
                              </th>
                              <th
                                className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                                title="Time from created to updated"
                              >
                                Duration
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                User
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Source
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Status
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                TA Status
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Pub Status
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Algorithm
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Queue
                              </th>
                              <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Req #
                              </th>
                              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {activityItems.map((item, idx) => {
                              const pid = item.private_id as number | null;
                              const isSelected = pid !== null && pid !== undefined && selectedActivityRows.has(pid);
                              const bs = item.pubkey ? bulkStatuses.get(item.pubkey) : undefined;
                              return (
                                <ActivityRow
                                  key={item.private_id ?? idx}
                                  item={item}
                                  idx={idx}
                                  profile={item.pubkey ? userProfiles.get(item.pubkey) : undefined}
                                  schedulingName={item.pubkey ? schedulingTierByPubkey.get(item.pubkey) : undefined}
                                  onViewDetail={handleViewRequestDetail}
                                  selected={isSelected}
                                  bulkStatus={bs}
                                  triggering={!!item.pubkey && triggeringPubkeys.has(item.pubkey)}
                                  queuePosition={
                                    typeof item.private_id === "number"
                                      ? queuePositionByPrivateId.get(item.private_id)
                                      : undefined
                                  }
                                  onToggleSelect={() => {
                                    if (!item.pubkey || pid === null || pid === undefined) return;
                                    setSelectedActivityRows((prev) => {
                                      const next = new Map(prev);
                                      if (next.has(pid)) next.delete(pid);
                                      else next.set(pid, item.pubkey as string);
                                      return next;
                                    });
                                  }}
                                  onNavigateToUser={(pubkey) => {
                                    openInUsers(pubkey);
                                  }}
                                  onRetrigger={async (pubkey) => {
                                    try {
                                      await retriggerOne(pubkey);
                                      toast({
                                        title: "Request Queued",
                                        description: `Re-triggered GrapeRank for ${pubkey.slice(0, 12)}...`,
                                      });
                                      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
                                      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                      triggerRefreshBoost();
                                    } catch (err: unknown) {
                                      const msg =
                                        err instanceof Error
                                          ? err.message
                                          : typeof err === "object" && err !== null
                                            ? JSON.stringify(err)
                                            : "Unknown error";
                                      toast({ title: "Re-trigger Failed", description: msg, variant: "destructive" });
                                      throw err;
                                    }
                                  }}
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/60 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">Rows per page:</span>
                          <select
                            className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            value={activityPageSize}
                            onChange={(e) => {
                              setActivityPageSize(Number(e.target.value) as PageSizeOption);
                              setActivityPage(0);
                            }}
                            data-testid="select-activity-page-size"
                          >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Page {activityPage + 1} of {activityTotalPages}
                          </span>
                          <div className="flex gap-1">
                            <button
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900"
                              disabled={activityPage === 0}
                              onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                              data-testid="button-activity-prev"
                            >
                              Prev
                            </button>
                            <button
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900"
                              disabled={activityPage + 1 >= activityTotalPages}
                              onClick={() => setActivityPage((p) => p + 1)}
                              data-testid="button-activity-next"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                        Click any row to expand details. Use the re-trigger button to re-run GrapeRank for that user.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <Dialog
                open={detailOpen}
                onOpenChange={(open) => {
                  setDetailOpen(open);
                  if (!open) {
                    setDetailData(null);
                    setDetailError(null);
                  }
                }}
              >
                <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-brand-deep" />
                      Brainstorm Request #{detailRequestId}
                    </DialogTitle>
                    <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
                      Full request details for request #{detailRequestId}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="pt-2">
                    {detailLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-brand-deep" />
                        <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                          Loading request detail...
                        </span>
                      </div>
                    )}
                    {detailError && (
                      <div
                        className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10"
                        data-testid="detail-error"
                      >
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <p className="text-xs text-red-700 dark:text-red-300">{detailError}</p>
                      </div>
                    )}
                    {detailData && (
                      <div className="space-y-2" data-testid="detail-fields">
                        {Object.entries(detailData)
                          .filter(([, value]) => value !== null && value !== undefined && value !== "")
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="flex items-start justify-between rounded-lg border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60"
                            >
                              <span className="mr-4 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {key}
                              </span>
                              <span className="max-w-[60%] break-all text-right font-mono text-[10px] text-slate-800 dark:text-slate-200 sm:max-w-[350px]">
                                {typeof value === "object" ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {activeTab === "assistants" && FEATURES.assistantsAdmin && (
            <div className="space-y-6" data-testid="panel-assistants">
              {(() => {
                const stats = assistantStatsQuery.data;
                const statsLoading = assistantStatsQuery.isLoading;
                const statsUnavailable = !statsLoading && stats === null;
                return (
                  <div
                    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                    data-testid="card-assistant-stats"
                  >
                    <div className="flex flex-col justify-between gap-2 border-b border-brand-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3
                          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          <Sparkles className="h-4 w-4 text-brand-accent" />
                          Brainstorm Assistants
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Tracks each successful kind 0 publish from the assistant publish endpoint.
                        </p>
                      </div>
                      <StatusBadge
                        status={
                          statsUnavailable ? "disconnected" : assistantStatsQuery.isError ? "disconnected" : "connected"
                        }
                      />
                    </div>
                    <div className="p-4 sm:p-5">
                      {statsLoading ? (
                        <div className="grid animate-pulse grid-cols-2 gap-3 md:grid-cols-5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
                          ))}
                        </div>
                      ) : statsUnavailable ? (
                        <div className="py-6 text-center" data-testid="assistant-stats-unavailable">
                          <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Not Connected</p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            The backend has not yet exposed <code>/admin/assistants/stats</code>.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-total"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Total Assistants
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.totalAssistants ?? 0).toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                              Distinct owner pubkeys
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-publishes"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Total Publishes
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.totalPublishes ?? 0).toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                              Successful kind 0 events
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-24h"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Last 24h
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.publishes24h ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-7d"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Last 7 days
                            </p>
                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                              {(stats?.publishes7d ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div
                            className="rounded-xl border border-slate-100 bg-white/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/60"
                            data-testid="kpi-assistants-last"
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Last Publish
                            </p>
                            <p className="mt-2 text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                              {stats?.lastPublishAt ? formatTimestamp(stats.lastPublishAt) : "—"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const data = assistantsListQuery.data;
                const isUnavailable = !assistantsListQuery.isLoading && data === null;
                const items = data?.items ?? [];
                const total = data?.total ?? 0;
                const totalPages = data?.pages ?? 1;
                return (
                  <div
                    className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
                    data-testid="card-assistant-list"
                  >
                    <div className="flex flex-col justify-between gap-3 border-b border-brand-accent/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                      <div>
                        <h3
                          className="text-sm font-bold text-slate-900 dark:text-slate-100"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          Per-User Publish History
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {total.toLocaleString()} owner{total === 1 ? "" : "s"} have published an assistant.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                          <input
                            type="text"
                            value={assistantSearch}
                            onChange={(e) => setAssistantSearch(e.target.value)}
                            placeholder="Search npub or hex…"
                            className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs focus:border-brand-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 sm:w-56"
                            data-testid="input-assistant-search"
                          />
                        </div>
                        <StatusBadge
                          status={
                            isUnavailable ? "disconnected" : assistantsListQuery.isError ? "disconnected" : "connected"
                          }
                        />
                      </div>
                    </div>
                    <div className="p-3 sm:p-5">
                      {assistantsListQuery.isLoading && items.length === 0 ? (
                        <div className="animate-pulse space-y-2">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
                          ))}
                        </div>
                      ) : isUnavailable ? (
                        <div className="py-8 text-center" data-testid="assistants-list-unavailable">
                          <WifiOff className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Not Connected</p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            The backend has not yet exposed <code>/admin/assistants</code>.
                          </p>
                        </div>
                      ) : items.length === 0 ? (
                        <div className="py-8 text-center">
                          <Sparkles className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                            No assistants published yet
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Once a user publishes their assistant, they'll appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-left" data-testid="table-assistants">
                            <thead>
                              <tr className="border-b border-slate-200/60 dark:border-slate-800/60">
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Owner
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  # Publishes
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  First
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Last
                                </th>
                                <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Latest Event
                                </th>
                                <th className="w-8 px-2 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it) => {
                                let npub = it.owner_pubkey;
                                try {
                                  npub = nip19.npubEncode(it.owner_pubkey);
                                } catch {}
                                const isExpanded = expandedAssistant === it.owner_pubkey;
                                return (
                                  <Fragment key={it.owner_pubkey}>
                                    <tr
                                      className="cursor-pointer border-b border-slate-100 hover:bg-brand-primary/10 dark:border-slate-800/60 dark:hover:bg-brand-primary/10"
                                      onClick={() => setExpandedAssistant(isExpanded ? null : it.owner_pubkey)}
                                      data-testid={`row-assistant-${it.owner_pubkey}`}
                                    >
                                      <td className="px-2 py-2">
                                        <div className="flex flex-col">
                                          <span
                                            className="max-w-[220px] truncate font-mono text-[11px] text-slate-800 dark:text-slate-200"
                                            title={npub}
                                          >
                                            {npub.slice(0, 18)}…{npub.slice(-6)}
                                          </span>
                                          <span
                                            className="max-w-[220px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500"
                                            title={it.owner_pubkey}
                                          >
                                            {it.owner_pubkey.slice(0, 12)}…
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-[11px] font-bold text-slate-900 dark:text-slate-100">
                                        {it.publish_count.toLocaleString()}
                                      </td>
                                      <td className="px-2 py-2 text-[10px] text-slate-600 dark:text-slate-300">
                                        {it.first_published_at ? formatTimestamp(it.first_published_at) : "—"}
                                      </td>
                                      <td className="px-2 py-2 text-[10px] text-slate-600 dark:text-slate-300">
                                        {it.last_published_at ? formatTimestamp(it.last_published_at) : "—"}
                                      </td>
                                      <td
                                        className="max-w-[180px] truncate px-2 py-2 font-mono text-[10px] text-slate-500 dark:text-slate-400"
                                        title={it.event_id || ""}
                                      >
                                        {it.event_id ? `${it.event_id.slice(0, 14)}…` : "—"}
                                      </td>
                                      <td className="px-2 py-2 text-slate-400 dark:text-slate-500">
                                        {isExpanded ? (
                                          <ChevronUp className="h-3.5 w-3.5" />
                                        ) : (
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        )}
                                      </td>
                                    </tr>
                                    {isExpanded && (
                                      <tr data-testid={`row-assistant-history-${it.owner_pubkey}`}>
                                        <td colSpan={6} className="bg-slate-50/60 px-3 py-3 dark:bg-slate-900/60">
                                          {assistantHistoryQuery.isLoading ? (
                                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                              <Loader2 className="h-3 w-3 animate-spin" /> Loading history…
                                            </div>
                                          ) : assistantHistoryQuery.data === null ? (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                              Per-user history endpoint not available.
                                            </div>
                                          ) : (assistantHistoryQuery.data?.items?.length ?? 0) === 0 ? (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                              No detailed publish events recorded.
                                            </div>
                                          ) : (
                                            <div className="space-y-1">
                                              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                Recent publishes
                                              </p>
                                              <ul className="max-h-60 space-y-1 overflow-auto">
                                                {assistantHistoryQuery.data!.items.map((h, i) => (
                                                  <li
                                                    key={`${h.event_id}-${i}`}
                                                    className="flex items-center gap-2 rounded border border-slate-100 bg-white px-2 py-1 text-[11px] dark:border-slate-800/60 dark:bg-slate-900"
                                                  >
                                                    <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                                    <span className="text-slate-700 dark:text-slate-200">
                                                      {formatTimestamp(h.published_at)}
                                                    </span>
                                                    <span
                                                      className="flex-1 truncate font-mono text-slate-500 dark:text-slate-400"
                                                      title={h.event_id}
                                                    >
                                                      {h.event_id.slice(0, 24)}…
                                                    </span>
                                                    {h.status && (
                                                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                        {h.status}
                                                      </span>
                                                    )}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              Page {assistantPage + 1} of {totalPages} · {total.toLocaleString()} total
                            </div>
                            <div className="flex items-center gap-2">
                              <Select
                                value={String(assistantPageSize)}
                                onValueChange={(v) => setAssistantPageSize(Number(v) as PageSizeOption)}
                              >
                                <SelectTrigger
                                  className="h-7 w-[88px] text-[11px]"
                                  data-testid="select-assistant-page-size"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="25">25 / page</SelectItem>
                                  <SelectItem value="50">50 / page</SelectItem>
                                  <SelectItem value="100">100 / page</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={assistantPage === 0}
                                onClick={() => setAssistantPage((p) => Math.max(0, p - 1))}
                                data-testid="button-assistant-prev"
                              >
                                <ChevronLeft className="h-3 w-3" /> Prev
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={assistantPage + 1 >= totalPages}
                                onClick={() => setAssistantPage((p) => p + 1)}
                                data-testid="button-assistant-next"
                              >
                                Next <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>

      <Footer />

      <BulkConfirmDialog bulk={bulk} triggering={triggeringPubkeys} />
    </div>
  );
}
