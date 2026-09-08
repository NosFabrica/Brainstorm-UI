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

/** A bare nprofile carrying up to four of the person's relays — the form a
 *  power user copies to hand another client both the key and where the
 *  events live. "" when the key does not encode. */
export function nprofileFor(pubkey: string, relays: string[] = []): string {
  try {
    return nip19.nprofileEncode({ pubkey, relays: relays.slice(0, 4) });
  } catch {
    return "";
  }
}

/**
 * A `nostr:` URI (NIP-21) for an EVENT — used by the event page's "open in your
 * Nostr app". Encodes an `nevent` (id + relay hints + author) so the note is
 * findable even if a given relay doesn't have it. Returns "" if encoding fails.
 */
export function nostrUriForEvent(id: string, relays: string[] = [], author?: string): string {
  try {
    return `nostr:${nip19.neventEncode({ id, relays: relays.slice(0, 4), author })}`;
  } catch {
    return "";
  }
}

/** Bare `nevent` for an event id (carries author + relay hints), for clean /e links. */
export function neventFor(id: string, relays: string[] = [], author?: string): string {
  try {
    return nip19.neventEncode({ id, relays: relays.slice(0, 4), author });
  } catch {
    return id;
  }
}

/** Addressable kinds that read on the article reader: long-form (NIP-23)
 *  and wiki pages (NIP-54). Opened as a bare event they rendered as a note,
 *  markup and all. */
const READER_KINDS = new Set([30023, 30818]);

/** On-site path for an event: `/a/<naddr>` for an article or wiki page we
 *  know by kind and name, else `/e/<nevent>` (falls back to the bare id). */
export function eventPath(event: { id: string; pubkey?: string; kind?: number; tags?: string[][] }, relays: string[] = []): string {
  if (event.kind !== undefined && READER_KINDS.has(event.kind) && event.pubkey && event.tags) {
    const identifier = event.tags.find((t) => t[0] === "d")?.[1];
    if (identifier !== undefined) {
      try {
        return `/a/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier, relays: relays.slice(0, 4) })}`;
      } catch {
        /* fall through to the event link */
      }
    }
  }
  return `/e/${neventFor(event.id, relays, event.pubkey)}`;
}
