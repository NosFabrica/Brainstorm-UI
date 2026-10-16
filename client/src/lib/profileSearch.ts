import { nip19 } from "nostr-tools";
import type { ConnectionSpeed } from "@/lib/connection";

export interface SearchResult {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  website?: string;
  lud16?: string;
  banner?: string;
  createdAt?: number;
  /** Effective rank for the currently-selected POV (back-compat). */
  wotRank?: number | null;
  wotFollowers?: number | null;
  /** NosFabrica ("house") perspective rank, 0..1, when the hit includes it. */
  wotRankNosfabrica?: number | null;
  /** Logged-in user's ("mywot") perspective rank, 0..1, when present. */
  wotRankMywot?: number | null;
  /** NIP-24: the profile declares itself automated. */
  bot?: boolean;
}

export function getDisplayLabel(result: SearchResult): string {
  return result.displayName || result.name || result.npub.slice(0, 12) + "...";
}

/** How long typing must pause before a search box asks for suggestions. */
const TYPEAHEAD_PAUSE_MS = 350;
const TYPEAHEAD_PAUSE_SLOW_MS = 700;

/** The pause this connection deserves — a poor one asks once the typing really stops. */
export function typeaheadPause(speed: ConnectionSpeed): number {
  return speed === "normal" ? TYPEAHEAD_PAUSE_MS : TYPEAHEAD_PAUSE_SLOW_MS;
}

export const isLikelyNpub = (value: string) => /^npub1[02-9ac-hj-np-z]{20,}$/i.test(value.trim());

export const isHexPubkey = (value: string) => /^[0-9a-f]{64}$/i.test(value.trim());

export const isNip05Handle = (value: string) => {
  const v = value.trim();
  if (v.includes("@")) {
    const parts = v.split("@");
    return parts.length === 2 && parts[0].length > 0 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(parts[1]);
  }
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
};

/** The profile fields a relay's kind-0 content carries, as far as a people row needs them. */
export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string; about?: string };

/** A person for a people row from their kind-0 profile — or from nothing, when they have none. */
export function profileToSearchResult(pubkey: string, profile: ProfileLite | undefined): SearchResult {
  return {
    pubkey,
    npub: nip19.npubEncode(pubkey),
    name: profile?.name,
    displayName: profile?.display_name,
    picture: profile?.picture,
    nip05: profile?.nip05,
    about: profile?.about,
  };
}
