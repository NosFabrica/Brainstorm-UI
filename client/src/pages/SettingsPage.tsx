import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { GlossBackground } from "@/components/GlossBackground";
import { PageHeader } from "@/components/PageHeader";
import { Redirect, useLocation, useSearch } from "wouter";
import { ProfileEditForm } from "@/components/ProfileEditForm";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, User, ShieldCheck, BookOpen, MessageCircle, Bot } from "lucide-react";
import { logout } from "@/accounts/login-flow";
import { isNip85Activated } from "@/lib/nip85Activation";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory } from "@/hooks/useSelf";
import { grapeRankResultOptions } from "@/services/queries/graperank";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { BillingCard } from "@/components/billing/BillingCard";
import { BrainstormAssistantCard } from "@/components/BrainstormAssistantCard";
import { MessagesSettingsCard } from "@/components/settings/MessagesSettingsCard";
import {
  assistantViewsFor,
  settingsTabsFor,
  settingsTargetFor,
  type AssistantView,
  type SettingsTabKey,
} from "@/lib/settingsTab";
import { DictionaryTab } from "@/components/settings/DictionaryTab";
import { AssistantsTab } from "@/components/settings/AssistantsTab";
import { TreasureMapTab } from "@/components/settings/TreasureMapTab";
import { YourAssistants } from "@/components/settings/YourAssistants";
import { markOwnScores } from "@/lib/ownScores";
import { InternalChip } from "@/components/InternalChip";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import { useTrustAnchorActions } from "./settings/useTrustAnchorActions";
import { calcStatusOf } from "./settings/calcStatus";
import { useRecalculateGrapeRank } from "./settings/useRecalculateGrapeRank";
import { ServiceProviderCard } from "./settings/ServiceProviderCard";
import { TrustCalcCard } from "./settings/TrustCalcCard";
import { useTrustPresetChoice } from "./settings/useTrustPresetChoice";
import { PresetsCard } from "./settings/PresetsCard";
import { PersonalizationCard } from "./settings/PersonalizationCard";
import { NetworkAlertsCard, useNetworkAlertsSummary } from "./settings/NetworkAlertsCard";
import { AdvancedSection } from "./settings/AdvancedSection";
import { useAccountBackup } from "./settings/useAccountBackup";
import { AccountCard } from "./settings/AccountCard";

type SettingsTab = SettingsTabKey;

// "About" not "About & support": three labels share a 339px track at 375px
// wide and only fitted after a padding fix (see the tab-bar comment below).
// A fourth tab was briefly here for Tags; it moved to /tags/mine because
// nothing on it was a setting. Which relays to read IS one, and lives under
// Trust & search.
const TABS: { key: SettingsTab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "trust", label: "Trust & Search", icon: ShieldCheck },
  // The reader's Assistants (2026-10-23, one tab since 2026-11-02): the one Brainstorm
  // hosts for them; every one they've tagged and what each does (Tapestry's My
  // Assistants); and the Treasure Map that hands out the duties — as views
  // (lib/settingsTab assistantViewsFor), the last three admins' only for now.
  { key: "assistants", label: "Assistants", icon: Bot },
  // Its own tab (2026-10-05), out of Trust & search: a reader looks for message settings
  // under "Messages". Where the inbox's "Manage" (and its settings icon) lands.
  { key: "messages", label: "Messages", icon: MessageCircle },
  // The concepts the reader's Assistant keeps for them (2026-10-01: a Settings
  // tab by the team's choice). Past the 375px track, so phones scroll to it.
  // Admins only while it's an internal demo (2026-10-05): see ADMIN_ONLY_TABS.
  { key: "dictionary", label: "Dictionary", icon: BookOpen },
  // Billing lives in Settings because Settings is where you CHANGE things —
  // cancelling is the most consequential account action in the product, and it
  // belongs next to the other irreversible ones rather than on a status page
  // someone lands on while checking a date. The read-only half is on /insights.
  { key: "billing", label: "Billing", icon: CreditCard },
];

