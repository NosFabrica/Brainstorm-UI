import { useState, useEffect, useMemo, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  CheckCircle2,
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
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import {
  type GrapeRankData,
  type GrapeRankApiResponse,
  type AdminUsersPage,
  type AdminUserHistoryPage,
} from "./admin/types";
import { POLL_OVERVIEW_MS, POLL_STATS_MS, BOOST_INTERVAL_MS, NONE } from "./admin/constants";
import { computePipelineMetrics, computeTrends, countQueued, getWindowConfig, parseActivityTs } from "./admin/metrics";
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
import { OverviewTab } from "./admin/overview/OverviewTab";

export default function AdminPage() {
  const [, navigate] = useLocation();
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
            <OverviewTab
              trends={trends}
              activityCoverage={activityCoverage}
              overviewAllActivity={overviewAllActivity}
              overviewAllUsers={overviewAllUsers}
              overviewLoading={overviewLoading}
              overviewActivityQuery={overviewActivityQuery}
              overviewUsersQuery={overviewUsersQuery}
              retriggerOne={retriggerOne}
              onTriggered={triggerRefreshBoost}
              onOpenUser={openInUsers}
            />
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
