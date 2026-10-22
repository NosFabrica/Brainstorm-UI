import { beforeEach, describe, expect, it, vi } from "vitest";

// A town's or an area's events: NIP-52 events and Event Index's list items
// (config/events), in one ask, one event once (lib/eventDedupe).
const asked = vi.hoisted(() => ({ filters: [] as unknown[], answer: [] as unknown[] }));
vi.mock("@/services/nostr", () => ({
  fetchFromSearchRelayByFilters: async (filters: unknown[]) => {
    asked.filters = filters;
    return asked.answer;
  },
}));

import { fetchAreaEvents, fetchTownEvents } from "./townEvents";
import { EVENT_LISTS } from "@/config/events";

const INDEX = "c".repeat(64);
const AGG = "a".repeat(64);
const item = (id: string, start: number, title: string, copies: string[] = []) => ({
  id,
  kind: 39999,
  pubkey: INDEX,
  created_at: 1,
  content: "",
  tags: [
    ["d", `luma:${id}`],
    ["title", title],
    ["start", String(start)],
    ["i", `https://luma.com/${id}`],
    ...copies.map((a) => ["a", a, "", "copy"]),
  ],
});
const nip52 = (id: string, d: string, start: number, title: string) => ({
  id,
  kind: 31923,
  pubkey: AGG,
  created_at: 1,
  content: "",
  tags: [
    ["d", d],
    ["title", title],
    ["start", String(start)],
  ],
});

beforeEach(() => {
  asked.filters = [];
  asked.answer = [];
});

describe("townEvents", () => {
  it("asks the town's name of the NIP-52 events and of the Events lists' items alike", async () => {
    await fetchTownEvents("austin");
    expect(asked.filters).toEqual([
      { kinds: [31922, 31923], search: "austin", limit: 100 },
      { kinds: [39999], "#z": [...EVENT_LISTS], search: "austin", limit: 100 },
    ]);
  });

  it("asks an area's cells of both, and hands back one event once", async () => {
    asked.answer = [
      nip52("n1", "ev-1", 1_800_000_000, "Bitcoin & Coffee"),
      item("i1", 1_800_000_000, "Bitcoin & Coffee", [`31923:${AGG}:ev-1`]),
      item("i1", 1_800_000_000, "Bitcoin & Coffee", [`31923:${AGG}:ev-1`]), // the same item, two relays
      nip52("n2", "ev-2", 1_800_090_000, "Lightning Workshop"),
    ];
    const got = await fetchAreaEvents(["dqcjr", "dqcjq"], null);
    expect(asked.filters).toEqual([
      { kinds: [31922, 31923], "#g": ["dqcjr", "dqcjq"], limit: 200 },
      { kinds: [39999], "#z": [...EVENT_LISTS], "#g": ["dqcjr", "dqcjq"], limit: 200 },
    ]);
    expect(got.map((e) => e.id)).toEqual(["i1", "n2"]);
  });
});
