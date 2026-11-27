export type ProfileBits = { name?: string; picture?: string };
export type NameMatch = { pubkey: string; name?: string; picture?: string };

/**
 * The users whose name (from their kind-0) or pubkey contains `query`, case
 * folded. Hand it every user, not a page of them: a name search over the page
 * on screen misses everyone else.
 */
export function matchUsersByName(
  users: readonly { pubkey: string }[],
  profiles: ReadonlyMap<string, ProfileBits>,
  query: string,
  { pubkeys = false }: { pubkeys?: boolean } = {},
): NameMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: NameMatch[] = [];
  for (const u of users) {
    const prof = profiles.get(u.pubkey);
    const name = prof?.name?.toLowerCase() ?? "";
    if (name.includes(q) || (pubkeys && u.pubkey.toLowerCase().includes(q))) {
      out.push({ pubkey: u.pubkey, name: prof?.name, picture: prof?.picture });
    }
  }
  return out;
}
