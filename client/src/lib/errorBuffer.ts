/**
 * A tiny ring buffer of the page's recent errors, so a support ticket's
 * diagnostics can carry "what the console said" without asking the user to
 * open devtools. Captures window `error` and `unhandledrejection`; keeps the
 * newest few, truncated — this is a hint for support, not a logging system.
 */

const MAX_ERRORS = 10;
const MAX_LENGTH = 300;

let buffer: string[] = [];
let installed = false;

function push(entry: string): void {
  buffer.push(entry.slice(0, MAX_LENGTH));
  if (buffer.length > MAX_ERRORS) buffer = buffer.slice(-MAX_ERRORS);
}

export function installErrorBuffer(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => {
    push(`${new Date().toISOString()} error: ${e.message || String(e.error) || "unknown"}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    push(`${new Date().toISOString()} unhandledrejection: ${reason}`);
  });
}

export function recentErrors(): string[] {
  return [...buffer];
}

/** Test-only: fresh buffer. Listeners stay — they're per-window, like prod. */
export function _resetErrorBuffer(): void {
  buffer = [];
}