// Which tabs an admin has and everyone else has — and which are internal, said
// so on the tab — is lib/settingsTab (settingsTabsFor). The Dictionary
// (2026-10-05): still an internal demo. Its renderers, on list items' pages,
// cards and search rows, are for everyone; only the page about them is hidden.

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  // Live identity: the header avatar updates the moment a profile save lands.
  const user = useActiveAccountDisplay();
  const isAdmin = user?.isAdmin === true;
  const entries = settingsTabsFor({ admin: isAdmin });
  const tabs = entries.map((e) => ({ ...TABS.find((t) => t.key === e.key)!, internal: e.internal }));
  const params = new URLSearchParams(search);
  // Old links — `?tab=trust&focus=messages`, the three old Assistant tabs — land
  // where they pointed (lib/settingsTab); a view the reader doesn't have is "yours".
  const target = settingsTargetFor(
    { tab: params.get("tab"), view: params.get("view"), focus: params.get("focus") },
    tabs.map((t) => t.key),
    { admin: isAdmin },
  );
  const activeTab: SettingsTab = target.tab;
  const assistantView: AssistantView = target.view ?? "yours";
  const assistantViews = assistantViewsFor({ admin: isAdmin });
  // Deep links into a specific control, so a "you can change this in Settings"
  // sentence elsewhere lands ON the thing rather than at the top of a tab:
  //   ?focus=backup      → Account > Back up
  //   ?tab=trust&focus=tag-relays → Trust > Advanced > Where tags come from
  const focusParam = new URLSearchParams(search).get("focus");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightBackup = highlighted === "backup";
  // Tag relays live inside the collapsed "Advanced" block, so a link that only
  // scrolled would land on a closed section. Open it before we scroll.
  const [advancedOpen, setAdvancedOpen] = useState(focusParam === "tag-relays");
  useEffect(() => {
    const target =
      focusParam === "backup"
        ? "account-backup-section"
        : focusParam === "tag-relays"
          ? "tag-relays-section"
          : focusParam === "messages"
            ? "messages-section"
            : null;
    if (!target) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(focusParam);
    }, 150);
    // Drop the cue once it has pulsed (2 × 1.5s) so it's a one-time nudge.
    const off = setTimeout(() => setHighlighted(null), 3400);
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
  }, [focusParam]);
  const goTab = (t: SettingsTab) => {
    navigate(t === "profile" ? "/settings" : `/settings?tab=${t}`);
  };

  const { toast } = useToast();

  const presetChoice = useTrustPresetChoice(user?.pubkey, !!user, () => triggerGrapeRankMutation.mutate());

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const pubkey = user?.pubkey ?? "";

  const backup = useAccountBackup();

  const { data: overviewData, isPending: overviewLoading } = useSelfOverview(user?.pubkey);
  const { data: historyData, isPending: historyLoading } = useSelfHistory(user?.pubkey);
  const selfLoading = overviewLoading || historyLoading;

  // Polled app-wide while a run is in flight (hooks/useScoringStatus), not here.
  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    ...grapeRankResultOptions(),
    enabled: !!user,
  });

  const triggerGrapeRankMutation = useRecalculateGrapeRank();

  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  useEffect(() => {
    if (calcDoneNow) markOwnScores(user?.pubkey);
  }, [calcDoneNow, user?.pubkey]);
  const { isRecalcInProgress, isGrapeRankFailedState, grapeRankStatus, lastCalculated, lastTriggered, taPubkey } =
    calcStatusOf(grapeRankData?.data, historyData?.data);
  const followingCount = overviewData?.data?.counts?.following ?? null;
  const hasNoFollowing = !selfLoading && followingCount === 0;

  // "Status: Active / Provider: Brainstorm" must answer for the on-relay
  // 10040, not the local flag alone — the flag never downgrades on a relay
  // miss, so after the user activates a different provider elsewhere it would
  // keep this card lying. A definitive foreign declaration ("other") reads as
  // not activated; absence/silence keeps the flag's answer.
  const trustProviderStatus = useTrustProviderStatus(user?.pubkey, taPubkey);
  const nip85Activated =
    trustProviderStatus.data === "brainstorm" ||
    (trustProviderStatus.data !== "other" && isNip85Activated(user?.pubkey));
  const trustAnchor = useTrustAnchorActions(user?.pubkey, taPubkey);

  // Network Alerts card inputs (settings/NetworkAlertsCard). A hook, so it lives
  // above the guard: `user` can drop to null while this page is mounted, and a
  // hook below the guard would change the hook count between renders.
  const { ignoredListCount, savedWhere } = useNetworkAlertsSummary(pubkey);

  if (!user || isAuthRedirecting()) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // PROFILE TAB
  // ─────────────────────────────────────────────────────────────────────────
  const profileCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-profile"
    >
      <ProfileEditForm
        onSaved={() =>
          toast({ title: "Profile saved", description: "Your profile has been published.", duration: 3000 })
        }
      />
    </div>
  );

  const accountCard = (
    <AccountCard user={user} backup={backup} highlightBackup={highlightBackup} onSignedOut={handleLogout} />
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TRUST TAB
  // ─────────────────────────────────────────────────────────────────────────
  const serviceProviderCard = (
    <ServiceProviderCard
      selfLoading={selfLoading}
      nip85Activated={nip85Activated}
      lastCalculated={lastCalculated}
      taPubkey={taPubkey}
      hasNoFollowing={hasNoFollowing}
      actions={trustAnchor}
    />
  );

  const trustCalcCard = (
    <TrustCalcCard
      grapeRankLoading={grapeRankLoading}
      grapeRankStatus={grapeRankStatus}
      lastCalculated={lastCalculated}
      lastTriggered={lastTriggered}
      presetUsed={grapeRankData?.data?.graperank_preset_used}
      algorithm={grapeRankData?.data?.algorithm}
      isGrapeRankFailedState={isGrapeRankFailedState}
      isRecalcInProgress={isRecalcInProgress}
      hasNoFollowing={hasNoFollowing}
      triggerGrapeRankMutation={triggerGrapeRankMutation}
    />
  );

  const presetsCard = <PresetsCard choice={presetChoice} />;

  const personalizationCard = <PersonalizationCard npub={user?.npub} />;

  const networkAlertsCard = <NetworkAlertsCard ignoredListCount={ignoredListCount} savedWhere={savedWhere} />;

  const advancedSection = (
    <AdvancedSection
      advancedOpen={advancedOpen}
      setAdvancedOpen={setAdvancedOpen}
      highlighted={highlighted}
      serviceProviderCard={serviceProviderCard}
      trustCalcCard={trustCalcCard}
    />
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ABOUT TAB
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative flex min-h-page flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-settings"
    >
      <GlossBackground />
      <AppHeader user={user} onLogout={handleLogout} active="settings" />

      <main className={cn(pageWidth("wide"), "relative z-10 flex-1 py-6 sm:py-8")}>
        <DeferredSessionNotice className="mb-6" />
        <div className="space-y-6" data-testid="container-settings">
          <PageHeader
            kicker="Brainstorm Settings"
            title="Settings"
            subtitle="Manage your profile, trust, and account — all in one place."
            testId="section-settings-header"
          />

          {/* Tab navigation — segmented pill, matching the FAQ page.
              The three labels measure 367px against a 339px track at 375px wide,
              so "About & support" was being sliced mid-word at the container's
              padding edge — which reads as broken layout, not as a scroller.
              Two fixes: tighter horizontal padding below `sm` buys back ~48px so
              all three fit on a normal phone, and the scroll track bleeds to the
              true screen edge (-mx-4 cancelling the page's px-4, re-padded
              inside) so on a narrow device like an SE the cut lands at the edge
              of the display, which is the universal "this scrolls" cue. */}
          <div
            className="scrollbar-hide -mx-4 max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0"
            data-testid="settings-tab-bar"
          >
            <div className="border-brand-accent/12 inline-flex rounded-full border bg-white/70 p-1 shadow-sm backdrop-blur-sm dark:bg-slate-900/70">
              {tabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => goTab(tab.key)}
                    aria-current={active ? "page" : undefined}
                    className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 sm:px-5 ${
                      active
                        ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/[0.3]"
                        : "text-slate-500 hover:text-brand-deep dark:text-slate-400"
                    }`}
                    data-testid={`tab-${tab.key}`}
                  >
                    {tab.label}
                    {tab.internal && <InternalChip />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "profile" && (
            <div className="space-y-6" data-testid="tab-content-profile">
              {profileCard}
              {personalizationCard}
              {accountCard}
            </div>
          )}

          {activeTab === "trust" && (
            <div className="space-y-6" data-testid="tab-content-trust">
              {presetsCard}
              {networkAlertsCard}
              {advancedSection}
            </div>
          )}

          {activeTab === "assistants" && (
            <div className="space-y-6" data-testid="tab-content-assistants">
              {/* The views, for a reader who has more than one: Yours for everyone; the list,
                  the duties and the map for admins while they're internal. */}
              {assistantViews.length > 1 && (
                <div
                  className="inline-flex gap-0.5 rounded-lg border-2 border-brand-accent/40 bg-white p-1 shadow-sm dark:bg-slate-900"
                  role="tablist"
                  aria-label="Assistants view"
                  data-testid="assistants-views"
                >
                  {assistantViews.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      role="tab"
                      aria-selected={assistantView === v.key}
                      onClick={() =>
                        navigate(
                          v.key === "yours" ? "/settings?tab=assistants" : `/settings?tab=assistants&view=${v.key}`,
                        )
                      }
                      className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-bold transition-all active:scale-95 ${assistantView === v.key ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
                      data-testid={`assistants-view-${v.key}`}
                    >
                      {v.label}
                      {v.internal && <InternalChip />}
                    </button>
                  ))}
                </div>
              )}
              {/* One card while everything happens on this site; the others join it once there are some. */}
              {assistantView === "yours" && (
                <YourAssistants viewer={user?.pubkey}>
                  <BrainstormAssistantCard variant="settings" lastCalculated={lastCalculated} />
                </YourAssistants>
              )}
              {(assistantView === "all" || assistantView === "duties") && (
                <AssistantsTab viewer={user?.pubkey} view={assistantView === "duties" ? "duties" : "assistants"} />
              )}
              {assistantView === "map" && <TreasureMapTab viewer={user?.pubkey} />}
            </div>
          )}

          {activeTab === "messages" && (
            <div className="space-y-6" data-testid="tab-content-messages">
              <MessagesSettingsCard />
            </div>
          )}

          {activeTab === "dictionary" && (
            <div className="space-y-6" data-testid="tab-content-dictionary">
              <DictionaryTab />
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-6" data-testid="tab-content-billing">
              <BillingCard />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

/**
 * Route wrapper that catches `/settings?tab=tags`.
 *
 * Tags was a Settings tab for a day before moving to `/tags/mine` (nothing on
 * it was a setting). Those links land here; sending them on beats silently
 * dropping them on Profile, which reads as "the feature was removed".
 *
 * Done BEFORE `SettingsPage` mounts rather than in an effect inside it: this
 * page fires authenticated requests on mount, so an in-page redirect races
 * them. Never rendering it is the version with no race to lose.
 */
export function SettingsRoute() {
  const tabParam = new URLSearchParams(useSearch()).get("tab");
  if (tabParam === "tags") return <Redirect to="/tags/mine" replace />;
  return <SettingsPage />;
}
