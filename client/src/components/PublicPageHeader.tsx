import { type ReactNode } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";

/**
 * Shared sticky header for the public / shared-link pages (/p, /e, /a, /t).
 *
 * Layout mirrors Google/LinkedIn: wordmark (left) → search (left-center,
 * flex-grow with a max-width cap) → page-specific `actions` (right). On desktop
 * the search is a live typeahead (HeaderSearchBox) — pick a suggestion to jump
 * to a profile, or submit free text to the home results surface (`/?q=`; landing
 * hydrates from it). On mobile the field collapses to a magnifier that jumps to
 * the home search (full box + typeahead + keyboard), so the tight headers stay
 * clean.
 */
export function PublicPageHeader({
  actions,
  maxWidthClass = "max-w-4xl",
}: {
  actions?: ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
      <div className={`${maxWidthClass} mx-auto flex h-14 items-center gap-3 px-4 sm:px-6`}>
        <Link href="/" className="flex shrink-0 items-center gap-2" data-testid="public-brand">
          <BrainLogo size={26} className="text-indigo-500" />
          <span className="hidden font-brand text-lg font-bold tracking-tight text-indigo-500 sm:inline">Brainstorm</span>
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
        </div>
      </div>
    </header>
  );
}
