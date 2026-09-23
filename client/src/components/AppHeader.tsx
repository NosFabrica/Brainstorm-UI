import { useLocation } from "wouter";
import { Wordmark } from "@/components/Wordmark";
import { AdminBadge } from "@/components/AdminBadge";
import { type AppKey } from "@/components/AppsLauncher";
import { AccountMenu } from "@/components/AccountMenu";
import { FinishSetupBanner } from "@/components/FinishSetupBanner";
import { type AccountDisplay } from "@/accounts/display";
import { type ReactNode } from "react";

interface AppHeaderProps {
  user: AccountDisplay;
  onLogout: () => void;
  calcDone?: boolean;
  active?: AppKey;
  /**
   * Optional page-level controls (e.g. a Why/How mode toggle) rendered inline in
   * the header's right cluster on desktop. Hidden on mobile.
   */
  actions?: ReactNode;
  /** Retained for API compatibility — headers are now uniformly transparent. */
  variant?: "dark" | "light";
}

/**
 * Single shared top navigation used by every authenticated page. Uniform,
 * Google-like: a transparent (frosted-on-scroll) bar with only the B mark on
 * the left and the apps launcher + account menu on the right. Primary
 * destinations (Search/Dashboard/Network) live inside the account menu; the
 * apps launcher holds the product family. On mobile the bottom tab bar +
 * account sheet own navigation, so the header is just the wordmark.
 */
export function AppHeader({ user, onLogout, calcDone = false, active, actions }: AppHeaderProps) {
  const [, navigate] = useLocation();
  const isAdmin = user.isAdmin;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md" data-testid="nav-app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        {/* Three regions instead of justify-between so the finish-setup banner
            sits visually centered regardless of how the side clusters differ. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 justify-self-start">
            {/* Handwritten wordmark — the full brand signature (same as the
                homepage hero). App-chrome pages (dashboard, network, settings,
                FAQ, admin, /profile) have no header search bar, so the wordmark
                anchors them; the search-bar headers (home, /p share pages) keep
                the compact B mark. Gradient reads on light, white on dark. */}
            <button
              type="button"
              className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
              onClick={() => navigate("/")}
              aria-label="Brainstorm home"
              data-testid="button-app-brand"
            >
              <Wordmark height={26} className="shrink-0 dark:hidden" />
              <Wordmark height={26} variant="white" className="hidden shrink-0 dark:block" />
            </button>
          </div>

          <div className="flex justify-center min-w-0">
            <FinishSetupBanner />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 justify-self-end">
            {actions && <div className="hidden lg:flex items-center mr-1">{actions}</div>}
            {isAdmin && <AdminBadge />}
            <AccountMenu user={user} onLogout={onLogout} active={active} />
          </div>
        </div>
      </div>
    </nav>
  );
}
