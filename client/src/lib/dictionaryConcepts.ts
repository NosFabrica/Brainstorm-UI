/**
 * The Dictionary's concepts, from the events that decide them
 * (config/dictionary): the house's taggings with the curator tag say who
 * curates, and the curators' entries on the Demo Dictionary Concepts list say
 * what's in. Pure — hooks/useDictionaryConcepts asks the relays and hands the
 * events here.
 *
 * - A curator is the list's author, or someone the house tagged with the
 *   curator tag and hasn't disputed (Tapestry's `polarity`: absent or ≥ 0.5
 *   applies).
 * - A concept is the `a` of a curator's entry, a kind-39998 coordinate. An
 *   entry carrying `removed` (any value) takes its concept out — unless
 *   another curator still lists it.
 * - Addressable events replace: only the newest per author and `d` speaks
 *   (NIP-01; a tie goes to the lower id).
 */
import { parseCoordinate } from "@/lib/dlistFields";

type Ev = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

const HEX64 = /^[0-9a-f]{64}$/;
const valueOf = (ev: Ev, name: string) => ev.tags.find((t) => t[0] === name)?.[1];
const carries = (ev: Ev, name: string, value: string) => ev.tags.some((t) => t[0] === name && t[1] === value);

function newestPerAddress<T extends Ev>(events: readonly T[]): T[] {
  const byAddress = new Map<string, T>();
  for (const ev of events) {
    const address = `${ev.kind}:${ev.pubkey}:${valueOf(ev, "d") ?? ""}`;
    const held = byAddress.get(address);
    if (!held || ev.created_at > held.created_at || (ev.created_at === held.created_at && ev.id < held.id))
      byAddress.set(address, ev);
  }
  return [...byAddress.values()];
}

/** Who curates: the list's author, and everyone the house tagged with the curator tag. */
export function curatorsOf(
  events: readonly Ev[],
  { house, curatorTag, listAuthor }: { house: string | null; curatorTag: string; listAuthor: string },
): string[] {
  const curators = new Set(HEX64.test(listAuthor) ? [listAuthor] : []);
  if (!house) return [...curators];
  const taggings = events.filter((ev) => ev.kind === 39999 && ev.pubkey === house && carries(ev, "a", curatorTag));
  for (const ev of newestPerAddress(taggings)) {
    const person = valueOf(ev, "p")?.toLowerCase();
    const polarity = Number(valueOf(ev, "polarity") ?? "1");
    if (person && HEX64.test(person) && polarity >= 0.5) curators.add(person);
  }
  return [...curators];
}

/** What's in: the concepts curators' entries name, by name then coordinate. */
export function conceptsOf(events: readonly Ev[], curators: readonly string[], list: string): string[] {
  const allowed = new Set(curators);
  const entries = newestPerAddress(
    events.filter((ev) => ev.kind === 39999 && allowed.has(ev.pubkey) && carries(ev, "z", list)),
  ).sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : 1));
  const named = new Map<string, string>();
  for (const ev of entries) {
    if (ev.tags.some((t) => t[0] === "removed")) continue;
    const coordinate = valueOf(ev, "a");
    if (!coordinate || parseCoordinate(coordinate)?.kind !== 39998 || named.has(coordinate)) continue;
    named.set(coordinate, valueOf(ev, "name")?.trim() || coordinate);
  }
  return [...named]
    .sort(([a, an], [b, bn]) => an.localeCompare(bn, undefined, { sensitivity: "base" }) || (a < b ? -1 : 1))
    .map(([coordinate]) => coordinate);
}
