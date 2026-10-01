import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHit, SearchParams, SearchSnapshot } from "@/services/search";

// The search relay is the boundary: what it is asked, and what it sends back.
const asked: Array<{ query: string; params: SearchParams }> = [];
let answer: SearchHit[] = [];
vi.mock("@/services/search", () => ({
  searchStream: (query: string, params: SearchParams, onSnapshot: (s: SearchSnapshot) => void) => {
    asked.push({ query, params });
    onSnapshot({ hits: answer, eose: true, timeMs: 1, error: null });
    return Object.assign(() => {}, { more: () => {} });
  },
}));
const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => Promise.resolve(HOUSE) }));

import { fetchSearchTags, forgetSearchTags } from "./searchTags";

// Shapes as wss://search.brainstorm.world sent them, 2026-10-01 (members trimmed).
const TAG_AUTHOR = "e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f";
const AJ = "3252715543f6e43be086465129b030d47d76cf8cead4798e48864563c3375083";
const TANJA = "b8a9df8218084e490d888342a9d488b7cf0fb20b1a19b963becd68ed6ab5cbbd";
const OTHER_OBSERVER = "dabe380b225adf262f3e2cf96460d4879b15fafd2f4325939600fc5c3b50a122";

function list(over: {
  id: string;
  observer?: string;
  metric?: string;
  created_at?: number;
  title?: string;
  slug?: string;
  content?: string;
}): SearchHit {
  const observer = over.observer ?? HOUSE;
  const slug = over.slug ?? "aos-2026-participant";
  return {
    event: {
      id: over.id.repeat(64).slice(0, 64),
      kind: 30392,
      pubkey: "78ed0837".padEnd(64, "0"),
      created_at: over.created_at ?? 1790526648,
      sig: "s",
      tags: [
        ["d", `tl-tag-${observer.slice(0, 8)}-${TAG_AUTHOR.slice(0, 8)}-${slug}`],
        ["title", over.title ?? "AOS 2026 Participant"],
        ["description", "a participant in the And Other Stuff (AOS) Convergence gathering"],
        ["metric", over.metric ?? "tag-membership"],
        ["observer", observer],
        ["source-tag", "6c5d88494c8142e4f8068fbf01fa10650f467dc16a8b5036ed1eb283ba32d141", TAG_AUTHOR, slug],
        ["p", AJ, "", "86"],
        ["p", TANJA, "", "73"],
      ],
      content:
        over.content ??
        JSON.stringify({
          members: [
            { pubkey: AJ, endorsements: 3, disputes: 0, score: 86 },
            { pubkey: TANJA, endorsements: 2, disputes: 0, score: 73 },
          ],
        }),
    },
    author: null,
    rank: null,
  };
}
const profile = (pubkey: string, name: string): SearchHit => ({
  event: { id: `p${pubkey.slice(0, 63)}`, kind: 0, pubkey, created_at: 1, sig: "s", tags: [], content: "{}" },
  author: { pubkey, npub: `npub${pubkey.slice(0, 6)}`, name } as SearchHit["author"],
  rank: null,
});

beforeEach(() => {
  asked.length = 0;
  answer = [];
  forgetSearchTags();
});

describe("fetchSearchTags — the tags a search matches, from the search relay", () => {
  it("asks the search relay for tag lists by the words, through the reader's perspective", async () => {
    answer = [list({ id: "a" })];
    await fetchSearchTags("aos", { pov: "nosfabrica" });
    expect(asked).toHaveLength(1);
    expect(asked[0].query).toBe("aos");
    expect(asked[0].params).toMatchObject({ pov: "nosfabrica", kinds: [30392] });
  });

  it("reads a list as a tag: its name, where it lives, and how many carry it", async () => {
    answer = [list({ id: "a" })];
    const [tag, ...rest] = await fetchSearchTags("aos", { pov: "nosfabrica" });
    expect(rest).toHaveLength(0);
    expect(tag).toMatchObject({
      name: "AOS 2026 Participant",
      authorPubkey: TAG_AUTHOR,
      slug: "aos-2026-participant",
      description: "a participant in the And Other Stuff (AOS) Convergence gathering",
      people: 2,
      unverified: false,
    });
    expect(tag.members).toEqual([
      { pubkey: AJ, endorsements: 3, disputes: 0, score: 86 },
      { pubkey: TANJA, endorsements: 2, disputes: 0, score: 73 },
    ]);
  });

  // A lists-only ask comes back with every observer's copy of the list.
  it("keeps only the list made for the perspective it asked through", async () => {
    answer = [list({ id: "b", observer: OTHER_OBSERVER, title: "Somebody else's AOS" }), list({ id: "a" })];
    const tags = await fetchSearchTags("aos", { pov: "nosfabrica" });
    expect(tags.map((t) => t.name)).toEqual(["AOS 2026 Participant"]);
  });

  it("reads through the viewer's own perspective when they chose it", async () => {
    answer = [list({ id: "b", observer: OTHER_OBSERVER, title: "Mine" }), list({ id: "a" })];
    const tags = await fetchSearchTags("aos", { pov: "mywot", userPubkey: OTHER_OBSERVER });
    expect(tags.map((t) => t.name)).toEqual(["Mine"]);
  });

  it("shows one tag once: the newest copy, and the full list over the pinned one", async () => {
    answer = [
      list({ id: "c", created_at: 100, title: "Old copy" }),
      list({ id: "a", created_at: 300, title: "Newest copy" }),
      list({ id: "d", created_at: 900, metric: "pinned-tag-membership", title: "Pinned" }),
      list({ id: "e", slug: "developer", title: "Developer" }),
    ];
    const tags = await fetchSearchTags("ao", { pov: "nosfabrica" });
    expect(tags.map((t) => t.name)).toEqual(["Newest copy", "Developer"]);
  });

  it("skips a list it cannot read rather than failing the search", async () => {
    answer = [list({ id: "x", content: "not json", slug: "broken" }), list({ id: "a" })];
    const tags = await fetchSearchTags("aos", { pov: "nosfabrica" });
    expect(tags.map((t) => t.slug)).toEqual(["aos-2026-participant"]);
  });

  it("asks nothing for fewer than two characters", async () => {
    expect(await fetchSearchTags("a", { pov: "nosfabrica" })).toEqual([]);
    expect(await fetchSearchTags("  ", { pov: "nosfabrica" })).toEqual([]);
    expect(asked).toHaveLength(0);
  });

  it("asks once for the same words and perspective", async () => {
    answer = [list({ id: "a" })];
    await fetchSearchTags("aos", { pov: "nosfabrica" });
    await fetchSearchTags("AOS ", { pov: "nosfabrica" });
    expect(asked).toHaveLength(1);
  });
});

describe("fetchSearchTags with members — the people a results page leads with", () => {
  it("asks for the lists and their people in one request, and attaches each profile to its member", async () => {
    answer = [profile("f".repeat(64), "AOS"), list({ id: "a" }), profile(AJ, "AJ"), profile(TANJA, "Tanja")];
    const [tag] = await fetchSearchTags("aos", { pov: "nosfabrica" }, { members: true });
    expect(asked[0].params.kinds).toEqual([0, 30392]);
    expect(tag.members.map((m) => m.profile?.name)).toEqual(["AJ", "Tanja"]);
  });

  it("is a different question from the lists-only one, asked separately", async () => {
    answer = [list({ id: "a" })];
    await fetchSearchTags("aos", { pov: "nosfabrica" });
    await fetchSearchTags("aos", { pov: "nosfabrica" }, { members: true });
    expect(asked).toHaveLength(2);
  });
});
