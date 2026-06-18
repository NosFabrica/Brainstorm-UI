import { nip19 } from "nostr-tools";

/**
 * A profile identifier resolved from a share URL (`/p/:id`). `pubkey` is hex;
 * `relays` are optional relay hints carried by an `nprofile` (used to fetch the
 * kind-0 + content for profiles not yet indexed by Brainstorm).
 */
export interface DecodedShareId {
  pubkey: string;
  relays: string[];
}

/**
 * Decode a share identifier into a hex pubkey (+ optional relay hints).
 * Accepts: hex pubkey, `npub1…`, and `nprofile1…` (which bundles relay hints).
 * `nip05` (user@domain) is detected via {@link isNip05} but resolved separately.
 * Returns null for anything it can't decode.
 */
export function decodeShareId(raw: string): DecodedShareId | null {
  const id = (raw || "").trim();
  if (!id) return null;

  // Bare hex pubkey.
  if (/^[0-9a-f]{64}$/i.test(id)) {
    return { pubkey: id.toLowerCase(), relays: [] };
  }

  try {
    if (/^npub1[02-9ac-hj-np-z]+$/i.test(id)) {
      const decoded = nip19.decode(id);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return { pubkey: decoded.data, relays: [] };
      }
    } else if (/^nprofile1[02-9ac-hj-np-z]+$/i.test(id)) {
      const decoded = nip19.decode(id);
      if (decoded.type === "nprofile") {
        const data = decoded.data as { pubkey: string; relays?: string[] };
        if (data?.pubkey) {
          return { pubkey: data.pubkey, relays: Array.isArray(data.relays) ? data.relays : [] };
        }
      }
    }
  } catch {
    // fall through to null
  }

  return null;
}

/** True when the identifier looks like a NIP-05 address (user@domain). */
export function isNip05(raw: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((raw || "").trim());
}

/** Encode a hex pubkey to npub (for canonical share URLs / display). */
export function npubFromPubkey(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

/**
 * A `nostr:` URI (NIP-21) for "open in your Nostr app". Uses `nprofile` (with
 * relay hints) when hints are available so an un-indexed profile is findable,
 * otherwise a bare `npub`. Returns "" if encoding fails.
 */
export function nostrUriFor(pubkey: string, relays: string[] = []): string {
  try {
    if (relays.length) return `nostr:${nip19.nprofileEncode({ pubkey, relays: relays.slice(0, 4) })}`;
    return `nostr:${nip19.npubEncode(pubkey)}`;
  } catch {
    return "";
  }
}
