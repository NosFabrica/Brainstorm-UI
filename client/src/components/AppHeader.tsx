import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { openMobileMenu } from "@/lib/mobileMenuStore";
import { AdminBadge } from "@/components/AdminBadge";
import { AppsLauncher, type AppKey } from "@/components/AppsLauncher";
import { AccountMenu } from "@/components/AccountMenu";
import { isAdminPubkey } from "@/config/adminAccess";
import { type NostrUser } from "@/services/nostr";
import { type ReactNode } from "react";

interface AppHeaderProps {
  user: NostrUser;
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
 * apps launcher holds the product family. Mobile uses the hamburger →
 * MobileMenu.
 */
export function AppHeader({ user, onLogout, calcDone = false, active, actions }: AppHeaderProps) {
  const [, navigate] = useLocation();
  const isAdmin = isAdminPubkey(user?.pubkey);

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md" data-testid="nav-app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={openMobileMenu}
                className="text-slate-500 dark:text-slate-300 no-default-hover-elevate no-default-active-elevate hover:text-brand-deep dark:hover:text-white hover:bg-slate-900/5 dark:hover:bg-white/10"
                data-testid="button-open-mobile-menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            {/* Brand lockup: B mark + wordmark. App-chrome pages (dashboard,
                network, settings, FAQ, admin, /profile) have no header search
                bar, so there's room to anchor the page with the full name. The
                search-bar headers (home, /p share pages) keep the B mark only. */}
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
              onClick={() => navigate("/")}
              aria-label="Brainstorm home"
              data-testid="button-app-brand"
            >
              <BrainLogo size={28} className="shrink-0" />
              <span
                className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900 dark:text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Brainstorm
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {actions && <div className="hidden lg:flex items-center mr-1">{actions}</div>}
            {isAdmin && <AdminBadge />}
            <div className="hidden lg:flex items-center">
              <AppsLauncher user={user} calcDone={calcDone} active={active} variant="light" />
            </div>
            <AccountMenu user={user} onLogout={onLogout} active={active} />
          </div>
        </div>
      </div>
    </nav>
  );
}
