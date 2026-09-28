import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation, useParams } from "wouter";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { accountManager } from "@/accounts";
import { eventStore } from "@/services/nostr";
import { stopAllMedia } from "@/lib/audioPlayer";
import { installSoloPlayback } from "@/lib/playback";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { DemoScoreDisplaySwitcher } from "@/components/score/DemoScoreDisplaySwitcher";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LightboxProvider } from "@/components/share/Lightbox";
import { trackHistoryEntry } from "@/lib/historyState";
import { AutoScoreReturning } from "@/components/AutoScoreReturning";
import { AutoActivateBrainstorm } from "@/components/AutoActivateBrainstorm";
import { AutoPublishAssistant } from "@/components/AutoPublishAssistant";
import NotFound from "@/pages/not-found";
import ShortLinkPage from "@/pages/ShortLinkPage";
import { SHORT_LINK_ROUTE } from "@/lib/shortLink";
import Landing from "@/pages/landing";
import SharePage from "@/pages/SharePage";
import { ScoringStatusBar } from "@/components/ScoringStatusBar";
import { AdminRoute } from "@/pages/AdminRoute";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { RouteFallback } from "@/components/RouteFallback";
import { FEATURES } from "@/config/featureFlags";
import { PovAutoDefault } from "@/components/PovBadge";
import { MobileTabBar } from "@/components/MobileTabBar";
import { NowPlayingBar } from "@/components/search/NowPlayingBar";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileSearchOverlay } from "@/components/MobileSearchOverlay";
import { UnlockModal } from "@/components/UnlockModal";
import { CrossTabIdentity } from "@/components/CrossTabIdentity";
import { SignerApprovalModal } from "@/components/SignerApprovalModal";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isAdminPubkey } from "@/config/adminAccess";

// Every route but the search home, a shared profile, the 404 and the admin
// guard is its own download.
const AboutPage = lazyWithReload(() => import("@/pages/AboutPage"));
const ActivateBrainstormPage = lazyWithReload(() => import("@/pages/ActivateBrainstormPage"));
const ActivatePage = lazyWithReload(() => import("@/pages/ActivatePage"));
const AlertsPage = lazyWithReload(() => import("@/pages/AlertsPage"));
const BillingReturnPage = lazyWithReload(() => import("@/pages/BillingReturnPage"));
const ConnectionListPage = lazyWithReload(() => import("@/pages/ConnectionListPage"));
const DashboardPage = lazyWithReload(() => import("@/pages/DashboardPage"));
const DeveloperNip50Page = lazyWithReload(() => import("@/pages/DeveloperNip50Page"));
const DeveloperOpenRankingPage = lazyWithReload(() => import("@/pages/DeveloperOpenRankingPage"));
const DeveloperTrustedAssertionsPage = lazyWithReload(() => import("@/pages/DeveloperTrustedAssertionsPage"));
const DevelopersPage = lazyWithReload(() => import("@/pages/DevelopersPage"));
const EventPage = lazyWithReload(() => import("@/pages/EventPage"));
const AddressRedirect = lazyWithReload(() => import("@/pages/EventPage").then((m) => ({ default: m.AddressRedirect })));
const FaqPage = lazyWithReload(() => import("@/pages/FaqPage"));
const FinishSetupPage = lazyWithReload(() => import("@/pages/FinishSetupPage"));
const HashtagPage = lazyWithReload(() => import("@/pages/HashtagPage"));
const HeroLab = lazyWithReload(() => import("@/pages/HeroLab"));
const HopsPathPage = lazyWithReload(() => import("@/pages/HopsPathPage"));
const HowSearchWorksPage = lazyWithReload(() => import("@/pages/HowSearchWorksPage"));
const HowTagsWorkPage = lazyWithReload(() => import("@/pages/HowTagsWorkPage"));
const InsightsPage = lazyWithReload(() => import("@/pages/InsightsPage"));
const LoginPage = lazyWithReload(() => import("@/pages/LoginPage"));
const MyTagsPage = lazyWithReload(() => import("@/pages/MyTagsPage"));
const NetworkPage = lazyWithReload(() => import("@/pages/NetworkPage"));
const NostrPage = lazyWithReload(() => import("@/pages/NostrPage"));
const OnboardingPage = lazyWithReload(() => import("@/pages/OnboardingPage"));
const PersonalizationPage = lazyWithReload(() => import("@/pages/PersonalizationPage"));
const PricingPage = lazyWithReload(() => import("@/pages/PricingPage"));
const PrivacyPage = lazyWithReload(() => import("@/pages/PrivacyPage"));
const ProfilePage = lazyWithReload(() => import("@/pages/ProfilePage"));
const ReadingPage = lazyWithReload(() => import("@/pages/ReadingPage"));
const RoadmapPage = lazyWithReload(() => import("@/pages/RoadmapPage"));
const SellingPage = lazyWithReload(() => import("@/pages/SellingPage"));
const SupportPage = lazyWithReload(() => import("@/pages/SupportPage"));
const SettingsRoute = lazyWithReload(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsRoute })));
const TagIndexPage = lazyWithReload(() => import("@/pages/TagIndexPage"));
const TagPage = lazyWithReload(() => import("@/pages/TagPage"));
const TermsPage = lazyWithReload(() => import("@/pages/TermsPage"));
const UserPanelPage = lazyWithReload(() => import("@/pages/UserPanelPage"));
const WelcomePage = lazyWithReload(() => import("@/pages/WelcomePage"));
const WhatIsWotPage = lazyWithReload(() => import("@/pages/WhatIsWotPage"));

