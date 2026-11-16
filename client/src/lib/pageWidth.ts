/**
 * The three page widths. Every page's content sits in one of them — centered,
 * with one gutter — so on a wide screen neighbouring pages line up. A page
 * never writes its own `mx-auto max-w-… px-4 sm:px-6` (pageWidth.guard.test).
 *
 *   wide      1280px  multi-column app pages (dashboard, settings, admin), the footer
 *   standard  1024px  info pages, profiles, the network
 *   reading    672px  feeds, a single post, a focused task (setup, the first run)
 *
 * A page adds its own vertical rhythm beside it:
 *   <main className={cn(pageWidth("reading"), "flex-1 py-8")}>
 *
 * Long text in a wider page caps its own measure (`max-w-3xl`, left-aligned),
 * so lines stay readable while the page's edges match its neighbours'.
 */
export const PAGE_WIDTHS = {
  wide: "max-w-7xl",
  standard: "max-w-5xl",
  reading: "max-w-2xl",
} as const;

export type PageWidth = keyof typeof PAGE_WIDTHS;

/** The classes of a page's content column: centered, capped, with the gutter. */
export function pageWidth(width: PageWidth): string {
  return `mx-auto w-full ${PAGE_WIDTHS[width]} px-4 sm:px-6`;
}
