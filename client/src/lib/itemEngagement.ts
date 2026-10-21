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
 *
 * Endorsing is leaving the same reaction: NIP-25's "+", pointing at the item
 * by id and by address with the hub as the hint, naming its author and kind.
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

/**
 * Reactions asked for many items at once, given to the item each names — by
 * its id (`e`) or its address (`a`) — and read per item as endorsersOf does.
 */
export function endorsersByItem(
  reactions: (Reaction & { tags: string[][] })[],
  items: { id: string; address: string | null }[],
): Map<string, Endorser[]> {
  const byId = new Map(items.map((i) => [i.id, i.id]));
  const byAddress = new Map(items.filter((i) => i.address).map((i) => [i.address!, i.id]));
  const grouped = new Map<string, Reaction[]>();
  for (const r of reactions) {
    const names = new Set<string>();
    for (const t of r.tags) {
      const id = t[0] === "e" ? byId.get(t[1]) : t[0] === "a" ? byAddress.get(t[1]) : undefined;
      if (id) names.add(id);
    }
    for (const id of names) grouped.set(id, [...(grouped.get(id) ?? []), r]);
  }
  return new Map([...grouped.entries()].map(([id, rs]) => [id, endorsersOf(rs)]));
}

/** The items more trusted people recommend first; the order given otherwise. */
export function orderByTrust<T extends { id: string }>(hits: readonly T[], trustedCount: (id: string) => number): T[] {
  return hits
    .map((h, i) => ({ h, i, n: trustedCount(h.id) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.h);
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

/** The reaction a reader signs to endorse an item (NIP-25), the hub as every pointer's hint. */
export function endorsementTemplate(
  item: { id: string; kind: number; pubkey: string; tags: string[][] },
  relayHint: string,
): { kind: 7; content: "+"; tags: string[][] } {
  const d = item.tags.find((t) => t[0] === "d")?.[1];
  const tags: string[][] = [["e", item.id, relayHint]];
  if (d != null) tags.push(["a", `${item.kind}:${item.pubkey}:${d}`, relayHint]);
  tags.push(["p", item.pubkey], ["k", String(item.kind)]);
  return { kind: 7, content: "+", tags };
}