/**
 * Land every route change at the top of the page.
 *
 * A plain `useEffect` + `window.scrollTo(0, 0)` looked right but lost three races,
 * which is why pages were still opening part-scrolled:
 *
 *  1. The browser's own scroll restoration (`history.scrollRestoration` defaults
 *     to "auto") re-applies the previous offset, sometimes AFTER our effect ran.
 *     Setting it to "manual" stops the browser competing with us.
 *  2. These pages fetch their content, so at effect time the document is still
 *     short — scrolling to 0 is a no-op — and then content arrives, the page grows
 *     and the old offset is back. A post-paint rAF pass catches that.
 *  3. Depending on the surface, the scroller is `window`, `documentElement` or
 *     `body` (notably in an iOS standalone PWA), so reset all three.
 */
/** Stamps every history entry with its in-app depth, for `useGoBack`. */
function TrackHistoryDepth() {
  const [location] = useLocation();
  useEffect(() => { trackHistoryEntry(); }, [location]);
  return null;
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    try {
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    } catch { /* ignore */ }
  }, []);

  useLayoutEffect(() => {
    const toTop = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      } catch {
        window.scrollTo(0, 0);
      }
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };
    toTop();
    // Again after paint, so late-arriving content can't restore the old offset.
    const raf = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(raf);
  }, [location]);

  return null;
}

// Stop inline VIDEO when the route changes. A Picture-in-Picture video is
// deliberately EXEMPT: it keeps playing across the app like a YouTube
// mini-player until the user closes it. Music is exempt too: it has the
// app-wide NowPlayingBar, whose X is how a song stops. Skips the first render.
function StopMediaOnNavigate() {
  const [location] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    stopAllMedia();
  }, [location]);
  return null;
}

// One sound at a time: whatever starts sounding — the music bar, a stream,
// a clip the reader unmutes, an embed — takes the floor and the rest pause.
// One document listener covers every media element (lib/playback).
function SoloPlayback() {
  useEffect(() => installSoloPlayback(), []);
  return null;
}

// The search experience now lives on the home page (`/`). Old `/search` links
// (and `/search?q=...` deep links) redirect to `/` preserving the query so they
// keep working.
function SearchRedirect() {
  let search = "";
  try { search = window.location.search || ""; } catch {}
  return <Redirect to={`/${search}`} replace />;
}


/**
 * `/profile/:npub` — the old analytics view, now admin-only.
 *
 * `/p/:id` is the profile page. This one survives as operator telemetry
 * (audience quality, network position, GrapeRank parameters, reports in both
 * directions) that no normal user asked for, and it is deliberately NOT the
 * place a user lands when they click someone's name.
 *
 * ## Why the guard is here and not just on the links
 *
 * Eight call sites pointed at this route and four of them were user-facing;
 * the Deep dive on the dashboard's Network Alerts was the one that surfaced
 * it. Repointing links alone fixes today and nothing else — it can't catch a
 * bookmark, a shared URL, or the ninth link someone adds next month. A rule at
 * the route is one thing to keep true instead of an audit to repeat.
 *
 * The links were repointed as well, so a user never eats a redirect on the way
 * to a page they wanted; this is the backstop, not the mechanism.
 *
 * `replace` for the same reason RequireAuth uses it: pushing would leave the
 * deprecated URL in history, and Back would bounce you forward again.
 */
function ProfileRoute() {
  const params = useParams<{ npub: string }>();
  // `getCurrentUser()` went with the v1 auth layer; the Active Account answers the
  // same question, and `isAdminPubkey` reads the Session's own admin claim.
  const user = useActiveAccountDisplay();
  if (!isAdminPubkey(user?.pubkey)) {
    return <Redirect to={`/p/${params.npub}`} replace />;
  }
  return <ProfilePage />;
}

