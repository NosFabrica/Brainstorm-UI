import { Link } from "wouter";
import { Search } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";
import { openMobileSearch } from "@/components/MobileSearchOverlay";
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
 * Single shared top navigation used by every authenticated page. Uniform with the
 * public-page header (PublicPageHeader) and the home results band: a transparent
 * (frosted-on-scroll) bar with the B mark on the left, the search box — the one
 * SearchBox every surface shares — beside it, and the finish-setup nudge, apps
 * launcher + account menu on the right. Primary destinations (Search/Dashboard/
 * Network) live inside the account menu. On a phone the box is a magnifier that
 * opens the search sheet over the page.
 */
export function AppHeader({ user, onLogout, active, actions }: AppHeaderProps) {
  const isAdmin = user.isAdmin;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md" data-testid="nav-app-header">
      <div className="max-w-7xl mx-auto flex min-h-14 items-center gap-3 px-4 sm:px-6 py-2 sm:py-3">
        <Link href="/" className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50" aria-label="Brainstorm home" data-testid="button-app-brand">
          {/* Gradient mark on light, white on dark — the search-bar headers' compact B. */}
          <BrainLogo size={26} className="dark:hidden" />
          <BrainLogo size={26} mono className="hidden text-white dark:block" />
        </Link>

        <HeaderSearchBox className="hidden min-w-0 max-w-2xl flex-1 sm:block" />

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <FinishSetupBanner />
          <button
            type="button"
            onClick={openMobileSearch}
            aria-label="Search"
            className="rounded-full p-2 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-deep sm:hidden"
            data-testid="app-search-mobile"
          >
            <Search className="h-5 w-5" />
          </button>
          {actions && <div className="hidden lg:flex items-center mr-1">{actions}</div>}
          {isAdmin && <AdminBadge />}
          <AccountMenu user={user} onLogout={onLogout} active={active} />
        </div>
      </div>
    </nav>
  );
}
