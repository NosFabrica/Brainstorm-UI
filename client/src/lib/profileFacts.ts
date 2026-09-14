/**
 * The facts a public profile states about itself, read from kind-0 fields
 * as relays serve them. Two rules of the wire (census of 300 profiles,
 * 2026-09-05): a `website` is free text — one URL, several, a scheme or
 * not, or junk of the wrong type — and a lightning target is a LUD-16
 * address (`name@domain`) far more often than an old LNURL. Everything
 * here takes `unknown` because the page's profile type promises strings
 * the wire does not keep.
 */

export interface WebsiteLink {
  /** What to open — always with a scheme. */
  href: string;
  /** What to read — no scheme, no trailing slash. */
  label: string;
  /** The whole normalized URL, for a title. */
  full: string;
}

const MAX_LINKS = 3;

/** Every link a profile lists, de-duplicated, at most three. */
export function websiteLinks(raw: unknown): WebsiteLink[] {
  if (typeof raw !== "string") return [];
  const out: WebsiteLink[] = [];
  const seen = new Set<string>();
  for (const part of raw.trim().split(/[\s,]+/)) {
    if (!part) continue;
    const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
    const label = href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ href, label, full: href });
    if (out.length === MAX_LINKS) break;
  }
  return out;
}

export interface LightningTarget {
  /** What a copy puts on the clipboard — the whole thing. */
  address: string;
  /** What the row shows — an address whole, an LNURL shortened. */
  display: string;
  /** Whether the zap flow can pay it (it resolves LUD-16 only). */
  zappable: boolean;
}

/** The lightning target to copy: a LUD-16 address wins over an LNURL. */
/**
 * A lightning address a reader can take in. The domain is what they
 * recognise; a local part longer than a handle — an npub-based one runs to
 * 63 characters — is shortened the way an npub is. Copy always gets the
 * whole address (Benjamin, 2026-09-09: "condense it so it's more presentable").
 */
export function condenseLightning(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 0) return address;
  const local = address.slice(0, at);
  const domain = address.slice(at);
  return local.length > 20 ? `${local.slice(0, 8)}…${local.slice(-5)}${domain}` : address;
}

export function lightningTarget(lud16: unknown, lud06: unknown): LightningTarget | null {
  const address = typeof lud16 === "string" ? lud16.trim() : "";
  if (address.includes("@")) return { address, display: condenseLightning(address), zappable: true };
  const lnurl = typeof lud06 === "string" ? lud06.trim() : "";
  if (/^lnurl1/i.test(lnurl)) {
    const display = lnurl.length > 20 ? `${lnurl.slice(0, 12)}…${lnurl.slice(-6)}` : lnurl;
    return { address: lnurl, display, zappable: false };
  }
  return null;
}
