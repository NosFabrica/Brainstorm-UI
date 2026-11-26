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
import { parseAdminTab, type AdminTab } from "./adminTabs";
import { parseAdminRange, rangeQuery, type AdminRange } from "./adminRange";
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
import { type KpiFilter } from "./admin/types";
import { OverviewTab } from "./admin/overview/OverviewTab";
import { adminTabList, AdminTabBar } from "./admin/AdminTabBar";
import { RangeSelector } from "./admin/RangeSelector";
import { useConsoleFigures } from "./admin/useConsoleFigures";

export default function AdminPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();

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

  const {
    overviewAllUsers,
    overviewAllActivity,
    activityCoverage,
    overviewLoading,
    allUsers,
    nowMetrics,
    computedQueueDepth,
    trends,
    headerFigures,
  } = useConsoleFigures({ range, overviewUsersQuery, overviewActivityQuery, allUsersQuery, adminStats });

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

  // A tab of the bar: the Users tab opens on its first page, unfiltered.
  const selectTab = (key: AdminTab) => {
    setActiveTab(key);
    setUserPage(0);
    if (key === "users") setKpiFilter(null);
  };

  // A header card: the Users tab, filtered to the users it counts.
  const showKpi = (filter: KpiFilter) => {
    setKpiFilter(filter);
    setActiveTab("users");
    setUserPage(0);
  };

  if (!user || isAuthRedirecting()) return null;

  const tabs = adminTabList();

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
            <RangeSelector range={range} setRange={setRange} visible={rangeDriven} />
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

          <AdminTabBar tabs={tabs} activeTab={activeTab} onSelect={selectTab} supportUnread={supportUnread} />

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
