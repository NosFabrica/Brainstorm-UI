import { type ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { openMobileSearch } from "@/components/MobileSearchOverlay";
import { Search } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";
import { AccountMenu } from "@/components/AccountMenu";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
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
  const user = useActiveAccountDisplay();
  const calcDone = (() => {
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  })();
  const handleLogout = () => logout();

  // Frost-on-scroll: transparent at the very top so the bar blends with the
  // hero/banner, then a clean frosted surface + hairline + soft shadow once the
  // page scrolls — so content never bleeds under a borderless bar.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled
          ? "border-b border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-sm dark:shadow-none"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className={`${maxWidthClass} mx-auto flex h-14 items-center gap-3 px-4 sm:px-6`}>
        <Link href="/" className="flex shrink-0 items-center" aria-label="Brainstorm home" data-testid="public-brand">
          {/* White B mark on the dark header; the gradient reads better on the
              light (frosted white) header, so keep it in light mode. */}
          <BrainLogo size={26} className="dark:hidden" />
          <BrainLogo size={26} mono className="hidden text-white dark:block" />
        </Link>

        <HeaderSearchBox className="hidden max-w-md flex-1 sm:block" />

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Opens search OVER the page. This was a <Link href="/">, which navigated
              away and cost the user the thread/profile they were reading — search is
              a lookup, not a destination. */}
          <button
            type="button"
            onClick={openMobileSearch}
            aria-label="Search"
            className="rounded-full p-2 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-deep sm:hidden"
            data-testid="public-search-mobile"
          >
            <Search className="h-5 w-5" />
          </button>
          {actions}
          {user && <AccountMenu user={user} onLogout={handleLogout} />}
        </div>
      </div>
    </header>
  );
}
