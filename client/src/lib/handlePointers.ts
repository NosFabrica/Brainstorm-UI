/**
 * Who a people search is about when the person's own profile doesn't carry
 * the words: the accounts that the matched profiles' handles belong to.
 *
 * A copy of someone's profile keeps their NIP-05 handle; so does an old
 * profile after a rename, and an alt. The handle's own server names the
 * account it belongs to (lib/nip05 handleOwner), so profiles that matched
 * the words but use another account's handle point the search at that
 * account. The names they used are said as evidence, never as the account's
 * own ("Profiles named … use this account's handle").
 */

export interface MatchedProfile {
  pubkey: string;
  name?: string;
  display_name?: string;
  nip05?: string;
}

export interface PointedAccount {
  pubkey: string;
  /** The names the pointing profiles used, each once. */
  names: string[];
  /** How many matched profiles pointed here. */
  count: number;
}

/**
 * The accounts the matched profiles' handles belong to, other than the
 * profiles themselves and anyone already among them; the one more profiles
 * point at first. `ownerOf` is who a claimed handle belongs to when it isn't
 * the claimer — null for their own handle, an unchecked one, or none.
 */
export function accountsHandlesPointTo(
  matched: MatchedProfile[],
  ownerOf: (nip05: string | undefined, pubkey: string) => string | null | undefined,
): PointedAccount[] {
  const present = new Set(matched.map((p) => p.pubkey));
  const byOwner = new Map<string, { names: Map<string, string>; count: number }>();
  for (const p of matched) {
    const owner = ownerOf(p.nip05, p.pubkey);
    if (!owner || present.has(owner)) continue;
    const entry = byOwner.get(owner) ?? { names: new Map<string, string>(), count: 0 };
    entry.count++;
    const name = (p.display_name || p.name || "").trim();
    if (name && !entry.names.has(name.toLowerCase())) entry.names.set(name.toLowerCase(), name);
    byOwner.set(owner, entry);
  }
  return [...byOwner.entries()]
    .map(([pubkey, e]) => ({ pubkey, names: [...e.names.values()], count: e.count }))
    .sort((a, b) => b.count - a.count);
}
