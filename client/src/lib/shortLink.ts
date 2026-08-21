/**
 * Short share links: a code standing in for a pubkey plus its relay hints,
 * turning a 63-character npub URL into `/s/AB3XK9QZ`.
 *
 * Nothing here assumes a code length — the server may lengthen codes later and
 * links already in the wild must keep resolving.
 */

/** Where a code lives in the app. */
export function shortLinkPath(code: string): string {
  return `/s/${code}`;
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
