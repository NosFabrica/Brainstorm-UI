import { useSyncExternalStore } from "react";

/**
 * Whether the post-signup card has been put away, for the Account it names.
 *
 * A store rather than a `useState` inside the card: the recurring reminder waits
 * behind that card and is its *sibling*, so it can't hear component state —
 * dismissing the card would leave the strip empty until something unrelated
 * re-rendered. Read live, too, because the Account arrives after the first
 * render and a value snapshotted before it lands answers for nobody.
 */

/** Dismissed in this tab, for the case where the write below can't happen. */
const dismissedHere = new Set<string>();
const listeners = new Set<() => void>();

const flagFor = (pubkey: string) => `brainstorm_postsignup_dismissed:${pubkey}`;

export function isPostSignupDismissed(pubkey?: string): boolean {
  if (!pubkey) return false;
  if (dismissedHere.has(pubkey)) return true;
  try {
    return localStorage.getItem(flagFor(pubkey)) === "true";
  } catch {
    return false;
  }
}

export function dismissPostSignup(pubkey?: string): void {
  if (!pubkey) return;
  dismissedHere.add(pubkey);
  try {
    localStorage.setItem(flagFor(pubkey), "true");
  } catch {
    /* private browsing — it stays dismissed for this tab either way */
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function usePostSignupDismissed(pubkey?: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isPostSignupDismissed(pubkey),
    () => false,
  );
}
