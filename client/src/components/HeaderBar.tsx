import { type ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Search } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";
import { openMobileSearch } from "@/components/MobileSearchOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

/** Tailwind's `sm` — below it the box is the magnifier, and the sheet does the searching. */
const SM = 640;

/**
 * The bar every page's header is built on — PublicPageHeader (the public pages) and
 * AppHeader (the signed-in app) are this, with their own right-hand cluster. One shell so
 * the two can't drift: transparent at the top and frosted once the page scrolls under it,
 * an optional Back arrow, the B mark, the shared search box, and on a phone a magnifier
 * that opens the search sheet over the page.
 *
 * The box is MOUNTED only from `sm` up, not hidden: it runs the whole typeahead's hooks,
 * and a phone never shows it.
 */
export function HeaderBar({
  maxWidthClass = "max-w-4xl",
  search = true,
  fullBleed = false,
  back,
  children,
  testId,
}: {
  maxWidthClass?: string;
  /** False on a page whose own content is a search box, or a flow a search would abandon. */
  search?: boolean;
  /**
   * For a full-screen app view (Messages): edge to edge and a solid surface,
   * so the bar lines up with the panes under it and reads as their frame.
   */
  fullBleed?: boolean;
  /** A way back up — the /p sub-pages' "Back to <name>". */
  back?: { label: string; onClick: () => void };
  /** The right-hand cluster. */
  children?: ReactNode;
  testId?: string;
}) {
  const isPhone = useIsMobile(SM);

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
        fullBleed
          ? "border-b border-border bg-card"
          : scrolled
            ? "border-b border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/80 dark:shadow-none"
            : "border-b border-transparent bg-transparent"
      }`}
      data-testid={testId}
    >
      <div
        className={
          // Full bleed, the search box sits in the middle of the window — as wide
          // a gap on either side whatever the right-hand cluster holds.
          fullBleed
            ? "grid min-h-14 grid-cols-[1fr_minmax(0,42rem)_1fr] items-center gap-3 px-4"
            : `${maxWidthClass} mx-auto flex min-h-14 items-center gap-3 px-4 sm:px-6`
        }
      >
        <div className="flex shrink-0 items-center gap-3">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label}
              title={back.label}
              className="-ml-2 shrink-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              data-testid="header-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Link
            href="/"
            className="flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
            aria-label="Brainstorm home"
            data-testid="header-brand"
          >
            {/* Gradient mark on light, white on dark. */}
            <BrainLogo size={26} className="dark:hidden" />
            <BrainLogo size={26} mono className="hidden text-white dark:block" />
          </Link>
        </div>

        {search && !isPhone ? <HeaderSearchBox className="min-w-0 max-w-2xl flex-1" /> : fullBleed && <div />}

        <div className="ml-auto flex shrink-0 items-center gap-2 justify-self-end sm:gap-3">
          {/* Opens search OVER the page — search is a lookup, not a destination. */}
          {search && isPhone && (
            <button
              type="button"
              onClick={openMobileSearch}
              aria-label="Search Brainstorm"
              title="Search Brainstorm"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-deep dark:text-slate-400 dark:hover:bg-slate-800"
              data-testid="header-search-mobile"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
