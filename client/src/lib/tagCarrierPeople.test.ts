/**
 * A query that matches a tag pulls the tag's carriers into the people list:
 * carriers first, best-scored first, then whoever the relay found by name.
 * The rule is pure so the typeahead and the People tab agree on it.
 */
import { describe, expect, it } from "vitest";
import {
  leadingCarriers,
  mergeCarrierPeople,
  matchedTagChip,
  tagsCarriedBy,
  toCarrierHit,
  type CarrierPerson,
} from "./tagCarrierPeople";
import type { SearchResult } from "./profileSearch";
import type { TagSummary } from "@/services/tags";

const pk = (c: string) => c.repeat(64);
const person = (c: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  pubkey: pk(c),
  npub: `npub${c}`,
  name: c,
  ...extra,
});
const carrier = (c: string, applications = 1, addedAt = 0): CarrierPerson => ({
  ...person(c),
  applications,
  addedAt,
});
const scores: Record<string, number | null | undefined> = { [pk("a")]: 0.9, [pk("b")]: 0.5, [pk("c")]: 0.7 };
const scoreOf = (p: string) => scores[p];

describe("mergeCarrierPeople", () => {
  it("leads with the carriers by score, then the relay's people in the order they came", () => {
    const rows = mergeCarrierPeople({
      relay: [person("x"), person("y")],
      carriers: [carrier("b"), carrier("a")],
      scoreOf,
    });
    expect(rows.map((r) => r.name)).toEqual(["a", "b", "x", "y"]);
  });

  it("puts an unscored carrier last among carriers, breaking ties by how many applied the tag", () => {
    const rows = mergeCarrierPeople({
      relay: [],
      carriers: [carrier("z", 1), carrier("w", 4), carrier("b")],
      scoreOf,
    });
    expect(rows.map((r) => r.name)).toEqual(["b", "w", "z"]);
  });

  it("shows a person once: the carrier's place, the relay's richer profile", () => {
    const rows = mergeCarrierPeople({
      relay: [person("x"), person("a", { about: "from the relay", nip05: "a@example.com" })],
      carriers: [carrier("a")],
      scoreOf,
    });
    expect(rows.map((r) => r.name)).toEqual(["a", "x"]);
    expect(rows[0].about).toBe("from the relay");
    expect(rows[0].nip05).toBe("a@example.com");
  });

  it("caps how many carriers lead so a name match still makes the typeahead", () => {
    const rows = mergeCarrierPeople({
      relay: [person("x"), person("y"), person("z"), person("v"), person("w")],
      carriers: ["a", "b", "c", "d", "e", "f"].map((c) => carrier(c)),
      scoreOf,
      leadCap: 4,
      limit: 7,
    });
    expect(rows).toHaveLength(7);
    expect(rows.slice(0, 4).map((r) => r.name)).toEqual(["a", "c", "b", "d"]);
    expect(rows.slice(4).map((r) => r.name)).toEqual(["x", "y", "z"]);
  });

  it("with no carriers is the relay list unchanged", () => {
    const relay = [person("x"), person("y")];
    expect(mergeCarrierPeople({ relay, carriers: [], scoreOf })).toEqual(relay);
  });
});

const tag = (slug: string, key = slug): TagSummary => ({
  key,
  slug,
  name: slug,
  authorPubkey: pk("9"),
  people: 1,
  vouches: 1,
  sharesName: 0,
  unverified: false,
});

describe("tagsCarriedBy", () => {
  it("lists the matched tags this person carries, in the matches' order", () => {
    const human = tag("verified-human"),
      author = tag("author"),
      dev = tag("developer");
    const byTag = new Map([
      [human.key, new Set([pk("a"), pk("b")])],
      [author.key, new Set([pk("a")])],
      [dev.key, new Set([pk("c")])],
    ]);
    expect(tagsCarriedBy(pk("a"), byTag, [dev, human, author])).toEqual([human, author]);
    expect(tagsCarriedBy(pk("b"), byTag, [dev, human, author])).toEqual([human]);
    expect(tagsCarriedBy(pk("x"), byTag, [dev, human, author])).toEqual([]);
  });
});

describe("toCarrierHit", () => {
  it("is a kind-0 hit the People tab can score and filter like any other", () => {
    const hit = toCarrierHit(carrier("a"));
    expect(hit.event.kind).toBe(0);
    expect(hit.event.pubkey).toBe(pk("a"));
    expect(hit.event.id).toBe(`tag-carrier:${pk("a")}`);
    expect(hit.author?.pubkey).toBe(pk("a"));
    expect(hit.rank).toBeNull();
  });
});

describe("matchedTagChip", () => {
  // Team feedback (2026-10-01): an "LFO" pill on an "AOS" search told the
  // reader nothing. A row wears the tag the words matched, and only that.
  it("is the best matched tag the person carries, and only that one", () => {
    const chip = matchedTagChip([tag("aos"), tag("developer")]);
    expect(chip?.slug).toBe("aos");
    expect(chip?.people).toBe(1);
  });

  it("is nothing when the words matched no tag they carry", () => {
    expect(matchedTagChip([])).toBeUndefined();
  });

  // Who made a tag is not what trust scores, so the chip does not carry it.
  it("says nothing about who made the tag", () => {
    expect(matchedTagChip([{ ...tag("lfo"), unverified: true }])).not.toHaveProperty("unverified");
  });
});

describe("leadingCarriers", () => {
  it("is the people on the tags that may lead, once each", () => {
    const human = tag("verified-human"),
      aos = tag("aos");
    const people = [carrier("a"), carrier("b"), carrier("c")];
    const byPubkey = new Map([
      [pk("a"), [human, aos]],
      [pk("b"), [aos]],
      [pk("c"), [human]],
    ]);
    expect(leadingCarriers(people, byPubkey, [human]).map((p) => p.name)).toEqual(["a", "c"]);
    expect(leadingCarriers(people, byPubkey, [])).toEqual([]);
  });
});
