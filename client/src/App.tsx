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
import PersonalizationPage from "@/pages/PersonalizationPage";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login">{() => <Redirect to="/" />}</Route>
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/profile/:npub" component={ProfilePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/network" component={NetworkPage} />
        <Route path="/what-is-wot" component={WhatIsWotPage} />
        <Route path="/faq" component={FaqPage} />
        <Route path="/agentsuite" component={UserPanelPage} />
        <Route path="/personalization" component={PersonalizationPage} />
        <Route path="/admin" component={AdminPage} />
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
