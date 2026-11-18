import { nip19 } from "nostr-tools";

/**
 * "Paste anything" resolver — the njump front door. Given a raw string (a bech32
 * entity, a `nostr:` URI, a bare hex pubkey, or even a URL that embeds an entity
 * like `https://njump.me/nevent1…`), figure out which on-site landing page should
 * render it: a profile (`/p`), or any event (`/e`: a note, nevent or naddr).
 */

const BECH32_RE = /(?:npub|nprofile|nevent|note|naddr)1[02-9ac-hj-np-z]+/i;

export type ResolvedKind = "profile" | "note" | "article";

/** Pull a usable nostr identifier out of arbitrary pasted text. */
export function extractEntity(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  // Bare hex pubkey (the search box's "Search a public key…" case).
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  // Strip a `nostr:` scheme, then find a bech32 token anywhere — this also
  // unwraps URLs like `njump.me/<entity>` or `…/p/<npub>`.
  const m = s.replace(/^nostr:/i, "").match(BECH32_RE);
  return m ? m[0] : null;
}

/**
 * Resolve pasted input to an on-site path + the entity kind (for labeling).
 * Returns null when the input isn't a recognizable nostr entity (so the caller
 * falls back to keyword search).
 */
export function resolveEntityToPath(input: string): { path: string; kind: ResolvedKind } | null {
  const ent = extractEntity(input);
  if (!ent) return null;
  // Bare hex → treat as a pubkey (profile).
  if (/^[0-9a-f]{64}$/i.test(ent)) return { path: `/p/${ent}`, kind: "profile" };
  try {
    const d = nip19.decode(ent);
    if (d.type === "npub" || d.type === "nprofile") return { path: `/p/${ent}`, kind: "profile" };
    if (d.type === "note" || d.type === "nevent") return { path: `/e/${ent}`, kind: "note" };
    if (d.type === "naddr") return { path: `/e/${ent}`, kind: "article" };
  } catch {
    /* not a valid entity */
  }
  return null;
}

/**
 * `brainstorm.world/<bech32>`, the njump shape: a path segment that is a whole
 * Nostr entity — an `npub`/`nprofile`, or a `note`/`nevent`/`naddr`, with or
 * without a `nostr:` scheme — and where it lives on-site. Strict, unlike
 * `resolveEntityToPath`: `/about` or a word with an npub buried in it is not an
 * entity, and a bare hex id is ambiguous (person or event), so neither resolves.
 */
export function entityPathForSegment(segment: string): string | null {
  let s = segment;
  try {
    s = decodeURIComponent(segment);
  } catch {
    /* keep it as it came */
  }
  s = s.trim().replace(/^(?:web\+)?nostr:/i, "");
  if (!new RegExp(`^${BECH32_RE.source}$`, "i").test(s)) return null;
  // bech32 is one case or the other; the decoder wants it lower.
  return resolveEntityToPath(s.toLowerCase())?.path ?? null;
}
