/**
 * A query that matches a tag pulls the tag's carriers into the people list.
 *
 * The rule, shared by the typeahead and the People tab: carriers first — the
 * tag is the strongest reason a person is on the list — best-scored first,
 * then the people the relay found by name or profile, in the order it found
 * them. A person on both sides appears once, in the carrier's place, with the
 * relay's richer profile. Only carriers wear the tag chip; the caller learns
 * who carries what from `tagsCarriedBy`.
 *
 * Pure, so both surfaces agree and the rule is testable without a relay.
 */
import type { NostrEvent } from "nostr-tools";
import type { SearchResult } from "./profileSearch";
import type { ProfileTag, TagSummary } from "@/services/tags";

/** A tag's carrier as a person, with what the tag page knows about the tag on them. */
export type CarrierPerson = SearchResult & {
  /** Distinct trusted third parties who applied the tag. */
  applications: number;
  /** When the tag was first applied to them. */
  addedAt: number;
};

export interface MergeOptions {
  relay: readonly SearchResult[];
  carriers: readonly CarrierPerson[];
  scoreOf: (pubkey: string) => number | null | undefined;
  /** At most this many carriers lead; the relay fills the rest. Unset: all of them. */
  leadCap?: number;
  /** Total rows. Unset: everyone. */
  limit?: number;
}

function byScore(scoreOf: MergeOptions["scoreOf"]) {
  return (a: CarrierPerson, b: CarrierPerson): number => {
    const sa = scoreOf(a.pubkey),
      sb = scoreOf(b.pubkey);
    if (sa != null && sb != null && sa !== sb) return sb - sa;
    if ((sa == null) !== (sb == null)) return sa == null ? 1 : -1;
    if (a.applications !== b.applications) return b.applications - a.applications;
    return b.addedAt - a.addedAt;
  };
}

export function mergeCarrierPeople({ relay, carriers, scoreOf, leadCap, limit }: MergeOptions): SearchResult[] {
  if (carriers.length === 0) return limit == null ? [...relay] : relay.slice(0, limit);
  const fromRelay = new Map(relay.map((p) => [p.pubkey, p]));
  const lead = [...carriers]
    .sort(byScore(scoreOf))
    .slice(0, leadCap ?? carriers.length)
    .map(({ applications: _a, addedAt: _t, ...person }) => fromRelay.get(person.pubkey) ?? person);
  const seen = new Set(lead.map((p) => p.pubkey));
  const rest = relay.filter((p) => !seen.has(p.pubkey));
  const rows = [...lead, ...rest];
  return limit == null ? rows : rows.slice(0, limit);
}

/** The matched tags this person carries, in the matches' order. */
export function tagsCarriedBy(
  pubkey: string,
  carriersByTag: ReadonlyMap<string, ReadonlySet<string>>,
  tags: readonly TagSummary[],
): TagSummary[] {
  return tags.filter((tag) => carriersByTag.get(tag.key)?.has(pubkey));
}

/** A carrier as a kind-0 hit, so the People tab scores and filters it like any other. */
export function toCarrierHit(person: CarrierPerson): { event: NostrEvent; author: SearchResult; rank: null } {
  const { applications: _a, addedAt: _t, ...author } = person;
  return {
    event: {
      id: `tag-carrier:${person.pubkey}`,
      kind: 0,
      pubkey: person.pubkey,
      created_at: 0,
      tags: [],
      content: "",
      sig: "",
    },
    author,
    rank: null,
  };
}

type HitLike = { event: NostrEvent; author: SearchResult | null; rank: number | null };

/**
 * The People tab's version of the merge, on hits: carriers as kind-0 hits
 * first (a person the relay also found keeps the relay's profile), then the
 * relay's hits without them. Order among carriers is settled later, once
 * scores are known (`leadCarriersByScore`).
 */
