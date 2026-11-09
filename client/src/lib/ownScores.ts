/**
 * "This Account's own scores exist" — the breadcrumb that gates its personal
 * perspective. Kept per Account: a global flag carried one Account's scores
 * onto the next one signed in on the same browser, showing an empty
 * perspective as if it were theirs. Sign-out clears it with the Account's other
 * session rows (`accountStorage`).
 */
import { accountKey } from "@/lib/accountStorage";

export function hasOwnScores(pubkey: string | null | undefined): boolean {
  if (!pubkey) return false;
  try {
    return localStorage.getItem(accountKey("brainstorm_calc_completed", pubkey)) === "true";
  } catch {
    return false;
  }
}

export function markOwnScores(pubkey: string | null | undefined): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(accountKey("brainstorm_calc_completed", pubkey), "true");
  } catch {
    /* private browsing */
  }
}
