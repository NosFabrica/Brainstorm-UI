// NIP-39 external identity parsing for the public profile. A kind-0 `i` tag is a
// `platform:identity` claim (e.g. "github:alice", "mastodon:host.tld/@alice").
// We DISPLAY these as clickable links — we do not verify the proof — so callers
// must not present them as cryptographically "verified".

export type IdentityIcon = "github" | "x" | "telegram" | "mastodon" | "link";

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
    case "nostr":
      return null; // self-referential
    default: {
      const url = /^https?:\/\//.test(identity) ? identity : undefined;
      return { platform, identity, label: platform.charAt(0).toUpperCase() + platform.slice(1), icon: "link", url };
    }
  }
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
