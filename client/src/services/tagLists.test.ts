import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHit } from "@/services/search";

// The search relay is the boundary: who was asked, and what it sent back.
const relay = vi.hoisted(() => ({ asked: [] as Array<{ pov: string; kinds: number[] }>, answer: [] as SearchHit[] }));
vi.mock("@/services/searchTags", () => ({
  collect: async (_words: string, lens: { pov: string }, kinds: number[]) => {
    relay.asked.push({ pov: lens.pov, kinds });
    return relay.answer;
  },
}));
const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: async () => HOUSE }));

import { fetchTagLists, forgetTagLists, mergePerspectives, tagListsFromHits, tagNameOf } from "./tagLists";

const TAG_AUTHOR = "2efaa715".padEnd(64, "0");
const READER = "dabe380b".padEnd(64, "0");
const GITHUB = `39998:${"b83a28b7".padEnd(64, "0")}:github-accounts`;
const ITEM = `39999:${"b83a28b7".padEnd(64, "0")}:vcavallo-1i6dn0p`;
const NOTE = "7".repeat(64);
const PERSON = "3".repeat(64);

let seq = 0;
// Shapes per brainstorm_server ADR trusted-lists/0002 D5 (2026-11-03).
function list(over: {
  kind: number;
  title: string;
  slug?: string;
  observer?: string;
  target?: string;
  members: Array<Record<string, unknown>>;
  createdAt?: number;
}): SearchHit {
  const slug = over.slug ?? "verified-human";
  return {
    event: {
      id: (++seq).toString(16).padStart(64, "0"),
      kind: over.kind,
      pubkey: "a".repeat(64),
      created_at: over.createdAt ?? 100,
      sig: "s",
      tags: [
        ["d", `tl-tag-x-${slug}`],
        ["title", over.title],
        ["metric", "tag-membership"],
        ["observer", over.observer ?? HOUSE],
        ["source-tag", `39999:${TAG_AUTHOR}:${slug}`, TAG_AUTHOR, slug],
        ...(over.target ? [["tagging-target", over.target]] : []),
      ],
      content: JSON.stringify({ members: over.members }),
    },
    author: null,
    rank: null,
  };
}
const people = (observer = HOUSE) =>
  list({
    kind: 30392,
    title: "Verified Human",
    observer,
    members: [{ pubkey: PERSON, endorsements: 2, disputes: 0, score: 80 }],
  });
const accounts = (observer = HOUSE) =>
  list({
    kind: 30394,
    title: "Verified Human GitHub Accounts",
    observer,
    target: GITHUB,
    members: [{ address: ITEM, endorsements: 1, disputes: 0, score: 64 }],
  });
const notes = (observer = HOUSE) =>
  list({
    kind: 30393,
    title: "stoicism Notes",
    slug: "stoicism",
    observer,
    target: "1",
    members: [{ id: NOTE, endorsements: 1, disputes: 0, score: 40 }],
  });

beforeEach(() => {
  relay.asked = [];
  relay.answer = [];
  forgetTagLists();
});

describe("tagListsFromHits", () => {
  it("reads each kind's members: people by pubkey, notes by id, list items by address", () => {
    const lists = tagListsFromHits([people(), accounts(), notes()], HOUSE);
    expect(lists.map((l) => [l.kind, l.target, l.members.map((m) => [m.target, m.score])])).toEqual([
      [30392, "person", [[PERSON, 80]]],
      [30394, GITHUB, [[ITEM, 64]]],
      [30393, "1", [[NOTE, 40]]],
    ]);
    expect(lists[1]).toMatchObject({ tagKey: `${TAG_AUTHOR}|verified-human`, slug: "verified-human" });
  });

  it("keeps only the perspective's lists, and of a list sent twice the newest", () => {
    const older = { ...accounts(), event: { ...accounts().event, created_at: 1 } };
    const lists = tagListsFromHits([older, accounts(READER), accounts()], HOUSE);
    expect(lists).toHaveLength(1);
    expect(lists[0].observer).toBe(HOUSE);
  });

  it("skips a list of things that doesn't say what it's on, or whose members can't be read", () => {
    const unsaid = list({ kind: 30393, title: "stoicism Notes", slug: "stoicism", members: [] });
    const unread = { ...notes(), event: { ...notes().event, content: "not json" } };
    expect(tagListsFromHits([unsaid, unread], HOUSE)).toEqual([]);
  });
});

describe("tagNameOf", () => {
  it("is the people's list's title, or the first words of a list of things' title", () => {
    expect(tagNameOf(tagListsFromHits([accounts(), people()], HOUSE))).toBe("Verified Human");
    expect(tagNameOf(tagListsFromHits([accounts()], HOUSE))).toBe("Verified Human");
    expect(tagNameOf(tagListsFromHits([notes()], HOUSE))).toBe("stoicism");
  });
});

describe("mergePerspectives", () => {
  it("takes the reader's lists of a tag, and the house's of a tag they have none of", () => {
    const theirs = tagListsFromHits([notes(READER)], READER);
    const houses = tagListsFromHits([people(), accounts(), notes()], HOUSE);
    const merged = mergePerspectives(theirs, houses);
    expect(merged.map((l) => [l.title, l.observer])).toEqual([
      ["stoicism Notes", READER],
      ["Verified Human", HOUSE],
      ["Verified Human GitHub Accounts", HOUSE],
    ]);
  });
});

describe("fetchTagLists", () => {
  it("asks for the three kinds of list through the house's perspective, once per words", async () => {
    relay.answer = [people(), accounts()];
    const lists = await fetchTagLists("verified human", { pov: "nosfabrica" });
    await fetchTagLists("Verified Human ", { pov: "nosfabrica" });
    expect(relay.asked).toEqual([{ pov: "nosfabrica", kinds: [30392, 30393, 30394] }]);
    expect(lists.map((l) => l.title)).toEqual(["Verified Human", "Verified Human GitHub Accounts"]);
  });

  it("through the reader's own perspective, asks theirs beside the house's", async () => {
    relay.answer = [notes(READER), notes()];
    const lists = await fetchTagLists("stoicism", { pov: "mywot", userPubkey: READER });
    expect(relay.asked.map((a) => a.pov)).toEqual(["mywot", "nosfabrica"]);
    expect(lists.map((l) => l.observer)).toEqual([READER]);
  });
});
