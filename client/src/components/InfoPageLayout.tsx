import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { isAuthRedirecting } from "@/services/api";
import { PublicPageHeader } from "@/components/PublicPageHeader";
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
        // Signed out: the public-page header — B mark, the shared search box, Sign in —
        // at the signed-in bar's width, so the bar is the same bar either way.
        <PublicPageHeader
          maxWidthClass="max-w-7xl"
          actions={<SignInButton variant="primary" label="Sign in" className="!rounded-full sm:px-5" data-testid="button-sign-in" />}
        />
      )}

      <main className="flex-1 relative z-10">{children}</main>

      <Footer />
    </div>
  );
}
