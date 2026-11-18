import { KNOWN_RETIRED } from "@/config/retired";
import type { RetiredStatus } from "@/lib/retired";

/**
 * Which accounts are Retired, for every surface that shows a person.
 *
 * Answered from the list we hold (config/retired): the server keeps no such
 * record yet. Both questions are synchronous for that reason; when the server
 * answers them, they move behind the same batched lookup services/compromised
 * uses, and the hooks (hooks/useRetired) keep their shape.
 */
const byRetired = new Map(KNOWN_RETIRED.map((s) => [s.pubkey, s]));
const byCurrent = new Map(KNOWN_RETIRED.map((s) => [s.currentPubkey, s]));

/** This account's record when it is Retired, else null. */
export function retiredStatus(pubkey: string | null | undefined): RetiredStatus | null {
  return (pubkey && byRetired.get(pubkey.toLowerCase())) || null;
}

/**
 * Whose invitation a profile's "Join free" offers: the profile's own account,
 * or its owner's Current one when it is Retired. Joining connects the newcomer
 * to the inviter, and nobody should start out connected to an unused account.
 */
export function inviteThrough(pubkey: string): string {
  return retiredStatus(pubkey)?.currentPubkey ?? pubkey;
}

/** The account this one's owner retired, when `pubkey` is their Current account. */
export function retiredBy(pubkey: string | null | undefined): RetiredStatus | null {
  return (pubkey && byCurrent.get(pubkey.toLowerCase())) || null;
}
