import { describe, expect, it } from "vitest";
import { gatherTags, tagTargets, targetsOf, type ResultTag } from "./resultTags";
import type { SearchHit } from "@/services/search";

const PK = "a".repeat(64);
const hit = (id: string, kind: number, tags: string[][] = []): SearchHit => ({
  event: { id, kind, pubkey: PK, created_at: 1, tags, content: "", sig: "s" },
  author: null,
  rank: null,
});
const tag = (slug: string, name = slug): ResultTag => ({ key: `${PK}|${slug}`, authorPubkey: PK, slug, name });

describe("targetsOf", () => {
  it("is a profile's person, a note's id, and an addressable event's id and coordinate", () => {
    expect(targetsOf(hit("p", 0))).toEqual([PK]);
    expect(targetsOf(hit("n", 1))).toEqual(["n"]);
    expect(targetsOf(hit("i", 39999, [["d", "vcavallo"]]))).toEqual(["i", `39999:${PK}:vcavallo`]);
  });

  it("splits a page into the people and the events the tag readers ask", () => {
    expect(tagTargets([hit("p", 0), hit("n", 1), hit("i", 30023, [["d", "x"]])])).toEqual({
      pubkeys: [PK],
      events: ["n", "i", `30023:${PK}:x`],
    });
  });
});

describe("gatherTags", () => {
  const verified = tag("verified-human", "Verified Human");
  const artist = tag("artist", "Artist");
  const dev = tag("developer", "Developer");

  it("orders the tags by how many results carry them, then by name", () => {
    const on: Record<string, ResultTag[]> = {
      [PK]: [artist, verified],
      [`39999:${PK}:vcavallo`]: [verified],
      n: [dev],
    };
    const { tags, byHit } = gatherTags([hit("p", 0), hit("i", 39999, [["d", "vcavallo"]]), hit("n", 1)], (t) => on[t]);
    expect(tags.map((t) => t.name)).toEqual(["Verified Human", "Artist", "Developer"]);
    expect(byHit.get("i")).toEqual(new Set([verified.key]));
  });

  it("counts a result once whether its tagging names it by id or by coordinate", () => {
    const on: Record<string, ResultTag[]> = { i: [verified], [`39999:${PK}:vcavallo`]: [verified], n: [artist] };
    const { tags } = gatherTags([hit("i", 39999, [["d", "vcavallo"]]), hit("n", 1), hit("m", 1)], (t) => on[t]);
    // One each: Artist and Verified Human tie, so the name breaks it.
    expect(tags.map((t) => t.name)).toEqual(["Artist", "Verified Human"]);
  });

  it("leaves a result whose tags aren't known yet out of every tag", () => {
    const { tags, byHit } = gatherTags([hit("n", 1)], () => undefined);
    expect(tags).toEqual([]);
    expect(byHit.size).toBe(0);
  });
});
