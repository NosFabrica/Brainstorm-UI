// @vitest-environment node
import { describe, expect, it } from "vitest";
import { editedTagElement } from "./tagEdit";

/**
 * A tag's creator can change what the tag means, never what it is called. The
 * tag is an addressable event (kind 39999, `d` = its slug) and every tagging
 * points at that coordinate, so an edit is the same event published again:
 * same `d`, same name, same tags, a new description.
 */
const AUTHOR = "a".repeat(64);
const element = (content: unknown, tags: string[][] = [["d", "ham-radio"]]) => ({
  id: "1".repeat(64),
  pubkey: AUTHOR,
  kind: 39999,
  created_at: 1_790_000_000,
  tags,
  content: typeof content === "string" ? content : JSON.stringify(content),
  sig: "s",
});
const TAGS = [
  ["d", "ham-radio"],
  ["z", "39998:" + "b".repeat(64) + ":tag"],
  ["z", "tag-for-nostr-event"],
];

describe("editedTagElement", () => {
  it("changes the description and nothing else: the name, the slug and every tag stay", () => {
    const next = editedTagElement(
      element({ tag: { slug: "ham-radio", name: "Ham Radio", description: "old words" } }, TAGS),
      "  Licensed amateur radio operator  ",
      1_790_000_500,
    );
    expect(next.kind).toBe(39999);
    expect(next.tags).toEqual(TAGS);
    expect(JSON.parse(next.content)).toEqual({
      tag: { slug: "ham-radio", name: "Ham Radio", description: "Licensed amateur radio operator" },
    });
    expect(next.created_at).toBe(1_790_000_500);
  });

  it("gives a tag that had no description its first, and takes one away when left empty", () => {
    const bare = element({ tag: { slug: "ham-radio", name: "Ham Radio" } });
    expect(JSON.parse(editedTagElement(bare, "Radio people", 1_790_000_500).content).tag.description).toBe(
      "Radio people",
    );
    const described = element({ tag: { slug: "ham-radio", name: "Ham Radio", description: "Radio people" } });
    expect(JSON.parse(editedTagElement(described, "   ", 1_790_000_500).content).tag.description).toBe("");
  });

  it("keeps whatever else the record carries beside the tag", () => {
    const next = editedTagElement(
      element({ tag: { slug: "ham-radio", name: "Ham Radio", description: "" }, extra: { a: 1 } }),
      "Radio people",
      1_790_000_500,
    );
    expect(JSON.parse(next.content).extra).toEqual({ a: 1 });
  });

  it("is always newer than the version it replaces, whatever the clock says", () => {
    const next = editedTagElement(element({ tag: { slug: "ham-radio", name: "Ham Radio" } }), "x", 1_789_999_000);
    expect(next.created_at).toBe(1_790_000_001);
  });

  it("refuses a record that isn't a tag: no name to keep, or no slug to stay at", () => {
    expect(() => editedTagElement(element("not json"), "x", 1)).toThrow(/tag/i);
    expect(() => editedTagElement(element({ tag: { slug: "ham-radio" } }), "x", 1)).toThrow(/tag/i);
    expect(() => editedTagElement(element({ tag: { name: "Ham Radio" } }, [["z", "x"]]), "x", 1)).toThrow(/tag/i);
  });
});
