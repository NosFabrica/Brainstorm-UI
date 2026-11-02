import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";

/**
 * A page of results' tags, in one pass: a note by id, a list item by its coordinate, a person by
 * pubkey — what a search's tag filters read (hooks/useResultTags).
 */

const TAG_AUTHOR = "b".repeat(64);
const HEADER_AUTHOR = "c".repeat(64);
const TAGGER = "d".repeat(64);
const LISTER = "e".repeat(64);
const PERSON = "f".repeat(64);
const NOTE = "1".repeat(64);
const ITEM = `39999:${LISTER}:vcavallo`;
const NS = Z_HANDLE_PUBKEYS[0];

const relay = vi.hoisted(() => ({ asked: [] as Record<string, unknown>[] }));

let n = 0;
const ev = (pubkey: string, tags: string[][], content = ""): NostrEvent =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 39999,
    pubkey,
    created_at: 100 + n,
    tags,
    content,
    sig: "s",
  }) as NostrEvent;

const element = ev(
  TAG_AUTHOR,
  [
    ["d", "verified-human"],
    ["z", `39998:${NS}:tag`],
  ],
  JSON.stringify({ tag: { slug: "verified-human", name: "Verified Human" } }),
);
const header = ev(HEADER_AUTHOR, [
  ["d", "tagging:verified-human-tagging"],
  ["z", `39998:${NS}:tagging-with-specific-tag`],
  ["a", `39999:${TAG_AUTHOR}:verified-human`],
]);
const onItem = ev(TAGGER, [
  ["d", "event-tag-verified-human-x"],
  ["a", ITEM],
  ["z", `39998:${NS}:nostr-event-tag`],
  ["z", `39999:${HEADER_AUTHOR}:tagging:verified-human-tagging`],
  ["polarity", "1"],
]);
const onPerson = ev(TAGGER, [
  ["d", "profile-tag-verified-human-y"],
  ["p", PERSON],
  ["a", `39999:${TAG_AUTHOR}:verified-human`],
  ["z", `39998:${NS}:nostr-user-tag`],
  ["polarity", "1"],
]);

const has = (f: Record<string, unknown>, key: string, value: string) =>
  Array.isArray(f[key]) && (f[key] as string[]).includes(value);

vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: async (filter: Record<string, unknown>) => {
    relay.asked.push(filter);
    if (has(filter, "#a", ITEM)) return [onItem];
    if (has(filter, "#p", PERSON)) return [onPerson];
    if (has(filter, "#d", "tagging:verified-human-tagging")) return [header];
    if (has(filter, "#d", "verified-human")) return [element];
    return [];
  },
  fetchProfileMap: async () => new Map(),
  hasLocalSecretKey: () => false,
  publishRelaysFor: async () => [],
  publishToRelays: async () => ({ success: true }),
  pool: { publish: async () => [] },
}));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => null,
  requireActiveAccount: () => null,
  signAs: async (_a: unknown, t: unknown) => t,
}));
// Everyone counts: the trust read is services/tags' own business, tested elsewhere.
vi.mock("@/config/tagging", async (original) => {
  const real = await original<typeof import("@/config/tagging")>();
  return {
    ...real,
    tagRelays: () => ["wss://hub.example"],
    TRUST_SETTINGS: { ...real.TRUST_SETTINGS, mode: "everyone" },
  };
});
vi.mock("./trustSource", () => ({
  resolveHouseObserver: async () => "a".repeat(64),
  resolveTrustSource: async () => null,
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { getByFilters: () => [], getReplaceable: () => undefined } }));

beforeEach(() => {
  relay.asked = [];
  vi.resetModules();
});

describe("fetchEventTagsBatch", () => {
  it("asks a list item by its coordinate and a note by its id, and answers each by what it was asked", async () => {
    const { fetchEventTagsBatch } = await import("./tags");
    const tags = await fetchEventTagsBatch([NOTE, ITEM]);

    expect(relay.asked).toContainEqual(expect.objectContaining({ "#e": [NOTE] }));
    expect(relay.asked).toContainEqual(expect.objectContaining({ "#a": [ITEM] }));
    expect([...tags.keys()]).toEqual([ITEM]);
    expect(tags.get(ITEM)?.tags).toEqual([
      expect.objectContaining({ name: "Verified Human", applications: 1, counted: true }),
    ]);
  });

  it("leaves out a target too long for the hub, which would fail the whole request", async () => {
    const { fetchEventTagsBatch } = await import("./tags");
    const long = `30023:${LISTER}:https://example.com/${"x".repeat(300)}`;
    const tags = await fetchEventTagsBatch([ITEM, long]);

    expect(relay.asked.some((f) => has(f, "#a", long))).toBe(false);
    expect(tags.get(ITEM)?.tags[0]?.name).toBe("Verified Human");
  });
});

describe("fetchProfileTagsBatch", () => {
  it("asks every person in one request and answers each as their profile would", async () => {
    const { fetchProfileTagsBatch } = await import("./tags");
    const other = "9".repeat(64);
    const tags = await fetchProfileTagsBatch([PERSON, other, "not-a-pubkey"]);

    expect(relay.asked.filter((f) => Array.isArray(f["#p"]))).toEqual([
      expect.objectContaining({ "#p": [PERSON, other] }),
    ]);
    expect([...tags.keys()]).toEqual([PERSON]);
    expect(tags.get(PERSON)?.tags).toEqual([expect.objectContaining({ name: "Verified Human", counted: true })]);
  });
});
