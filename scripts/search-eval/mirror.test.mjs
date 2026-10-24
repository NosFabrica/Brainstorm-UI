import { describe, expect, it } from "vitest";
import { dictionaryConcepts, propertyMatches } from "./mirror.mjs";

const HOUSE = "a".repeat(64);
const CURATOR = "b".repeat(64);
const STRANGER = "c".repeat(64);
const CURATOR_TAG = `39999:${"d".repeat(64)}:dictionary-concept-curator`;

let seq = 0;
const ev = (o) => ({ id: (seq++).toString(16).padStart(64, "0"), created_at: 100, tags: [], ...o });
const tagging = (who, { by = HOUSE, polarity, at = 100, d = `tag-${who.slice(0, 4)}` } = {}) =>
  ev({
    kind: 39999,
    pubkey: by,
    created_at: at,
    tags: [["d", d], ["a", CURATOR_TAG], ["p", who], ...(polarity == null ? [] : [["polarity", String(polarity)]])],
  });
const header = (pubkey, d, { self = true, points = [], at = 100, plural } = {}) =>
  ev({
    kind: 39998,
    pubkey,
    created_at: at,
    tags: [
      ["d", d],
      ...(plural ? [["names", plural, plural]] : []),
      ...(self ? [["b", `39998:${pubkey}:${d}`]] : []),
      ...points.map((c) => ["b", c]),
    ],
  });
const concepts = (events, roles = []) => dictionaryConcepts(events, { house: HOUSE, curatorTag: CURATOR_TAG, roles });

describe("dictionaryConcepts (lib/dictionaryConcepts, hooks/useDictionaryConcepts)", () => {
  it("is a curator's header that points at itself", () => {
    expect(concepts([tagging(CURATOR), header(CURATOR, "places")])).toEqual([`39998:${CURATOR}:places`]);
  });

  it("leaves out a header that points only elsewhere", () => {
    const copy = header(CURATOR, "my-places", { self: false, points: [`39998:${STRANGER}:places`] });
    expect(concepts([tagging(CURATOR), copy])).toEqual([]);
  });

  it("leaves out headers by someone the house has not tagged, or tagged by someone else", () => {
    expect(concepts([tagging(STRANGER, { by: CURATOR }), header(STRANGER, "books")])).toEqual([]);
  });

  it("takes the curator back when the house's newest tagging disputes them", () => {
    const events = [
      tagging(CURATOR, { at: 100 }),
      tagging(CURATOR, { at: 200, polarity: -1 }),
      header(CURATOR, "places"),
    ];
    expect(concepts(events)).toEqual([]);
  });

  it("has the house curate only if it tagged itself", () => {
    expect(concepts([header(HOUSE, "github")])).toEqual([]);
    expect(concepts([tagging(HOUSE), header(HOUSE, "github")])).toEqual([`39998:${HOUSE}:github`]);
  });

  it("reads only the newest version of a header", () => {
    const events = [
      tagging(CURATOR),
      header(CURATOR, "places", { at: 100 }),
      header(CURATOR, "places", { at: 200, self: false }),
    ];
    expect(concepts(events)).toEqual([]);
  });

  it("leaves out the role concepts, and orders the rest by name", () => {
    const events = [
      tagging(CURATOR),
      header(CURATOR, "z", { plural: "Books" }),
      header(CURATOR, "a", { plural: "Places" }),
      header(CURATOR, "templates", { plural: "URL Templates" }),
    ];
    expect(concepts(events, [`39998:${CURATOR}:templates`])).toEqual([`39998:${CURATOR}:z`, `39998:${CURATOR}:a`]);
  });

  it("is empty with no house", () => {
    expect(
      dictionaryConcepts([tagging(CURATOR), header(CURATOR, "places")], { house: null, curatorTag: CURATOR_TAG }),
    ).toEqual([]);
  });
});

describe("propertyMatches", () => {
  const place = (...tags) => ({ tags });

  it("matches the first value, as before", () => {
    expect(propertyMatches(place(["cuisine", "pizza"]), { cuisine: "pizza" })).toBe(true);
  });

  it("matches any value of a tag the item carries more than once", () => {
    const item = place(["cuisine", "burger"], ["cuisine", "pizza"]);
    expect(propertyMatches(item, { cuisine: "pizza" })).toBe(true);
    expect(propertyMatches(item, { cuisine: "sushi" })).toBe(false);
  });

  it("still reads a value list, underscores as spaces, and ignores accents", () => {
    expect(propertyMatches(place(["cuisine", "pizza;hot_dog"]), { cuisine: "hot dog" })).toBe(true);
    expect(propertyMatches(place(["cuisine", "açaí"]), { cuisine: "acai" })).toBe(true);
  });

  it("needs every property to match", () => {
    const item = place(["cuisine", "pizza"], ["category", "restaurant"]);
    expect(propertyMatches(item, { cuisine: "pizza", category: "restaurant" })).toBe(true);
    expect(propertyMatches(item, { cuisine: "pizza", category: "cafe" })).toBe(false);
  });
});
