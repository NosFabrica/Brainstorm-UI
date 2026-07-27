import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
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
import SettingsPage from "@/pages/SettingsPage";
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
import DevelopersPage from "@/pages/DevelopersPage";
import DeveloperNip50Page from "@/pages/DeveloperNip50Page";
import DeveloperOpenRankingPage from "@/pages/DeveloperOpenRankingPage";
import DeveloperTrustedAssertionsPage from "@/pages/DeveloperTrustedAssertionsPage";
import NostrPage from "@/pages/NostrPage";
import HashtagPage from "@/pages/HashtagPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import AdminPage from "@/pages/AdminPage";
import UserPanelPage from "@/pages/UserPanelPage";
import LoginPage from "@/pages/LoginPage";
import { FEATURES } from "@/config/featureFlags";
import { PovAutoDefault } from "@/components/PovBadge";
import { MobileMenuHost } from "@/components/MobileMenuHost";
import { getCurrentUser, ensureUnlocked } from "@/services/nostr";
import type { ComponentType } from "react";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
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
  if (!getCurrentUser()) {
    const next =
      location && location.startsWith("/") && location !== "/login"
        ? `?next=${encodeURIComponent(location)}`
        : "";
    return <Redirect to={`/login${next}`} />;
  }
  return <Component />;
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
        <Route path="/search" component={SearchRedirect} />
        {/* Advanced/analytics profile — members only; /p/:id is the public profile. */}
        <Route path="/profile/:npub">{() => <RequireAuth component={ProfilePage} />}</Route>
        <Route path="/p/:id/hops" component={HopsPathPage} />
        <Route path="/p/:id/:type" component={ConnectionListPage} />
        <Route path="/p/:id" component={SharePage} />
        <Route path="/a/:id" component={ArticlePage} />
      <Route path="/e/:id" component={EventPage} />
        <Route path="/t/:tag" component={HashtagPage} />
        <Route path="/hero-lab" component={HeroLab} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/setup">{() => <RequireAuth component={OnboardingWizard} />}</Route>
        <Route path="/activate" component={ActivatePage} />
        <Route path="/settings">{() => <RequireAuth component={SettingsPage} />}</Route>
        <Route path="/network">{() => <RequireAuth component={NetworkPage} />}</Route>
        <Route path="/what-is-wot" component={WhatIsWotPage} />
        <Route path="/how-search-works" component={HowSearchWorksPage} />
        <Route path="/personalization" component={PersonalizationPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/developers" component={DevelopersPage} />
        <Route path="/developers/nip-50" component={DeveloperNip50Page} />
        <Route path="/developers/open-ranking" component={DeveloperOpenRankingPage} />
        <Route path="/developers/trusted-assertions" component={DeveloperTrustedAssertionsPage} />
        <Route path="/nostr" component={NostrPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/faq" component={FaqPage} />
        {FEATURES.agentSuite && <Route path="/agentsuite">{() => <RequireAuth component={UserPanelPage} />}</Route>}
        <Route path="/admin">{() => <RequireAuth component={AdminPage} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  // Warm up the in-memory secret key on boot so the encrypted-at-rest key is
  // decrypted (silently, no password) before the first signing action — keeps the
  // synchronous reveal/backup paths correct. Only for signed-in users (the decrypt
  // is bound to the account pubkey); anonymous visitors skip the IndexedDB open.
  useEffect(() => {
    if (getCurrentUser()) void ensureUnlocked();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300} skipDelayDuration={100}>
        <Toaster />
        <PovAutoDefault />
        <MobileMenuHost />
        <ScoringStatusBar />
        <AutoScoreReturning />
        <AutoActivateBrainstorm />
        <AutoPublishAssistant />
        <LightboxProvider>
          <Router />
        </LightboxProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
