// NIP-39 external identity parsing for the public profile. A kind-0 `i` tag is a
// `platform:identity` claim (e.g. "github:alice", "mastodon:host.tld/@alice").
// We DISPLAY these as clickable links — we do not verify the proof — so callers
// must not present them as cryptographically "verified".

export type IdentityIcon =
  | "github" | "x" | "telegram" | "mastodon"
  | "linkedin" | "youtube" | "signal" | "bluesky" | "facebook" | "tiktok" | "instagram"
  | "link";

export interface ExternalIdentity {
  platform: string;
  identity: string;
  label: string;
  icon: IdentityIcon;
  /** Outbound URL, when we can build a sensible one. */
  url?: string;
}

/** Parse one `platform:identity` claim. Returns null for things we skip (e.g. a
 *  self-referential `nostr:` claim) or that can't be parsed. */
export function parseIdentityClaim(claim: string): ExternalIdentity | null {
  const idx = claim.indexOf(":");
  if (idx < 0) return null;
  const platform = claim.slice(0, idx).toLowerCase().trim();
  const identity = claim.slice(idx + 1).trim();
  if (!identity) return null;

  switch (platform) {
    case "github":
      return { platform, identity, label: "GitHub", icon: "github", url: `https://github.com/${identity}` };
    case "twitter":
    case "x":
      return { platform: "x", identity, label: "X", icon: "x", url: `https://x.com/${identity.replace(/^@/, "")}` };
    case "telegram":
      // Telegram claims are often a numeric user id (not linkable); usernames are.
      return { platform, identity, label: "Telegram", icon: "telegram", url: /^\d+$/.test(identity) ? undefined : `https://t.me/${identity.replace(/^@/, "")}` };
    case "mastodon":
      return { platform, identity, label: "Mastodon", icon: "mastodon", url: `https://${identity.replace(/^https?:\/\//, "")}` };
    case "linkedin":
      return { platform, identity, label: "LinkedIn", icon: "linkedin", url: `https://www.linkedin.com/in/${identity.replace(/^\/?in\//, "").replace(/^@/, "")}` };
    case "youtube":
      return { platform, identity, label: "YouTube", icon: "youtube", url: `https://www.youtube.com/@${identity.replace(/^@/, "")}` };
    case "signal":
      // Signal usernames have no public profile page; only link a full URL.
      return { platform, identity, label: "Signal", icon: "signal", url: /^https?:\/\//.test(identity) ? identity : undefined };
    case "bluesky":
      return { platform, identity, label: "Bluesky", icon: "bluesky", url: `https://bsky.app/profile/${identity.replace(/^@/, "")}` };
    case "facebook":
      return { platform, identity, label: "Facebook", icon: "facebook", url: `https://facebook.com/${identity.replace(/^@/, "")}` };
    case "tiktok":
      return { platform, identity, label: "TikTok", icon: "tiktok", url: `https://www.tiktok.com/@${identity.replace(/^@/, "")}` };
    case "instagram":
      return { platform, identity, label: "Instagram", icon: "instagram", url: `https://instagram.com/${identity.replace(/^@/, "")}` };
    case "nostr":
      return null; // self-referential
    default: {
      const url = /^https?:\/\//.test(identity) ? identity : undefined;
      return { platform, identity, label: platform.charAt(0).toUpperCase() + platform.slice(1), icon: "link", url };
    }
  }
}

/** Platforms offered in the profile editor's "Linked accounts" picker. */
export const IDENTITY_PLATFORMS: { value: string; label: string; placeholder: string }[] = [
  { value: "github", label: "GitHub", placeholder: "username" },
  { value: "x", label: "X", placeholder: "username" },
  { value: "instagram", label: "Instagram", placeholder: "username" },
  { value: "linkedin", label: "LinkedIn", placeholder: "username (linkedin.com/in/…)" },
  { value: "youtube", label: "YouTube", placeholder: "@handle" },
  { value: "facebook", label: "Facebook", placeholder: "username" },
  { value: "tiktok", label: "TikTok", placeholder: "@username" },
  { value: "bluesky", label: "Bluesky", placeholder: "name.bsky.social" },
  { value: "mastodon", label: "Mastodon", placeholder: "host.tld/@username" },
  { value: "telegram", label: "Telegram", placeholder: "username" },
  { value: "signal", label: "Signal", placeholder: "username" },
  { value: "other", label: "Other", placeholder: "platform:identity or a URL" },
];

/** Split a raw `platform:identity` claim back into its parts (for pre-filling the
 *  editor). Unknown/`twitter` platforms are normalized to match the picker. */
export function splitIdentityClaim(claim: string): { platform: string; identity: string } {
  const idx = claim.indexOf(":");
  if (idx < 0) return { platform: "other", identity: claim.trim() };
  let platform = claim.slice(0, idx).toLowerCase().trim();
  const identity = claim.slice(idx + 1).trim();
  if (platform === "twitter") platform = "x";
  const known = new Set(["github", "x", "mastodon", "telegram", "linkedin", "youtube", "signal", "bluesky", "facebook", "tiktok", "instagram"]);
  return known.has(platform) ? { platform, identity } : { platform: "other", identity: claim.trim() };
}

/** Build a NIP-39 `i`-tag claim string from a platform + handle. For "other",
 *  the handle is taken verbatim (it may already be `platform:identity` or a URL). */
export function formatIdentityClaim(platform: string, identity: string): string {
  const p = platform.toLowerCase().trim();
  const id = identity.trim();
  if (!id) return "";
  if (p === "other") return id.includes(":") ? id : `link:${id}`;
  return `${p}:${id.replace(/^@/, "")}`;
}

/** Parse + de-dupe a list of raw `i`-tag claims into displayable identities. */
export function parseIdentities(claims: string[]): ExternalIdentity[] {
  const seen = new Set<string>();
  const out: ExternalIdentity[] = [];
  for (const c of claims) {
    const parsed = parseIdentityClaim(c);
    if (!parsed) continue;
    const key = `${parsed.platform}:${parsed.identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}