export function mergeCarrierHits<H extends HitLike>(base: readonly H[], carriers: readonly CarrierPerson[]): H[] {
  if (carriers.length === 0) return [...base];
  const fromRelay = new Map(base.filter((h) => h.event.kind === 0 && h.author).map((h) => [h.event.pubkey, h]));
  const lead = carriers.map((c) => {
    const hit = toCarrierHit(c) as H;
    const relay = fromRelay.get(c.pubkey);
    return relay ? ({ ...hit, author: relay.author } as H) : hit;
  });
  const carried = new Set(carriers.map((c) => c.pubkey));
  return [...lead, ...base.filter((h) => !(h.event.kind === 0 && carried.has(h.event.pubkey)))];
}

/**
 * The carriers' order, best-scored first (unknown last, then most applied),
 * as a rank per pubkey. Taken once when the carriers land and held for the
 * query: a score that arrives a moment later must not reorder a list the
 * reader is already scanning.
 */
export function rankCarriers(
  carriers: readonly CarrierPerson[],
  scoreOf: (pubkey: string) => number | null | undefined,
): Map<string, number> {
  return new Map([...carriers].sort(byScore(scoreOf)).map((c, i) => [c.pubkey, i]));
}

/** Orders the leading carrier block by a held rank, leaving the relay's order alone. */
export function leadCarriersByRank<H extends HitLike>(rows: readonly H[], rank: ReadonlyMap<string, number>): H[] {
  let end = 0;
  while (end < rows.length && rows[end].event.id.startsWith("tag-carrier:")) end++;
  if (end < 2) return [...rows];
  const at = (h: H) => rank.get(h.event.pubkey) ?? Number.MAX_SAFE_INTEGER;
  const lead = [...rows.slice(0, end)].sort((a, b) => at(a) - at(b));
  return [...lead, ...rows.slice(end)];
}

/** A tag as a chip on a person's row: enough to name it, link it and say how many. */
export interface TagChip {
  key: string;
  authorPubkey: string;
  slug: string;
  name: string;
  /** People carrying it (a catalogue tag) or asserters applying it to this person (their own). */
  people?: number;
  unverified?: boolean;
}

/** One identity for a tag whatever list it came from — the catalogue and a profile key it differently. */
export const tagChipId = (t: { authorPubkey: string; slug: string }) => `${t.authorPubkey}:${t.slug}`;

/**
 * The chips for one person's row: the matched tags the row knows they carry
 * lead, loud; their own counted tags follow, quiet, once each. Undefined
 * while their own tags are still out and nothing matched — the slot waits.
 */
export function personTagChips(
  own: readonly ProfileTag[] | undefined,
  matchedCarried: readonly TagSummary[],
): { chips: TagChip[]; emphasis: Set<string> } | undefined {
  if (own === undefined && matchedCarried.length === 0) return undefined;
  const emphasis = new Set(matchedCarried.map(tagChipId));
  const chips: TagChip[] = matchedCarried.map((t) => ({
    key: t.key,
    authorPubkey: t.authorPubkey,
    slug: t.slug,
    name: t.name,
    people: t.people,
    unverified: t.unverified,
  }));
  const seen = new Set(chips.map(tagChipId));
  for (const t of own ?? []) {
    if (seen.has(tagChipId(t))) continue;
    seen.add(tagChipId(t));
    chips.push({ key: t.key, authorPubkey: t.authorPubkey, slug: t.slug, name: t.name, people: t.applications });
  }
  return { chips, emphasis };
}

/** The people on the tags that may lead the list, once each, in the carriers' order. */
export function leadingCarriers(
  people: readonly CarrierPerson[],
  byPubkey: ReadonlyMap<string, readonly TagSummary[]>,
  lead: readonly TagSummary[],
): CarrierPerson[] {
  if (lead.length === 0) return [];
  const keys = new Set(lead.map((t) => t.key));
  return people.filter((p) => byPubkey.get(p.pubkey)?.some((t) => keys.has(t.key)));
}
