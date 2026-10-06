/**
 * The `theme-color` meta: the status bar of an installed iPhone app, Safari's
 * toolbar, and Android's title bar and task switcher all take it. A fixed brand
 * colour there ran as a dark band over the light app, so it follows the page's
 * own background instead.
 *
 * index.html sets the first frame's (light, or dark under the no-flash theme
 * script); lib/theme calls this on every theme change after that. A page that
 * paints its own background (the search home) sets the meta itself while it is
 * mounted and calls this on the way out.
 */
export function syncThemeColor(): void {
  if (typeof document === "undefined" || !document.body) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const color = getComputedStyle(document.body).backgroundColor;
  // A body without a background of its own (transparent) says nothing about the page.
  if (!color || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color)) return;
  meta.content = color;
}
