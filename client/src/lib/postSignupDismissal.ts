import { useSyncExternalStore } from "react";
import { accountKey, type AccountNamespace } from "@/lib/accountStorage";

/**
 * Whether a home-page nudge card has been put away, for the Account it names.
 *
 * A store rather than a `useState` inside the card: the recurring reminder waits
 * behind that card and is its *sibling*, so it can't hear component state —
 * dismissing the card would leave the strip empty until something unrelated
 * re-rendered. Read live, too, because the Account arrives after the first
 * render and a value snapshotted before it lands answers for nobody.
 *
 * One store per flag, not one flag for every card: the setup checklist and the
 * activation nudge answer different questions ("stop showing me setup tasks" vs
 * "stop asking me to activate"), and a user who put the first away months ago
 * must still see the second once it becomes relevant.
 */

function createDismissalStore(flagName: AccountNamespace) {
  /** Dismissed in this tab, for the case where the write below can't happen. */
  const dismissedHere = new Set<string>();
  const listeners = new Set<() => void>();

  const flagFor = (pubkey: string) => accountKey(flagName, pubkey);

  function isDismissed(pubkey?: string): boolean {
    if (!pubkey) return false;
    if (dismissedHere.has(pubkey)) return true;
    try {
      return localStorage.getItem(flagFor(pubkey)) === "true";
    } catch {
      return false;
    }
  }

  function dismiss(pubkey?: string): void {
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

  function useDismissed(pubkey?: string): boolean {
    return useSyncExternalStore(
      subscribe,
      () => isDismissed(pubkey),
      () => false,
    );
  }

  return { isDismissed, dismiss, useDismissed };
}

const postSignup = createDismissalStore("brainstorm_postsignup_dismissed");
export const isPostSignupDismissed = postSignup.isDismissed;
export const dismissPostSignup = postSignup.dismiss;
export const usePostSignupDismissed = postSignup.useDismissed;

const activateNudge = createDismissalStore("brainstorm_activate_nudge_dismissed");
export const dismissActivateNudge = activateNudge.dismiss;
export const useActivateNudgeDismissed = activateNudge.useDismissed;
