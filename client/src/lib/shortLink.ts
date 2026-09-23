/**
 * Short share links: a code standing in for a pubkey plus its relay hints,
 * turning a 63-character npub URL into `/s/AB3XK9QZ`.
 *
 * Nothing here assumes a code length — the server may lengthen codes later and
 * links already in the wild must keep resolving.
 */

/** The one place the `/s/` shape is written down. */
const PREFIX = "/s/";

/** Where a code lives in the app. */
export function shortLinkPath(code: string): string {
  return `${PREFIX}${code}`;
}

/** The absolute link to hand someone. */
export function shortLinkUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}${shortLinkPath(code)}`;
}

/**
 * The server stores at most this many relay hints (`CreateShortUrlBody`).
 * Sending more is a 422, so trim before asking rather than after failing.
 */
export const MAX_SHARE_RELAYS = 7;

/** The route pattern App registers, so the shape is defined once. */
export const SHORT_LINK_ROUTE = `${PREFIX}:code`;

/** True only for a link this app minted. */
function isShortLink(pathname: string): boolean {
  return new RegExp(`^${PREFIX}[^/]+/?$`, "i").test(pathname);
}

/**
 * What to encode in a QR — deliberately not what the user sees or copies.
 *
 * QR's alphanumeric mode costs 5.5 bits per character instead of 8, but the
 * encoder picks one mode for the whole string, so a single lowercase character
 * costs the entire saving. Uppercasing takes the symbol from 29×29 modules to
 * 25×25 (pinned in `shortLink.qr.test.tsx`).
 *
 * Safe because scheme and host are case-insensitive by spec and the server
 * folds code case. Applied only to our own short links: a canonical
 * `/p/<npub>` is bech32 and not ours to re-case, and a query or fragment would
 * be case-sensitive.
 */
export function qrPayload(url: string): string {
  try {
    const parsed = new URL(url);
    if (!isShortLink(parsed.pathname) || parsed.search || parsed.hash) return url;
    return url.toUpperCase();
  } catch {
    return url;
  }
}
