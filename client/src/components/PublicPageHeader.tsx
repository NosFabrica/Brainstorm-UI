import { type ReactNode } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";
import { AppsLauncher } from "@/components/AppsLauncher";
import { AccountMenu } from "@/components/AccountMenu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout } from "@/services/nostr";

/**
 * Shared header for the public / shared-link pages (/p, /e, /a, /t). Uniform
 * with the app + home headers: transparent (frosted-on-scroll), just the B mark
 * on the left, a live search typeahead in the middle, and — when signed in —
 * the apps launcher + account menu on the right (so the logged-in user gets the
 * same avatar + waffle on every page). Signed out, only the page `actions` show.
 */
export function PublicPageHeader({
  actions,
  maxWidthClass = "max-w-4xl",
}: {
  actions?: ReactNode;
  maxWidthClass?: string;
}) {
  const [user, setUser] = useCurrentUser();
  const calcDone = (() => {
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  })();
  const handleLogout = () => { logout(); setUser(null); };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md">
      <div className={`${maxWidthClass} mx-auto flex h-14 items-center gap-3 px-4 sm:px-6`}>
        <Link href="/" className="flex shrink-0 items-center" aria-label="Brainstorm home" data-testid="public-brand">
          <BrainLogo size={26} />
        </Link>

        <HeaderSearchBox className="hidden max-w-md flex-1 sm:block" />

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/"
            aria-label="Search"
            className="rounded-full p-2 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-deep sm:hidden"
            data-testid="public-search-mobile"
          >
            <Search className="h-5 w-5" />
          </Link>
          {actions}
          {user && (
            <>
              <div className="hidden sm:flex items-center">
                <AppsLauncher user={user} calcDone={calcDone} variant="light" />
              </div>
              <AccountMenu user={user} onLogout={handleLogout} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
