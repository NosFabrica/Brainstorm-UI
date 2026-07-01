import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Search } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";

/**
 * Shared sticky header for the public / shared-link pages (/p, /e, /a, /t).
 *
 * Layout mirrors Google/LinkedIn: wordmark (left) → search (left-center,
 * flex-grow with a max-width cap) → page-specific `actions` (right). The search
 * box is an *entry point*: submitting routes to the home search (`/?q=…`), which
 * is the single results surface (landing hydrates from `?q=`). On mobile the
 * inline field collapses to a magnifier that jumps to the home search — where
 * the full box + typeahead + keyboard live — so the tight headers stay clean.
 */
export function PublicPageHeader({
  actions,
  maxWidthClass = "max-w-4xl",
}: {
  actions?: ReactNode;
  maxWidthClass?: string;
}) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    navigate(`/?q=${encodeURIComponent(query)}`);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-sm">
      <div className={`${maxWidthClass} mx-auto flex h-14 items-center gap-3 px-4 sm:px-6`}>
        <Link href="/" className="flex shrink-0 items-center gap-2" data-testid="public-brand">
          <BrainLogo size={26} className="text-indigo-500" />
          <span className="hidden font-brand text-lg font-bold tracking-tight text-indigo-500 sm:inline">Brainstorm</span>
        </Link>

        <form onSubmit={onSubmit} role="search" className="hidden max-w-md flex-1 sm:block" data-testid="public-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Brainstorm"
              aria-label="Search Brainstorm"
              className="w-full rounded-full border border-slate-200 bg-white/80 py-2 pl-9 pr-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30"
              data-testid="public-search-input"
            />
          </div>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/"
            aria-label="Search"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#333286] sm:hidden"
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
