import { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import DashboardPage from "@/pages/DashboardPage";
import SearchPage from "@/pages/SearchPage";
import SettingsPage from "@/pages/SettingsPage";
import WhatIsWotPage from "@/pages/WhatIsWotPage";
import OnboardingPage from "@/pages/OnboardingPage";
import NetworkPage from "@/pages/NetworkPage";
import ProfilePage from "@/pages/ProfilePage";
import FaqPage from "@/pages/FaqPage";
import AdminPage from "@/pages/AdminPage";
import UserPanelPage from "@/pages/UserPanelPage";
import LoginPage from "@/pages/LoginPage";
import { FEATURES } from "@/config/featureFlags";
import { PovAutoDefault } from "@/components/PovBadge";
import { MobileMenuHost } from "@/components/MobileMenuHost";
import { getCurrentUser } from "@/services/nostr";
import type { ComponentType } from "react";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

// Account-only pages are hidden from anonymous visitors: no preview, just a
// clean redirect to the search-first home. Public pages (/, /search,
// /profile/:npub, /faq, /what-is-wot) render for everyone.
function RequireAuth({ component: Component }: { component: ComponentType }) {
  if (!getCurrentUser()) {
    return <Redirect to="/" />;
  }
  return <Component />;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={LoginPage} />
        <Route path="/onboarding">{() => <RequireAuth component={OnboardingPage} />}</Route>
        <Route path="/dashboard">{() => <RequireAuth component={DashboardPage} />}</Route>
        <Route path="/search" component={SearchPage} />
        <Route path="/profile/:npub" component={ProfilePage} />
        <Route path="/settings">{() => <RequireAuth component={SettingsPage} />}</Route>
        <Route path="/network">{() => <RequireAuth component={NetworkPage} />}</Route>
        <Route path="/what-is-wot" component={WhatIsWotPage} />
        <Route path="/faq" component={FaqPage} />
        {FEATURES.agentSuite && <Route path="/agentsuite">{() => <RequireAuth component={UserPanelPage} />}</Route>}
        <Route path="/admin">{() => <RequireAuth component={AdminPage} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300} skipDelayDuration={100}>
        <Toaster />
        <PovAutoDefault />
        <MobileMenuHost />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
