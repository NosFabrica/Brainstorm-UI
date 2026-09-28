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
  /** False on a page whose own content is a search box (/what-is-wot's hero). */
  headerSearch?: boolean;
}

export function InfoPageLayout({ children, testId, active, headerSearch = true }: InfoPageLayoutProps) {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (isAuthRedirecting()) return null;

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-clip bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-900 dark:text-slate-100"
      data-testid={testId}
    >
      <PageBackground />

      {user ? (
        <AppHeader user={user} onLogout={handleLogout} active={active} search={headerSearch} />
      ) : (
        // Signed out: the public-page header — B mark, the shared search box, Sign in —
        // at the signed-in bar's width, so the bar is the same bar either way.
        <PublicPageHeader
          maxWidthClass="max-w-7xl"
          search={headerSearch}
          actions={
            <SignInButton
              variant="primary"
              label="Sign in"
              className="!rounded-full sm:px-5"
              data-testid="button-sign-in"
            />
          }
        />
      )}

      <main className="relative z-10 flex-1">{children}</main>

      <Footer />
    </div>
  );
}
