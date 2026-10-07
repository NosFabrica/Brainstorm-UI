/**
 * Which built files the service worker keeps, read off the build's own chunk
 * graph (the `service-worker` plugin in vite.config.ts hands it the bundle).
 * Build-time only; the worker gets the answer as two lists of file names.
 */

/** The parts of a Rollup output file this reads. */
export interface BuiltFile {
  type: "chunk" | "asset";
  fileName: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  viteMetadata?: { importedCss?: Set<string> };
}

/**
 * The screens an installed app lives on. Their chunks are fetched ahead only
 * when the page asks (lib/serviceWorker does, in an installed app): a one-off
 * visitor in a browser tab shouldn't download screens they never open.
 */
export const APP_SCREENS = [
  "DashboardPage",
  "MessagesPage",
  "NetworkPage",
  "ProfilePage",
  "EventPage",
  "SettingsPage",
  "AlertsPage",
  "ReadingPage",
  "LoginPage",
  "ConnectionListPage",
];

/**
 * Fonts belong in the shell, or an offline launch draws in the fallback face —
 * the Latin subset of each, which is what the app's own words need. The other
 * subsets (Cyrillic, Greek, Vietnamese, Latin Extended) load when a page shows
 * text in them, and are kept from then on (sw.ts caches every hashed asset).
 */
const SHELL_FONT = /-latin-(?!ext-)[^/]*\.woff2$/i;

/** A chunk and everything it statically imports, with the CSS and fonts they pull in. */
function closure(bundle: Record<string, BuiltFile>, start: string, into: Set<string>): void {
  const file = bundle[start];
  if (!file || into.has(start)) return;
  into.add(start);
  for (const css of file.viteMetadata?.importedCss ?? []) into.add(css);
  for (const imported of file.imports ?? []) closure(bundle, imported, into);
}

/** The shell, and the main screens on top of it (each list without the other's files). */
export function precacheLists(
  bundle: Record<string, BuiltFile>,
  screens: string[] = APP_SCREENS,
): { entry: string; shell: string[]; routes: string[]; missing: string[] } {
  const shell = new Set<string>();
  const entries = Object.values(bundle).filter((file) => file.type === "chunk" && file.isEntry);
  if (entries.length !== 1) throw new Error(`sw: expected one entry chunk, found ${entries.length}`);
  closure(bundle, entries[0].fileName, shell);
  // Fonts the CSS points at are assets of the CSS, not of a chunk.
  for (const file of Object.values(bundle))
    if (file.type === "asset" && SHELL_FONT.test(file.fileName)) shell.add(file.fileName);

  const routes = new Set<string>();
  const found = new Set<string>();
  for (const file of Object.values(bundle)) {
    if (file.type !== "chunk" || !file.isDynamicEntry || !file.facadeModuleId) continue;
    const name = file.facadeModuleId.replace(/^.*\//, "").replace(/\.[jt]sx?$/, "");
    if (!screens.includes(name)) continue;
    found.add(name);
    closure(bundle, file.fileName, routes);
  }
  for (const file of shell) routes.delete(file);
  return {
    entry: entries[0].fileName,
    shell: [...shell].sort(),
    routes: [...routes].sort(),
    missing: screens.filter((name) => !found.has(name)),
  };
}
