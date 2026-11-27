/**
 * Links built from what other people wrote: an event's tags or content, a
 * profile, a signer's message, a query parameter. React puts any string into
 * `href` as it is, so `javascript:…` in someone's `url` tag becomes script on
 * our origin the moment a reader clicks it, beside their keys.
 *
 * The scheme is read the way the browser will read it (the URL parser, which
 * drops the tabs, newlines and leading controls a regex would miss), and the
 * caller's string is returned as it was, trimmed, so a link still shows what
 * its author wrote.
 *
 * A link the code builds itself (`/p/${npub}`) needs none of this; one taken
 * from an event does. eslint.config.js refuses a raw `tagVal(...)` in `href`.
 */

function schemeOf(value: string): string | null {
  try {
    return new URL(value).protocol;
  } catch {
    return null;
  }
}

/**
 * A web address someone gave, fit for `href`: http or https, and mailto when
 * the caller says so. Undefined for anything else, so `href={safeHref(x)}`
 * renders no link at all rather than a dangerous one.
 */
export function safeHref(url: string | null | undefined, options: { mailto?: boolean } = {}): string | undefined {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return undefined;
  const scheme = schemeOf(s);
  if (scheme === "http:" || scheme === "https:") return s;
  if (options.mailto && scheme === "mailto:") return s;
  return undefined;
}

/** As `safeHref`, https only: where we send a reader to act (a signer's approval, a checkout). */
export function httpsHref(url: string | null | undefined): string | undefined {
  const s = safeHref(url);
  return s && schemeOf(s) === "https:" ? s : undefined;
}

/**
 * A `?next=` (or any path someone handed us) as a path on this site: its
 * pathname, query and fragment, or null when it would leave the origin.
 *
 * Parsed against the origin, not matched as a string: `/\evil.example` passes
 * a `startsWith("/") && !startsWith("//")` check, and the parser reads it as
 * `//evil.example`. A pathname that itself begins `//` (`/.//evil.example`
 * normalises to one) is refused too: pushState and location.assign read it as
 * a host. `exclude` names pages the caller won't send a reader back to (the
 * sign-in page itself), by pathname, whatever query follows.
 */
export function sameOriginPath(
  raw: string | null | undefined,
  origin: string = window.location.origin,
  exclude: readonly string[] = [],
): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  if (url.pathname.startsWith("//") || url.pathname.startsWith("/\\")) return null;
  if (exclude.includes(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
