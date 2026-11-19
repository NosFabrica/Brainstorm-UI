/**
 * The three page widths. Every page's content sits in one of them — centered,
 * with one gutter — so on a wide screen neighbouring pages line up. A page
 * never writes its own `mx-auto max-w-… px-4 sm:px-6` (pageWidth.guard.test).
 *
 *   wide      1280px  the footer, and the pages built of panels (dashboard,
 *                     settings, admin)
 *   standard  1024px  every page someone browses: profiles, tags, lists of
 *                     people, alerts, the network, the info pages
 *   reading    672px  reading one thing (a post, an article) or doing one task
 *                     (setup, the first run)
 *
 * The header is none of them: it runs edge to edge on every page (HeaderBar),
 * pinned to the window so it never moves with the page under it.
 *
 * Which page gets which is pinned in pageWidth.guard.test, so moving between
 * pages nothing shifts that doesn't have to: a new page is `standard` unless it
 * is added there on purpose.
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
