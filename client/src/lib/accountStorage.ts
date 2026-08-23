/**
 * Every localStorage row that belongs to one Account, declared in one place.
 *
 * v1 kept a hand-written list of keys inside `logout()`, so every new
 * per-account row needed a logout edit and the list drifted from what the app
 * actually wrote. Here a namespace is declared once and both clears read the
 * same registry.
 *
 * A row belongs to a pubkey when it is `<namespace>:<pubkey>` or sits under
 * `<namespace>:<pubkey>:…` — the two shapes the app writes.
 */

/** How far a row outlives the Session it was written in. */
type Lifetime =
  /** Session-driven view state: signing out is what ends it. */
  | "session"
  /** The Account's own state: it lives as long as the Account is on this device. */
  | "device";

const NAMESPACES = {
  // scoring run markers — they describe a Session's progress, not the identity
  brainstorm_calc_triggered_at: "session",
  brainstorm_calc_pill_dismissed: "session",
  brainstorm_calc_completed: "session",
  brainstorm_calc_active: "session",
  brainstorm_scores_ready_nudge: "session",

  // "at most one automatic scoring kick per account, ever" — a promise about the
  // identity, not the Session. Clearing it on sign-out re-arms the kick, which is
  // the loop `AutoScoreReturning` exists to stop.
  brainstorm_auto_score_kicked: "device",
  brainstorm_known_follows: "device",
  brainstorm_known_followers: "device",
  brainstorm_invite_card_seen: "device",
  brainstorm_score_journal: "device",
  brainstorm_network_alerts_ignored: "device",
  brainstorm_network_alerts_seen: "device",
  brainstorm_network_alerts_acted: "device",
  brainstorm_alert_prefs_dirty: "device",
  brainstorm_alerts_collapsed: "device",
  brainstorm_alerts_clear_dismissed: "device",
  brainstorm_personalization: "device",
  brainstorm_profile_prefs_draft: "device",
  // Both are keyed by pubkey by hand rather than through `accountKey`, which is
  // how they went unregistered — and unregistered means "let this account go for
  // good" left its search history and its filter preset on the device.
  brainstorm_recent_searches: "device",
  brainstorm_trust_preset: "device",
  brainstorm_postsignup_dismissed: "device",
  brainstorm_invite_cta_dismissed: "device",
  brainstorm_activate_seen: "device",
  brainstorm_nip85_dismissed_at: "device",
  brainstorm_nip85_consent: "device",
  brainstorm_assistant: "device",
} as const satisfies Record<string, Lifetime>;

export type AccountNamespace = keyof typeof NAMESPACES;

/** The row this namespace keeps for one Account. */
export function accountKey(namespace: AccountNamespace, pubkey: string): string {
  return `${namespace}:${pubkey}`;
}

function keysFor(pubkey: string, lifetimes: readonly Lifetime[]): string[] {
  const prefixes = (Object.keys(NAMESPACES) as AccountNamespace[])
    .filter((ns) => lifetimes.includes(NAMESPACES[ns]))
    .map((ns) => accountKey(ns, pubkey));
  const found: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (prefixes.some((p) => key === p || key.startsWith(`${p}:`))) found.push(key);
  }
  return found;
}

function clear(pubkey: string, lifetimes: readonly Lifetime[]): void {
  if (!pubkey) return;
  try {
    // collected first: removing mid-iteration reindexes what `key(i)` returns
    for (const key of keysFor(pubkey, lifetimes)) localStorage.removeItem(key);
  } catch {
    /* private browsing, or storage already gone */
  }
}

/**
 * Sign-out: the Account keeps its place on this device, so only the state its
 * Session drove goes. Signing back in starts the scoring markers clean rather
 * than resuming a run that ended with the Session.
 */
export function clearSessionScopedStorage(pubkey: string): void {
  clear(pubkey, ["session"]);
}

/** The Account is leaving this device — everything it kept here goes with it. */
export function clearAccountStorage(pubkey: string): void {
  clear(pubkey, ["session", "device"]);
}
