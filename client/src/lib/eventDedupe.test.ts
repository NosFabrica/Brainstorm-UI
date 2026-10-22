import { describe, expect, it } from "vitest";
import { dedupeEvents } from "./eventDedupe";

// One event, once: an aggregator's NIP-52 copy that an item names as its copy
// goes; two curators' items for the same page (the same `i`) go to one; and a
// copy no item names goes when it starts within 15 minutes of an item and
// reads the same. The organizer's own NIP-52 event never meets an item.
const INDEX = "c".repeat(64);
const AGG = "a".repeat(64);
const item = (id: string, i: string, start: number, title: string, extra: string[][] = []) => ({
  id,
  kind: 39999,
  pubkey: INDEX,
  created_at: 1,
  content: "",
  tags: [["d", `luma:${id}`], ["title", title], ["start", String(start)], ["i", i], ...extra],
});
const nip52 = (id: string, pubkey: string, d: string, start: number, title: string) => ({
  id,
  kind: 31923,
  pubkey,
  created_at: 1,
  content: "",
  tags: [
    ["d", d],
    ["title", title],
    ["start", String(start)],
  ],
});

describe("dedupeEvents", () => {
  it("drops a NIP-52 copy an item names, and keeps one item per page", () => {
    const copy = nip52("n1", AGG, "ev-1", 1_800_000_000, "Bitcoin & Coffee");
    const it1 = item("i1", "https://luma.com/pubkey-ldkz", 1_800_000_000, "Bitcoin & Coffee", [
      ["a", `31923:${AGG}:ev-1`, "", "copy"],
    ]);
    const it2 = item("i2", "https://luma.com/pubkey-ldkz", 1_800_000_000, "Bitcoin & Coffee");
    expect(dedupeEvents([copy, it1, it2]).map((e) => e.id)).toEqual(["i1"]);
  });

  it("drops a copy nobody names when it starts within 15 minutes of an item and reads the same", () => {
    const near = nip52("n2", AGG, "ev-2", 1_800_000_600, "Bitcoin and Coffee!");
    const far = nip52("n3", AGG, "ev-3", 1_800_003_600, "Bitcoin & Coffee");
    const other = nip52("n4", AGG, "ev-4", 1_800_000_000, "Lightning Workshop");
    const it1 = item("i1", "https://luma.com/x", 1_800_000_000, "Bitcoin & Coffee");
    expect(dedupeEvents([near, far, other, it1]).map((e) => e.id)).toEqual(["n3", "n4", "i1"]);
  });

  it("leaves two NIP-52 events alone, copies or not — only an item decides", () => {
    const a = nip52("n5", AGG, "ev-5", 1_800_000_000, "Meetup");
    const b = nip52("n6", "b".repeat(64), "ev-6", 1_800_000_000, "Meetup");
    expect(dedupeEvents([a, b]).map((e) => e.id)).toEqual(["n5", "n6"]);
  });
});
