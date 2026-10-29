/**
 * The newest version at each address, newest first.
 *
 * A replaceable or addressable event has one current version per address
 * (NIP-01): the newest, and on a tie the lexicographically lower id. Readers
 * that gather events from several relays — or from the store and an ask's own
 * answer — can hold two versions of one address, because a lagging relay still
 * serves the older one. Whatever renders from such a gathering keeps only the
 * winner, or a listing its seller has since hidden or sold reads as for sale.
 *
 * The address is `kind:pubkey:d` for an addressable kind (30000–39999; a
 * missing `d` is ""), `kind:pubkey:` for a replaceable one (0, 3,
 * 10000–19999), and the event's id for any other — a regular event is its own
 * address, so nothing of it is dropped.
 */
type Ev = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

export function addressOf(ev: Ev): string {
  if (ev.kind >= 30000 && ev.kind < 40000)
    return `${ev.kind}:${ev.pubkey}:${ev.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
  if (ev.kind === 0 || ev.kind === 3 || (ev.kind >= 10000 && ev.kind < 20000)) return `${ev.kind}:${ev.pubkey}:`;
  return ev.id;
}

/** NIP-01: newer wins; on a tie, the lower id. */
const beats = (a: Ev, b: Ev) => a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

export function newestPerAddress<T extends Ev>(events: readonly T[]): T[] {
  const byAddress = new Map<string, T>();
  for (const ev of events) {
    const address = addressOf(ev);
    const held = byAddress.get(address);
    if (!held || beats(ev, held)) byAddress.set(address, ev);
  }
  return [...byAddress.values()].sort((a, b) => (beats(a, b) ? -1 : beats(b, a) ? 1 : 0));
}