function Router() {
  const [location] = useLocation();
  return (
    <>
      <TrackHistoryDepth />
      <ScrollToTop />
      <StopMediaOnNavigate />
      <SoloPlayback />
      <ErrorBoundary resetKey={location}>
      <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={LoginPage} />
        <Route path="/onboarding">{() => <RequireAuth component={OnboardingPage} />}</Route>
        <Route path="/dashboard">{() => <RequireAuth component={DashboardPage} />}</Route>
        <Route path="/alerts">{() => <RequireAuth component={AlertsPage} />}</Route>
        <Route path="/reading">{() => <RequireAuth component={ReadingPage} />}</Route>
        <Route path="/insights">{() => <RequireAuth component={InsightsPage} />}</Route>
        <Route path="/support">{() => <RequireAuth component={SupportPage} />}</Route>
        <Route path="/search" component={SearchRedirect} />
        {/* Deprecated for users — see ProfileRoute. /p/:id is THE profile page. */}
        <Route path="/profile/:npub">{() => <RequireAuth component={ProfileRoute} />}</Route>
        {/* Short share links resolve here, then continue to /p/. */}
        <Route path={SHORT_LINK_ROUTE} component={ShortLinkPage} />
        <Route path="/p/:id/hops" component={HopsPathPage} />
        <Route path="/p/:id/selling" component={SellingPage} />
        <Route path="/p/:id/:type" component={ConnectionListPage} />
        <Route path="/p/:id" component={SharePage} />
        {/* One page for every event: the id (note, nevent, naddr) says which
            version, the kind how it reads. /a/ links already out there keep working. */}
        <Route path="/a/:id" component={AddressRedirect} />
        <Route path="/e/:id" component={EventPage} />
        <Route path="/t/:tag" component={HashtagPage} />
        {/* Public tag pages. The index must precede the per-tag route. */}
        <Route path="/tags" component={TagIndexPage} />
        {/* Before the :author/:slug pattern — "mine" is a page, not an author.
            Gated: it's your own record, and `next` now points at a real page
            rather than the redirect this used to be. */}
        <Route path="/tags/mine">{() => <RequireAuth component={MyTagsPage} />}</Route>
        <Route path="/tags/:author/:slug" component={TagPage} />
        <Route path="/hero-lab" component={HeroLab} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/setup/activate">{() => <RequireAuth component={ActivateBrainstormPage} />}</Route>
        <Route path="/setup">{() => <RequireAuth component={FinishSetupPage} />}</Route>
        <Route path="/activate" component={ActivatePage} />
        <Route path="/settings">{() => <RequireAuth component={SettingsRoute} />}</Route>
        <Route path="/network">{() => <RequireAuth component={NetworkPage} />}</Route>
        <Route path="/what-is-wot" component={WhatIsWotPage} />
        <Route path="/how-search-works" component={HowSearchWorksPage} />
        <Route path="/how-tags-work" component={HowTagsWorkPage} />
        <Route path="/personalization" component={PersonalizationPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/pricing" component={PricingPage} />
        {/* Flash's registered redirect target — a bare path on purpose
            (redirect_uri matching is exact, query string included). */}
        <Route path="/billing/return" component={BillingReturnPage} />
        {/* The alias receipts and support links point at. */}
        <Route path="/billing">{() => <Redirect to="/settings?tab=billing" replace />}</Route>
        <Route path="/roadmap" component={RoadmapPage} />
        <Route path="/developers" component={DevelopersPage} />
        <Route path="/developers/nip-50" component={DeveloperNip50Page} />
        <Route path="/developers/open-ranking" component={DeveloperOpenRankingPage} />
        <Route path="/developers/trusted-assertions" component={DeveloperTrustedAssertionsPage} />
        <Route path="/nostr" component={NostrPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/faq" component={FaqPage} />
        {FEATURES.agentSuite && <Route path="/agentsuite">{() => <RequireAuth component={UserPanelPage} />}</Route>}
        <Route path="/admin">{() => <RequireAuth component={AdminRoute} />}</Route>
        <Route component={NotFound} />
      </Switch>
      </Suspense>
      </ErrorBoundary>
    </>
  );
}

function App() {
  return (
    <AccountsProvider manager={accountManager}>
      <EventStoreProvider eventStore={eventStore}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300} skipDelayDuration={100}>
            <Toaster />
            <DemoScoreDisplaySwitcher />
            <UnlockModal />
            <SignerApprovalModal />
            <CrossTabIdentity />
            <PovAutoDefault />
            <MobileTabBar />
            <NowPlayingBar />
            <CommandPalette />
            <MobileSearchOverlay />
            <ScoringStatusBar />
            <AutoScoreReturning />
            <AutoActivateBrainstorm />
            <AutoPublishAssistant />
            <LightboxProvider>
              <Router />
            </LightboxProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </EventStoreProvider>
    </AccountsProvider>
  );
}

export default App;
