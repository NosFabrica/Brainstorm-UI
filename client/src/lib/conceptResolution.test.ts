/**
 * Which definition governs: the reader's copy over the community's, never
 * the community's by default when a copy applies.
 */
import { describe, expect, it } from "vitest";
import {
  B_DEFERRED,
  bLinksOf,
  differencesBetween,
  definitionOf,
  isSelfDeclared,
  pointsAt,
  resolveConcept,
  type HeaderEvent,
} from "./conceptResolution";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const USER = "1".repeat(64);
const TA = "2".repeat(64);
const HOUSE = "3".repeat(64);
const COMMUNITY = `39998:${AVI}:github-accounts`;

const schema = [
  ["names", "GitHub Account", "GitHub Accounts"],
  ["description", "A list of github handles/accounts"],
  ["required", "github-username"],
  ["field-type", "github-username", "text"],
];

const header = (pubkey: string, extra: string[][] = [], base = schema): HeaderEvent => ({
  id: `${pubkey.slice(0, 8)}`.padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1_790_000_000,
  tags: [["d", "github-accounts"], ...base, ...extra],
});

const community = header(AVI);
const copyBy = (pubkey: string, base = schema) => header(pubkey, [["b", COMMUNITY, "pointer"]], base);

describe("b links", () => {
  it("reads target and type; absent or unknown types are pointers", () => {
    const h = header(USER, [
      ["b", COMMUNITY, "pointer"],
      ["b", "39998:x:y"],
      ["b", "39998:x:z", "inherit"],
      ["b", "39998:x:w", "mystery"],
    ]);
    expect(bLinksOf(h)).toEqual([
      { target: COMMUNITY, type: "pointer" },
      { target: "39998:x:y", type: "pointer" },
      { target: "39998:x:z", type: "inherit" },
      { target: "39998:x:w", type: "pointer" },
    ]);
  });

  it("the deferred sentinel is not a link", () => {
    expect(bLinksOf(header(USER, [["b", B_DEFERRED]]))).toEqual([]);
  });

  it("knows a self-declared shared concept", () => {
    expect(isSelfDeclared(header(AVI, [["b", COMMUNITY]]))).toBe(true);
    expect(isSelfDeclared(community)).toBe(false);
    expect(pointsAt(copyBy(TA), COMMUNITY)).toBe(true);
  });
});

describe("resolveConcept", () => {
  it("with no copy, the community header governs — and says so", () => {
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY })!;
    expect(r.source).toBe("community");
    expect(r.agreement).toBe("no-local-copy");
    expect(r.governing.coordinate).toBe(COMMUNITY);
    expect(r.chain).toEqual([COMMUNITY]);
  });

  it("the assistant's copy governs over the community's, and agrees when unchanged", () => {
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copyBy(TA) })!;
    expect(r.source).toBe("assistant");
    expect(r.governing.coordinate).toBe(`39998:${TA}:github-accounts`);
    expect(r.agreement).toBe("agrees");
    expect(r.chain).toEqual([`39998:${TA}:github-accounts`, COMMUNITY]);
  });

  it("personal beats assistant beats house, whatever their timestamps", () => {
    const newerTa = { ...copyBy(TA), created_at: 1_800_000_000 };
    const all = { community, communityCoordinate: COMMUNITY, personal: copyBy(USER), assistant: newerTa };
    expect(resolveConcept({ ...all, house: copyBy(HOUSE) })!.source).toBe("personal");
    expect(resolveConcept({ ...all, personal: null, house: copyBy(HOUSE) })!.source).toBe("assistant");
    expect(resolveConcept({ community, communityCoordinate: COMMUNITY, house: copyBy(HOUSE) })!.source).toBe("house");
  });

  it("renders from the copy's fields when it changed them, and says it differs", () => {
    const edited = copyBy(TA, [...schema, ["optional", "description", "Who it belongs to"]]);
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: edited })!;
    expect(r.agreement).toBe("differs");
    expect(r.differences).toEqual(["fields"]);
    expect(r.governing.fields.map((f) => f.name)).toEqual(["github-username", "description"]);
    expect(r.community!.fields.map((f) => f.name)).toEqual(["github-username"]);
  });

  it("a header that only shares the d is not a copy", () => {
    const stranger = header(TA); // same d, no b
    const r = resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: stranger })!;
    expect(r.source).toBe("community");
  });

  it("a copy whose community header wasn't found still governs, agreement unknown", () => {
    const r = resolveConcept({ community: null, communityCoordinate: COMMUNITY, assistant: copyBy(TA) })!;
    expect(r.source).toBe("assistant");
    expect(r.agreement).toBe("unknown");
    expect(r.community).toBeNull();
    expect(r.chain).toEqual([`39998:${TA}:github-accounts`, COMMUNITY]);
  });

  it("nothing to show is null", () => {
    expect(resolveConcept({ community: null, communityCoordinate: COMMUNITY })).toBeNull();
  });
});

describe("differencesBetween", () => {
  const c = definitionOf(community);

  it("names, description and fields each count", () => {
    const renamed = definitionOf(header(TA, [], [["names", "Coder", "Coders"], ...schema.slice(1)]));
    expect(differencesBetween(renamed, c)).toEqual(["names"]);
    const reworded = definitionOf(header(TA, [], [schema[0], ["description", "Other words"], ...schema.slice(2)]));
    expect(differencesBetween(reworded, c)).toEqual(["description"]);
    const retyped = definitionOf(header(TA, [], [...schema.slice(0, 3), ["field-type", "github-username", "url"]]));
    expect(differencesBetween(retyped, c)).toEqual(["fields"]);
  });

  it("a field's own description is wording within the field, not a different field", () => {
    const annotated = definitionOf(
      header(TA, [], [...schema.slice(0, 2), ["required", "github-username", "Their handle"], schema[3]]),
    );
    expect(differencesBetween(annotated, c)).toEqual([]);
  });
});
