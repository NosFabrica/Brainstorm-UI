import type { RetiredStatus } from "@/lib/retired";
import { retiredBy, retiredStatus } from "@/services/retired";

/**
 * Whether this account is Retired: its record, or null for anyone else.
 * Answers on first render: the record is held here for now (services/retired).
 */
export function useRetired(pubkey: string | null | undefined): RetiredStatus | null {
  return retiredStatus(pubkey);
}

/** The account this one's owner retired, when it is their Current account. */
export function useRetiredBy(pubkey: string | null | undefined): RetiredStatus | null {
  return retiredBy(pubkey);
}
