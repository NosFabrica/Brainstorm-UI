import { useState, useEffect, useMemo, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { ADMIN_SUPPORT_QUERY_KEY, adminListTickets } from "@/services/support";
import { unreadCount } from "@/lib/supportSeen";
import type { SchedulingItem } from "@/services/api";
import { Chip } from "@/components/ui/chip";
import {
  Users,
  Activity,
  Server,
  BarChart3,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
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
import { readEveryPage, useAdminHeaderMetrics } from "@/components/admin/useAdminHeaderMetrics";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis } from "recharts";
import { FEATURES } from "@/config/featureFlags";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
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
  type GrapeRankData,
  type GrapeRankApiResponse,
  type AdminUsersPage,
  type BrainstormRequestInstance,
  type AdminUserHistoryPage,
} from "./admin/types";
import { POLL_OVERVIEW_MS, POLL_STATS_MS, BOOST_INTERVAL_MS, NONE } from "./admin/constants";
import { formatTimestamp, timeAgo, truncateError } from "./admin/format";
import { computePipelineMetrics, computeTrends, countQueued, getWindowConfig, parseActivityTs } from "./admin/metrics";
import {
  isFailedActivity,
  isItemFailed,
  getFailureStage,
  extractErrorMessage,
  normalizeErrorKey,
} from "./admin/failures";
import { ConfirmRetriggerButton } from "./admin/ConfirmRetriggerButton";
import { DeltaIndicator } from "./admin/DeltaIndicator";
import { StatusBadge } from "./admin/StatusBadge";
import { grapeRankResultOptions } from "@/services/queries/graperank";
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
import { AssistantsTab } from "./admin/assistants/AssistantsTab";
import { ActivityTab } from "./admin/activity/ActivityTab";
import { useActivityLog } from "./admin/activity/useActivityLog";
import { useUsersDirectory } from "./admin/users/useUsersDirectory";
import { useTriggers } from "./admin/useTriggers";
import { UsersTab } from "./admin/users/UsersTab";
import { KpiStrip, KpiCompact } from "./admin/HeaderKpis";
import { computeHeaderFigures } from "./admin/metrics";
import { type KpiFilter } from "./admin/types";

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
  const { inFlight: triggeringPubkeys, claim: claimTriggers, release: releaseTrigger } = useInFlightTriggers();
  const { isBoostActive, triggerRefreshBoost } = useRefreshBoost();
  const directory = useUsersDirectory({
    isAdmin: !!user?.isAdmin,
    onUsersTab: activeTab === "users",
    isBoostActive,
  });
  const {
    userSearch,
    setUserSearch,
    setUserPage,
    kpiFilter,
    setKpiFilter,
    setExpandedRows,
    setHighlightedPubkey,
    setSelectedUserPubkeys,
    lookupOpen,
    debouncedSearch,
    activeNameSearch,
    adminUsersQuery,
    adminUsersList,
  } = directory;
  const queryClient = useQueryClient();

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
  }, [setHighlightedPubkey]);

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

  const activity = useActivityLog({
    isAdmin: !!user?.isAdmin,
    onActivityTab: activeTab === "activity",
    rangeDays,
    isBoostActive,
  });
  const { adminActivityQuery, activityItems, setSelectedActivityRows } = activity;

  const { retriggerOne, triggerGraperank: handleTriggerGraperank } = useTriggers({
    claim: claimTriggers,
    release: releaseTrigger,
    onTriggered: triggerRefreshBoost,
  });

  const clearSelection = useCallback(
    (source: BulkSource) => {
      if (source === "users") setSelectedUserPubkeys(new Set());
      else setSelectedActivityRows(new Map());
    },
    [setSelectedUserPubkeys, setSelectedActivityRows],
  );
  const bulk = useBulkRetrigger({
    claim: claimTriggers,
    release: releaseTrigger,
    onFirstSuccess: triggerRefreshBoost,
    onSettled: clearSelection,
  });
  const { dismissFrom: dismissBulkFrom } = bulk;

  useEffect(() => {
    setSelectedUserPubkeys(new Set());
    dismissBulkFrom("users");
  }, [userSearch, debouncedSearch, kpiFilter, dismissBulkFrom, setSelectedUserPubkeys]);

  useEffect(() => {
    setSelectedActivityRows(new Map());
    dismissBulkFrom("activity");
  }, [range, dismissBulkFrom, setSelectedActivityRows]);

  const relays = useRelayLatency(!!user && activeTab === "health");

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const grapeRank: GrapeRankData | null = grapeRankQuery.data?.data ?? null;
  const queuePosition =
    typeof grapeRank?.how_many_others_with_priority === "number" ? grapeRank.how_many_others_with_priority : null;

  const overviewAllUsers = overviewUsersQuery.data?.items ?? NONE;
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

  // Everyone, now: the header cards.
  const nowMetrics = useMemo(
    () => computePipelineMetrics(allUsers, overviewLoadedActivity, allUsersTotal),
    [allUsers, overviewLoadedActivity, allUsersTotal],
  );

  const computedQueueDepth = useMemo(() => countQueued(allUsers), [allUsers]);

  const trends = useMemo(
    () => computeTrends(overviewLoadedActivity, overviewAllActivity, range, Date.now()),
    [overviewAllActivity, overviewLoadedActivity, range],
  );

  // The header's six figures — the system now — drawn once for the cards and
  // for the one-line strip the other tabs show.
  const headerFigures = computeHeaderFigures({
    nowMetrics,
    adminStats,
    computedQueueDepth,
    trends,
    hasActivity: !!overviewActivityQuery.data,
  });

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

  // A header card: the Users tab, filtered to the users it counts.
  const showKpi = (filter: KpiFilter) => {
    setKpiFilter(filter);
    setActiveTab("users");
    setUserPage(0);
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
            <KpiStrip
              figures={headerFigures}
              nowMetrics={nowMetrics}
              trends={trends}
              computedQueueDepth={computedQueueDepth}
              hasSystemData={hasSystemData}
              queuePosition={queuePosition}
              onKpi={showKpi}
            />
          )}
          {activeTab !== "overview" && <KpiCompact figures={headerFigures} />}

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
            <UsersTab
              directory={directory}
              bulk={bulk}
              triggering={triggeringPubkeys}
              allUsers={allUsers}
              allUsersComplete={allUsersQuery.isSuccess}
              userProfiles={userProfiles}
              schedulingPolicies={schedulingPolicies}
              triggerGraperank={handleTriggerGraperank}
              onPublishTrustedLists={(pubkey) => {
                setTrustedListsObserver(pubkey);
                setActiveTab("trusted-lists");
                window.scrollTo({ top: 0 });
              }}
            />
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
            <ActivityTab
              activity={activity}
              bulk={bulk}
              triggering={triggeringPubkeys}
              rangeDays={rangeDays}
              isBoostActive={isBoostActive}
              overviewAllActivity={overviewAllActivity}
              overviewAllUsers={overviewAllUsers}
              overviewLoading={overviewLoading}
              overviewActivityQuery={overviewActivityQuery}
              userProfiles={userProfiles}
              retriggerOne={retriggerOne}
              onTriggered={triggerRefreshBoost}
              onOpenUser={openInUsers}
            />
          )}

          {activeTab === "assistants" && FEATURES.assistantsAdmin && (
            <AssistantsTab isAdmin={!!user.isAdmin} isBoostActive={isBoostActive} />
          )}
        </div>
      </main>

      <Footer />

      <BulkConfirmDialog bulk={bulk} triggering={triggeringPubkeys} />
    </div>
  );
}
