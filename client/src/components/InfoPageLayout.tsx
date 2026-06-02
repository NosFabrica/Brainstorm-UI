import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { isAuthRedirecting } from "@/services/api";
import { BrainLogo } from "@/components/BrainLogo";
import { SignInButton } from "@/components/SignInButton";
import { AppHeader } from "@/components/AppHeader";
import { type AppKey } from "@/components/AppsLauncher";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";

interface InfoPageLayoutProps {
  children: ReactNode;
  testId?: string;
  active?: AppKey;
}

export function InfoPageLayout({ children, testId, active }: InfoPageLayoutProps) {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (u) setUser(u);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const calcDone =
    typeof window !== "undefined" &&
    window.localStorage.getItem("brainstorm_calc_completed") === "true";

  if (isAuthRedirecting()) return null;

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden"
      data-testid={testId}
    >
      <PageBackground />

      {user ? (
        <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} active={active} />
      ) : (
        <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
                <BrainLogo size={28} clickable className="text-indigo-500" />
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }} data-testid="text-logo">
                  Brainstorm
                </h1>
              </div>
              <SignInButton variant="ghost" data-testid="button-sign-in" />
            </div>
          </div>
        </nav>
      )}

      <main className="flex-1 relative z-10">{children}</main>

      <Footer />
    </div>
  );
}
