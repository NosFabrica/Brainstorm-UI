import { nip19 } from "nostr-tools";

/**
 * "Paste anything" resolver — the njump front door. Given a raw string (a bech32
 * entity, a `nostr:` URI, a bare hex pubkey, or even a URL that embeds an entity
 * like `https://njump.me/nevent1…`), figure out which on-site landing page should
 * render it: a profile (`/p`), a note/event (`/e`), or a long-form article (`/a`).
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
    if (d.type === "naddr") return { path: `/a/${ent}`, kind: "article" };
  } catch {
    /* not a valid entity */
  }
  return null;
}
