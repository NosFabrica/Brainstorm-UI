/**
 * The Dictionary's concepts, from the events that decide them
 * (config/dictionary): the house's taggings with the curator tag say who
 * curates, and the curators' own self-pointing headers say what's in. Pure —
 * hooks/useDictionaryConcepts asks the relays and hands the events here.
 *
 * - A curator is someone the house tagged with the curator tag and hasn't
 *   disputed (Tapestry's `polarity`: absent or ≥ 0.5 applies). The house
 *   curates only if it tagged itself.
 * - A concept is a curator's kind-39998 header that points at itself (a
 *   Self-pointer, CONTEXT.md): its author putting it forward as a community
 *   concept. Dropping the self-pointer takes it out.
 * - Addressable events replace: only the newest per author and `d` speaks
 *   (NIP-01; a tie goes to the lower id).
 */
import { isSelfDeclared } from "@/lib/conceptResolution";
import { coordinateOf, headerNames } from "@/lib/dlistFields";
import { newestPerAddress } from "@/lib/newestPerAddress";

type Ev = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] };

const HEX64 = /^[0-9a-f]{64}$/;
const valueOf = (ev: Ev, name: string) => ev.tags.find((t) => t[0] === name)?.[1];
const carries = (ev: Ev, name: string, value: string) => ev.tags.some((t) => t[0] === name && t[1] === value);

/** Who curates: everyone the house tagged with the curator tag. */
export function curatorsOf(
  events: readonly Ev[],
  { house, curatorTag }: { house: string | null; curatorTag: string },
): string[] {
  if (!house) return [];
  const curators = new Set<string>();
  const taggings = events.filter((ev) => ev.kind === 39999 && ev.pubkey === house && carries(ev, "a", curatorTag));
  for (const ev of newestPerAddress(taggings)) {
    const person = valueOf(ev, "p")?.toLowerCase();
    const polarity = Number(valueOf(ev, "polarity") ?? "1");
    if (person && HEX64.test(person) && polarity >= 0.5) curators.add(person);
  }
  return [...curators];
}

/** What's in: the curators' headers that point at themselves, by name then coordinate. */
export function conceptsOf(events: readonly Ev[], curators: readonly string[]): string[] {
  const allowed = new Set(curators);
  const named = newestPerAddress(events.filter((ev) => ev.kind === 39998 && allowed.has(ev.pubkey)))
    .filter(isSelfDeclared)
    .map((ev) => [coordinateOf(ev)!, headerNames(ev).plural.trim()] as const);
  return named
    .sort(([a, an], [b, bn]) => an.localeCompare(bn, undefined, { sensitivity: "base" }) || (a < b ? -1 : 1))
    .map(([coordinate]) => coordinate);
}
