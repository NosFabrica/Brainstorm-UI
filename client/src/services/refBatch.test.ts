import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchIds = vi.hoisted(() => vi.fn((_ids: string[], _relays?: string[]) => Promise.resolve([])));
const fetchAddrs = vi.hoisted(() => vi.fn((_coords: unknown[]) => Promise.resolve(new Map())));
vi.mock("@/services/nostr", () => ({ fetchEventsByIds: fetchIds, fetchAddressableEvents: fetchAddrs }));

import { fetchRefBatched } from "./refBatch";
import { PROFILE_RELAYS } from "@/lib/relays";

const PK = "a".repeat(64);

beforeEach(() => {
  fetchIds.mockClear();
  fetchAddrs.mockClear();
});

describe("fetchRefBatched", () => {
  it("asks for a page's refs in one ask by id and one by address", async () => {
    await Promise.all([
      fetchRefBatched({ id: "1".repeat(64), relay: "wss://hint.example" }),
      fetchRefBatched({ id: "2".repeat(64) }),
      fetchRefBatched({ addr: `30023:${PK}:one` }),
      fetchRefBatched({ addr: `30023:${PK}:two`, relay: "wss://author.example" }),
    ]);
    expect(fetchIds).toHaveBeenCalledTimes(1);
    expect(fetchIds.mock.calls[0][0]).toEqual(["1".repeat(64), "2".repeat(64)]);
    // A hint is asked beside the default relays, never instead of them.
    expect(fetchIds.mock.calls[0][1]).toEqual(["wss://hint.example", ...PROFILE_RELAYS]);
    expect(fetchAddrs).toHaveBeenCalledTimes(1);
    expect(fetchAddrs.mock.calls[0][0]).toEqual([
      { kind: 30023, pubkey: PK, identifier: "one", relays: undefined },
      { kind: 30023, pubkey: PK, identifier: "two", relays: ["wss://author.example"] },
    ]);
  });

  it("hands each ask its own event", async () => {
    const note = { id: "3".repeat(64), kind: 1, pubkey: PK, tags: [], content: "x", created_at: 1, sig: "s" };
    fetchIds.mockResolvedValueOnce([note] as never);
    const [mine, other] = await Promise.all([
      fetchRefBatched({ id: note.id }),
      fetchRefBatched({ id: "4".repeat(64) }),
    ]);
    expect(mine).toEqual([note]);
    expect(other).toEqual([]);
  });

  it("asks nothing for a ref that names nothing", async () => {
    expect(await fetchRefBatched({ addr: "not-an-address" })).toEqual([]);
    expect(fetchIds).not.toHaveBeenCalled();
    expect(fetchAddrs).not.toHaveBeenCalled();
  });
});
