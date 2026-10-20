/**
 * Which listed account (a GitHub handle, say) a profile's NIP-05 handle shows
 * is the profile's own. A domain is its owner's: a root handle on it
 * (`_@riverdev.com`), or the name that is the domain's
 * (`riverdev@riverdev.com`), owns the account of that name. A name on someone
 * else's domain owns nothing — `sam@nostr.example` is one of many there, and a
 * GitHub `sam` could be anyone.
 *
 * The handle is only a claim until its domain answers for it (lib/nip05):
 * show a mark of ownership only for a verified one.
 */
export function accountOwnedBy(nip05: string | null | undefined, listed: readonly string[]): string | null {
  const [local, domain] = (nip05 ?? "").trim().toLowerCase().split("@");
  const name = domain?.split(".")[0];
  if (!name || (local !== "_" && local !== name)) return null;
  return listed.find((handle) => handle.toLowerCase() === name) ?? null;
}
