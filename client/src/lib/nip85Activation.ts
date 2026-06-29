// Per-account record that the user has a published kind-10040 (NIP-85) declaring
// Brainstorm as their Web-of-Trust provider. Keyed per pubkey so one account's
// activation can't bleed onto a different account on the same browser. We treat
// "we published it" (or a relay confirmed it) as the source of truth and never
// downgrade on a transient relay miss — relays are eventually-consistent, so an
// absence is not a deactivation.

const key = (pubkey: string) => `brainstorm_nip85_activated:${pubkey}`;

export function isNip85Activated(pubkey?: string | null): boolean {
  if (!pubkey) return false;
  try {
    return localStorage.getItem(key(pubkey)) === "true";
  } catch {
    return false;
  }
}

export function markNip85Activated(pubkey?: string | null): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(key(pubkey), "true");
  } catch {
    /* ignore */
  }
}

export function clearNip85Activated(pubkey?: string | null): void {
  if (!pubkey) return;
  try {
    localStorage.removeItem(key(pubkey));
  } catch {
    /* ignore */
  }
}
