import { useEffect, useLayoutEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation, useParams } from "wouter";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { accountManager } from "@/accounts";
import { eventStore } from "@/services/nostr";
import { stopAllMedia } from "@/lib/audioPlayer";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LightboxProvider } from "@/components/share/Lightbox";
import { AutoScoreReturning } from "@/components/AutoScoreReturning";
import { AutoActivateBrainstorm } from "@/components/AutoActivateBrainstorm";
import { AutoPublishAssistant } from "@/components/AutoPublishAssistant";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import DashboardPage from "@/pages/DashboardPage";
import AlertsPage from "@/pages/AlertsPage";
import ReadingPage from "@/pages/ReadingPage";
import InsightsPage from "@/pages/InsightsPage";
import { SettingsRoute } from "@/pages/SettingsPage";
import WhatIsWotPage from "@/pages/WhatIsWotPage";
import OnboardingPage from "@/pages/OnboardingPage";
import NetworkPage from "@/pages/NetworkPage";
import ProfilePage from "@/pages/ProfilePage";
import SharePage from "@/pages/SharePage";
import ConnectionListPage from "@/pages/ConnectionListPage";
import HopsPathPage from "@/pages/HopsPathPage";
import ArticlePage from "@/pages/ArticlePage";
import EventPage from "@/pages/EventPage";
import WelcomePage from "@/pages/WelcomePage";
import OnboardingWizard from "@/pages/OnboardingWizard";
import HeroLab from "@/pages/HeroLab";
import ActivatePage from "@/pages/ActivatePage";
import { ScoringStatusBar } from "@/components/ScoringStatusBar";
import FaqPage from "@/pages/FaqPage";
import HowSearchWorksPage from "@/pages/HowSearchWorksPage";
import PersonalizationPage from "@/pages/PersonalizationPage";
import AboutPage from "@/pages/AboutPage";
import PricingPage from "@/pages/PricingPage";
import RoadmapPage from "@/pages/RoadmapPage";
import DevelopersPage from "@/pages/DevelopersPage";
import DeveloperNip50Page from "@/pages/DeveloperNip50Page";
import DeveloperOpenRankingPage from "@/pages/DeveloperOpenRankingPage";
import DeveloperTrustedAssertionsPage from "@/pages/DeveloperTrustedAssertionsPage";
import NostrPage from "@/pages/NostrPage";
import HashtagPage from "@/pages/HashtagPage";
import TagPage from "@/pages/TagPage";
import TagIndexPage from "@/pages/TagIndexPage";
import MyTagsPage from "@/pages/MyTagsPage";
import HowTagsWorkPage from "@/pages/HowTagsWorkPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import AdminPage from "@/pages/AdminPage";
import UserPanelPage from "@/pages/UserPanelPage";
import LoginPage from "@/pages/LoginPage";
import { FEATURES } from "@/config/featureFlags";
import { PovAutoDefault } from "@/components/PovBadge";
import { DemoSubscriptionSwitcher } from "@/components/billing/DemoSubscriptionSwitcher";
import { MobileTabBar } from "@/components/MobileTabBar";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileSearchOverlay } from "@/components/MobileSearchOverlay";
import { UnlockModal } from "@/components/UnlockModal";
import { CrossTabIdentity } from "@/components/CrossTabIdentity";
import { SignerApprovalModal } from "@/components/SignerApprovalModal";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { isAdminPubkey } from "@/config/adminAccess";
import type { ComponentType } from "react";

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

// Stop inline media when the route changes — the shared audio track and any
// playing <video>. A Picture-in-Picture video is deliberately EXEMPT: it keeps
// playing across the app like a YouTube mini-player until the user closes it.
// Audio keeps its position so returning resumes. Skips the first render.
function StopMediaOnNavigate() {
  const [location] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    stopAllMedia();
  }, [location]);
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

// Account-only pages are hidden from anonymous visitors: no preview, just a
// clean redirect to the dedicated sign-in page (carrying ?next=<requested path>
// so users return after signing in). Public pages (/, /p/:id,
// /faq, /what-is-wot, /how-search-works, /personalization, /about, /nostr) render for everyone.
function RequireAuth({ component: Component }: { component: ComponentType }) {
  const [location] = useLocation();
  // Identity is known synchronously on the first render — accounts bootstrap at
  // module load precisely so this guard never bounces a signed-in user.
  const signedIn = useActiveAccountDisplay();
  if (!signedIn) {
    const next =
      location && location.startsWith("/") && location !== "/login"
        ? `?next=${encodeURIComponent(location)}`
        : "";
    // `replace`, not push: pushing leaves the gated URL in history, so pressing
    // Back returns to it, RequireAuth fires again and shoves you forward to
    // /login — a trap you can't reverse out of. Replacing means Back skips
    // straight past to wherever you actually came from.
    return <Redirect to={`/login${next}`} replace />;
  }
  return <Component />;
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

/**
 * `/admin` — the operator console, for operators.
 *
 * `RequireAuth` asks only whether anyone is signed in, so any key that pasted its
 * way in could open this. The API refuses the data, but the page still discloses
 * what the console *tracks* — its panels, its metrics, which subsystems exist —
 * and that is not something to hand to every signed-in user.
 *
 * The claim is the Session's, minted with the token rather than looked up, so an
 * identity this browser doesn't hold can never satisfy it. It survives a deferred
 * session — the token stays on the Account until re-auth — so an admin whose
 * session lapsed still reaches their console and is told to sign in again there,
 * rather than being bounced out of it.
 */
function AdminRoute() {
  const user = useActiveAccountDisplay();
  if (!user?.isAdmin) return <Redirect to="/dashboard" replace />;
  return <AdminPage />;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <StopMediaOnNavigate />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={LoginPage} />
        <Route path="/onboarding">{() => <RequireAuth component={OnboardingPage} />}</Route>
        <Route path="/dashboard">{() => <RequireAuth component={DashboardPage} />}</Route>
        <Route path="/alerts">{() => <RequireAuth component={AlertsPage} />}</Route>
        <Route path="/reading">{() => <RequireAuth component={ReadingPage} />}</Route>
        <Route path="/insights">{() => <RequireAuth component={InsightsPage} />}</Route>
        <Route path="/search" component={SearchRedirect} />
        {/* Deprecated for users — see ProfileRoute. /p/:id is THE profile page. */}
        <Route path="/profile/:npub">{() => <RequireAuth component={ProfileRoute} />}</Route>
        <Route path="/p/:id/hops" component={HopsPathPage} />
        <Route path="/p/:id/:type" component={ConnectionListPage} />
        <Route path="/p/:id" component={SharePage} />
        <Route path="/a/:id" component={ArticlePage} />
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
        <Route path="/setup">{() => <RequireAuth component={OnboardingWizard} />}</Route>
        <Route path="/activate" component={ActivatePage} />
        <Route path="/settings">{() => <RequireAuth component={SettingsRoute} />}</Route>
        <Route path="/network">{() => <RequireAuth component={NetworkPage} />}</Route>
        <Route path="/what-is-wot" component={WhatIsWotPage} />
        <Route path="/how-search-works" component={HowSearchWorksPage} />
        <Route path="/how-tags-work" component={HowTagsWorkPage} />
        <Route path="/personalization" component={PersonalizationPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/pricing" component={PricingPage} />
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
            <UnlockModal />
            <SignerApprovalModal />
            <CrossTabIdentity />
            <PovAutoDefault />
            {/* Mock-mode only; self-removing once real billing ships. */}
            <DemoSubscriptionSwitcher />
            <MobileTabBar />
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
