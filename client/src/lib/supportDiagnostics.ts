import { recentErrors } from "./errorBuffer";

/** Must match the footer's version badge — one release string, two readers. */
const APP_VERSION = "v0.1.0-alpha";

/**
 * The diagnostics snapshot a ticket can carry: everything support would ask
 * for in the first reply — environment, page, screen, and what the console
 * said — collected client-side as plain text. No file uploads, no server
 * storage; the transparency disclosure in the composer shows EXACTLY this.
 * Keys are display labels on purpose: what you read is what support reads.
 */
export function collectDiagnostics(): Record<string, string> {
  const d: Record<string, string> = {
    App: APP_VERSION,
    Browser: navigator.userAgent,
    Language: navigator.language,
    Page: window.location.pathname + window.location.search,
    Screen: `${window.screen.width}×${window.screen.height} (viewport ${window.innerWidth}×${window.innerHeight})`,
    Online: navigator.onLine ? "yes" : "no",
    Time: `${new Date().toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown tz"})`,
  };
  const errors = recentErrors();
  if (errors.length > 0) d["Recent errors"] = errors.join("\n");
  return d;
}
