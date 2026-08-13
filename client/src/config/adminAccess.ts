import { accountFor } from "@/accounts/login";
import { isAdmin } from "@/accounts/session";

/**
 * Whether this pubkey is an admin *on this device, right now*.
 *
 * The claim rides on the Account's Session — minted with the token and gone with
 * it — so this answers only for an identity this browser holds. It is not a
 * lookup: an unknown pubkey, or one whose Session has lapsed, is not an admin,
 * which is the safe direction for a gate.
 *
 * Ported from the v1 version, which read `getCurrentUser()` and fell back to
 * decoding the session token out of a global localStorage row. Both are gone —
 * the token lives on the Account now, and `isAdmin` reads the flag it was minted
 * with.
 */
export function isAdminPubkey(pubkey: string | undefined | null): boolean {
  if (!pubkey) return false;
  const account = accountFor(pubkey);
  return !!account && isAdmin(account);
}
