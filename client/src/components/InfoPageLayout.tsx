import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { isAuthRedirecting } from "@/services/api";
import { Wordmark } from "@/components/Wordmark";
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
  const user = useActiveAccountDisplay();

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
      className="min-h-screen bg-[#F8FAFC] dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans selection:bg-brand-primary/[0.3] flex flex-col relative overflow-hidden"
      data-testid={testId}
    >
      <PageBackground />

      {user ? (
        <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} active={active} />
      ) : (
        <nav className="sticky top-0 z-40 backdrop-blur-md" data-testid="nav-info-signed-out">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              {/* Handwritten wordmark — gradient on light, white on dark; matches
                  the signed-in AppHeader on these same app-chrome pages. */}
              <button
                type="button"
                className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
                onClick={() => navigate("/")}
                aria-label="Brainstorm home"
                data-testid="text-logo"
              >
                <Wordmark height={26} className="shrink-0 dark:hidden" />
                <Wordmark height={26} variant="white" className="hidden shrink-0 dark:block" />
              </button>
              <SignInButton variant="primary" label="Sign in" className="!rounded-full sm:px-5" data-testid="button-sign-in" />
            </div>
          </div>
        </nav>
      )}

      <main className="flex-1 relative z-10">{children}</main>

      <Footer />
    </div>
  );
}
