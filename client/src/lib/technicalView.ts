/**
 * Technical view: the reveals a power user turns on, on this device — kind
 * labels and numbers on every card, which relay served an event, the query
 * as it went to the relay, an event's ids on its page. Off by default, and
 * off means nothing shows: the app feels exactly as it does for everyone
 * else (Benjamin, 2026-09-24). Only a signed-in reader sees it even when
 * the device holds the flag — a shared machine signed out shows nothing.
 *
 * Plain reads, no React context: a pill renders inside cards on every
 * surface, and the accounts hooks need a provider. The active account's id
 * is what the accounts module keeps on the device (accounts/persist).
 */
const KEY = "brainstorm_technical_view";
/** The accounts module's own row: present while someone is signed in. */
const ACTIVE_ACCOUNT_KEY = "brainstorm_active_account";

/** The device's flag alone — `technicalView()` adds "and signed in". */
export function technicalViewOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setTechnicalView(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private window, full quota — the default stands */
  }
}

/** Whether this render shows the technical view: the flag, and a signed-in reader. */
export function technicalView(): boolean {
  if (!technicalViewOn()) return false;
  try {
    return !!localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return false;
  }
}
