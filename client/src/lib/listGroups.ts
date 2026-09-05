/**
 * Same-tag follow packs, folded. Brainstorm's pinned-tag follow sets are one
 * kind-30000 list per person who pins a tag, so a search for "nostr" met ten
 * "Nostr devs" packs by nine people (39% overlap) and five "Bitcoin news" at
 * 94%. The team: "We have multiple lists of the same tag — this is bad."
 * One row per title: the most trusted curator's list carries the fold, the
 * union is counted once, and the faces are the people most lists agree on.
 */
type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

export interface ListGroup<T> {
  key: string;
  primary: T;
  others: T[];
  /** How many lists share the title, the primary included. */
  lists: number;
  /** Distinct people across all of them. */
  members: number;
  /** Every member, the ones most lists agree on first, then the primary's order. */
  consensus: string[];
}

const NOT_PLURAL = new Set(["news", "physics", "economics", "politics", "mathematics", "analysis", "chess"]);

/** The same tag however it was typed: case, a leading #, punctuation, a plural s. */
export function normaliseListTitle(title: string): string {
  const words = title.toLowerCase().replace(/^#/, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "";
  // "miners" and "miner" are one tag; "news" is not "new".
  const last = words[words.length - 1];
  if (last.length > 3 && last.endsWith("s") && !last.endsWith("ss") && !NOT_PLURAL.has(last)) words[words.length - 1] = last.slice(0, -1);
  return words.join(" ");
}

const titleOf = (e: EventLike) => e.tags.find((t) => (t[0] === "title" || t[0] === "name") && t[1]?.trim())?.[1] ?? "";
const membersOf = (e: EventLike) => e.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1]);
const isPeoplePack = (e: EventLike) => e.tags.some((t) => t[0] === "p") && !e.tags.some((t) => ["e", "a", "r"].includes(t[0]));

export function groupPeoplePacks<T>(items: T[], pick: (item: T) => { event: EventLike; score: number | null }): ListGroup<T>[] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const { event } = pick(item);
    const key = isPeoplePack(event) ? `pack:${normaliseListTitle(titleOf(event))}` : `one:${event.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }
  return order.map((key) => {
    const group = buckets.get(key)!;
    const ranked = [...group].sort((a, b) => {
      const pa = pick(a), pb = pick(b);
      return (pb.score ?? -1) - (pa.score ?? -1) || membersOf(pb.event).length - membersOf(pa.event).length;
    });
    const [primary, ...others] = ranked;
    const counts = new Map<string, number>();
    for (const item of ranked) for (const pk of new Set(membersOf(pick(item).event))) counts.set(pk, (counts.get(pk) ?? 0) + 1);
    const primaryOrder = new Map(membersOf(pick(primary).event).map((pk, i) => [pk, i]));
    const consensus = [...counts.keys()].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (primaryOrder.get(a) ?? Infinity) - (primaryOrder.get(b) ?? Infinity),
    );
    return { key, primary, others, lists: ranked.length, members: counts.size, consensus };
  });
}
