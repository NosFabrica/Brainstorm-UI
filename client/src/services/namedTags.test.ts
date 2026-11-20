import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";

/** The tags a search's words name outright, and what carries each: a tab of their own in All's row. */

const VH_AUTHOR = "b".repeat(64);
const STOIC_AUTHOR = "c".repeat(64);
const relay = vi.hoisted(() => ({ asked: [] as Record<string, unknown>[], headers: [] as NostrEvent[] }));
const lists = vi.hoisted(() => ({ tags: [] as Array<{ authorPubkey: string; slug: string; name: string }> }));
const detail = vi.hoisted(() => ({
  of: new Map<string, { name: string; carriers: string[]; status?: string }>(),
  notes: new Map<string, Array<{ id?: string; address?: string }>>(),
}));

vi.mock("@/services/searchTags", () => ({ fetchSearchTags: async () => lists.tags }));
const tagLists = vi.hoisted(() => ({ lists: [] as unknown[] }));
vi.mock("@/services/tagLists", async (actual) => ({
  ...(await actual<typeof import("@/services/tagLists")>()),
  fetchTagLists: async () => tagLists.lists,
}));
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: async (filter: Record<string, unknown>) => {
    relay.asked.push(filter);
    return relay.headers;
  },
  fetchEventsByIds: async () => [],
}));
vi.mock("@/services/tags", () => ({
  fetchTagDetail: async (author: string, slug: string) => {
    const d = detail.of.get(`${author}|${slug}`);
    return {
      status: d?.status ?? (d ? "ok" : "absent"),
      tag: { authorPubkey: author, slug, name: d?.name ?? slug },
      carriers: (d?.carriers ?? []).map((pubkey) => ({ pubkey, applications: 1, addedAt: 1 })),
    };
  },
  fetchTagNotes: async (author: string, slug: string) =>
    (detail.notes.get(`${author}|${slug}`) ?? []).map((t) => ({ ...t, applications: 1, addedAt: 1, relays: [] })),
}));

const header = (author: string, slug: string): NostrEvent =>
  ({
    id: "1".repeat(64),
    kind: 39999,
    pubkey: "d".repeat(64),
    created_at: 1,
    content: "",
    sig: "s",
    tags: [
      ["d", `tagging:${slug}-tagging`],
      ["a", `39999:${author}:${slug}`],
    ],
  }) as NostrEvent;

beforeEach(async () => {
  relay.asked = [];
  relay.headers = [];
  lists.tags = [];
  tagLists.lists = [];
  detail.of.clear();
  detail.notes.clear();
  (await import("./namedTags")).forgetNamedTags();
});

describe("fetchNamedTags", () => {
  it("finds a tag by its people's list, and holds its people and the things carrying it", async () => {
    lists.tags = [{ authorPubkey: VH_AUTHOR, slug: "verified-human", name: "Verified Human" }];
    detail.of.set(`${VH_AUTHOR}|verified-human`, { name: "Verified Human", carriers: ["e".repeat(64)] });
    detail.notes.set(`${VH_AUTHOR}|verified-human`, [{ address: `39999:${"f".repeat(64)}:vcavallo` }]);
    const { fetchNamedTags } = await import("./namedTags");

    const [tag] = await fetchNamedTags("verified human", { pov: "nosfabrica" });
    expect(tag).toMatchObject({ name: "Verified Human", people: [{ pubkey: "e".repeat(64) }] });
    expect(tag.things).toEqual([expect.objectContaining({ address: `39999:${"f".repeat(64)}:vcavallo` })]);
  });

  it("finds a tag only things carry by its taggings header, asked of the search relay by the words", async () => {
    relay.headers = [header(STOIC_AUTHOR, "stoicism")];
    detail.of.set(`${STOIC_AUTHOR}|stoicism`, { name: "stoicism", carriers: [] });
    detail.notes.set(`${STOIC_AUTHOR}|stoicism`, [{ id: "2".repeat(64) }]);
    const { fetchNamedTags } = await import("./namedTags");

    const tags = await fetchNamedTags("stoicism", { pov: "nosfabrica" });
    expect(relay.asked[0]).toMatchObject({
      kinds: [39999],
      "#z": Z_HANDLE_PUBKEYS.map((pk) => `39998:${pk}:tagging-with-specific-tag`),
      search: "stoicism include:spam",
    });
    expect(tags.map((t) => [t.name, t.things.length])).toEqual([["stoicism", 1]]);
  });

  it("is only a tag the words name outright, and one something carries", async () => {
    // "stoic" finds Stoicism's header, but doesn't name the tag.
    relay.headers = [header(STOIC_AUTHOR, "stoicism")];
    detail.of.set(`${STOIC_AUTHOR}|stoicism`, { name: "stoicism", carriers: [] });
    detail.notes.set(`${STOIC_AUTHOR}|stoicism`, [{ id: "2".repeat(64) }]);
    const { fetchNamedTags } = await import("./namedTags");
    expect(await fetchNamedTags("stoic", { pov: "nosfabrica" })).toEqual([]);

    // Named, but nothing the perspective counts carries it.
    lists.tags = [{ authorPubkey: VH_AUTHOR, slug: "verified-human", name: "Verified Human" }];
    detail.of.set(`${VH_AUTHOR}|verified-human`, { name: "Verified Human", carriers: [] });
    expect(await fetchNamedTags("verified human", { pov: "nosfabrica" })).toEqual([]);
  });

  it("reads a tag the lists hold from its lists alone: people and things, best first, no tagging read", async () => {
    const tag = {
      tagKey: `${VH_AUTHOR}|verified-human`,
      authorPubkey: VH_AUTHOR,
      slug: "verified-human",
      observer: "h",
    };
    tagLists.lists = [
      {
        ...tag,
        kind: 30392,
        title: "Verified Human",
        target: "person",
        members: [{ target: "e".repeat(64), score: 80 }],
      },
      {
        ...tag,
        kind: 30394,
        title: "Verified Human GitHub Accounts",
        target: `39998:${"f".repeat(64)}:github-accounts`,
        members: [{ target: `39999:${"f".repeat(64)}:vcavallo`, score: 64 }],
      },
      // Named by the relay for "verified", but not a tag the words name.
      {
        ...tag,
        tagKey: "x|verified-podcaster",
        slug: "verified-podcaster",
        kind: 30392,
        title: "Verified Podcaster",
        target: "person",
        members: [{ target: "1".repeat(64), score: 9 }],
      },
    ];
    lists.tags = [{ authorPubkey: VH_AUTHOR, slug: "verified-human", name: "Verified Human" }];
    const { fetchNamedTags } = await import("./namedTags");

    const tags = await fetchNamedTags("verified human", { pov: "nosfabrica" });
    expect(tags).toEqual([
      expect.objectContaining({
        name: "Verified Human",
        people: [{ pubkey: "e".repeat(64), rank: 80 }],
        things: [{ address: `39999:${"f".repeat(64)}:vcavallo`, rank: 64, relays: [] }],
      }),
    ]);
    expect(relay.asked).toEqual([]);
  });
});
