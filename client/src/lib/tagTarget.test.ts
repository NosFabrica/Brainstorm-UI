import { describe, expect, it } from "vitest";

import { tagTargetOf } from "./tagTarget";

/**
 * What a tagging names (issue #334; tapestry protocols/drafts/event-taggings.md,
 * "Targets"): an addressable event by its coordinate in an `a` tag, since its
 * id changes on every edit; any other event by its id in an `e` tag.
 */
const PK = "a".repeat(64);
const ev = (kind: number, tags: string[][] = []) => ({ id: "e".repeat(64), pubkey: PK, kind, tags });

describe("tagTargetOf", () => {
  it("names a note by its id", () => {
    expect(tagTargetOf(ev(1))).toEqual({ id: "e".repeat(64) });
  });

  it("names an addressable event — a listing, an article, a DList item — by its coordinate", () => {
    expect(tagTargetOf(ev(30402, [["d", "hoodie"]]))).toEqual({ address: `30402:${PK}:hoodie` });
    expect(tagTargetOf(ev(30023, [["d", "my-article"]]))).toEqual({ address: `30023:${PK}:my-article` });
    expect(tagTargetOf(ev(39999, [["d", "tl-tag-x"]]))).toEqual({ address: `39999:${PK}:tl-tag-x` });
  });

  it("reads a missing d tag as the empty identifier, as NIP-01 does", () => {
    expect(tagTargetOf(ev(30023))).toEqual({ address: `30023:${PK}:` });
  });

  it("keeps the 30000–39999 range: a regular or replaceable kind is named by id", () => {
    expect(tagTargetOf(ev(29999))).toEqual({ id: "e".repeat(64) });
    expect(tagTargetOf(ev(40000))).toEqual({ id: "e".repeat(64) });
  });
});
