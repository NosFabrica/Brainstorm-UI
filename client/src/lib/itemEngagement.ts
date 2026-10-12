/**
 * What the network says about a list item, read from events — the rules,
 * not the fetching (services/itemEngagement).
 *
 * An endorsement is a kind-7 reaction on the item, the convention the hub's
 * curators already use ("+" on a GitHub account, 2026-09-03). A reaction
 * whose content is "-" is a thumbs-down (NIP-25) and never an endorsement;
 * anything else — "+", empty, an emoji — is one. One voice per person, the
 * latest.
 *
 * A claimant is a Nostr profile whose kind 0 carries a NIP-39 `i` tag naming
 * the GitHub handle (`["i", "github:<handle>", <proof>]`). The claim is the
 * profile's own word; nothing here checks the proof. Our index matches an
 * `#i` filter loosely (probed 2026-10-12: `github:vitorpamplona` also
 * returned Twitter claims), so the claim is checked here, exactly, case-
 * insensitively as GitHub handles are.
 */

type Reaction = { pubkey: string; created_at: number; content: string };
type Profile = { pubkey: string; created_at: number; tags: string[][] };

export interface Endorser {
  pubkey: string;
  /** When they last endorsed, unix seconds. */
  at: number;
}

export interface GitHubClaimant {
  pubkey: string;
  /** The claim's proof reference as the profile gives it (a gist id), or null. */
  proof: string | null;
}

export function endorsersOf(reactions: Reaction[]): Endorser[] {
  const latest = new Map<string, number>();
  for (const r of reactions) {
    if (!r.pubkey || r.content.trim() === "-") continue;
    latest.set(r.pubkey, Math.max(latest.get(r.pubkey) ?? 0, r.created_at));
  }
  return [...latest.entries()].map(([pubkey, at]) => ({ pubkey, at })).sort((a, b) => b.at - a.at);
}

export function githubClaimantsOf(profiles: Profile[], handle: string): GitHubClaimant[] {
  const want = `github:${handle.trim().toLowerCase()}`;
  const newest = new Map<string, Profile>();
  for (const p of profiles) {
    const cur = newest.get(p.pubkey);
    if (!cur || p.created_at > cur.created_at) newest.set(p.pubkey, p);
  }
  const out: GitHubClaimant[] = [];
  for (const p of newest.values()) {
    const claim = p.tags.find((t) => t[0] === "i" && typeof t[1] === "string" && t[1].trim().toLowerCase() === want);
    if (!claim) continue;
    out.push({ pubkey: p.pubkey, proof: typeof claim[2] === "string" && claim[2] ? claim[2] : null });
  }
  return out;
}
