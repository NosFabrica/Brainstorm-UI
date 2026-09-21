import type { TrustedListRunData } from "@/services/api";

/**
 * The last run per observer, kept in this browser until the server keeps runs
 * itself (docs/trusted-lists/ADMIN-ASKS.md, ask 1). Storage can be missing or
 * throw (private windows, blocked site data), so every touch is guarded and a
 * miss just means "no run remembered".
 */
const KEY = "bs.admin.trustedLists.lastRuns";

export interface RememberedRun {
  run: TrustedListRunData;
  /** ISO time the run finished on this device. */
  at: string;
}

function readAll(): Record<string, RememberedRun> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, RememberedRun>) : {};
  } catch {
    return {};
  }
}

export function rememberRun(run: TrustedListRunData, at: Date = new Date()): void {
  try {
    const all = readAll();
    all[run.observer] = { run, at: at.toISOString() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Nowhere to keep it: the run still shows until the page goes.
  }
}

export function lastRunFor(observer: string): RememberedRun | null {
  const entry = readAll()[observer];
  return entry && entry.run && Array.isArray(entry.run.tags) && typeof entry.at === "string" ? entry : null;
}
