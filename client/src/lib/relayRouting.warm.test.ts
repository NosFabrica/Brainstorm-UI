/**
 * Pre-loading relay lists for whoever is on screen.
 *
 * This is what the durable cache is for. Routing is needed at the moment an
 * event is SIGNED, and at that moment there is no time to ask: a lookup then is
 * dead air before the signer prompt, and one that loses its race falls back to
 * the default relays — the publish succeeds and still misses the inbox of the
 * person it was for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const held = new Map<string, NostrEvent>();
const loadReplaceableMock = vi.fn(async () => undefined as NostrEvent | undefined);

vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (kind: number, pubkey: string) => held.get(`${kind}:${pubkey}`) },
}));
vi.mock("@/lib/loaders", () => ({ loadReplaceable: () => loadReplaceableMock() }));
vi.mock("@/lib/eventCache", () => ({ whenHydrated: () => Promise.resolve() }));
vi.mock("@/lib/relays", () => ({ PROFILE_RELAYS: ["wss://d/"], CONTENT_RELAYS: ["wss://d/"] }));

import { warmRelayLists, resetRelayRoutingCache } from "./relayRouting";

const pk = (i: number) => i.toString(16).padStart(64, "0");
const relayList = (pubkey: string): NostrEvent =>
  ({ id: "1".repeat(64), kind: 10002, pubkey, created_at: 1, tags: [["r", "wss://x"]], content: "", sig: "s" }) as NostrEvent;

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  held.clear();
  resetRelayRoutingCache();
  loadReplaceableMock.mockResolvedValue(undefined);
});

describe("warming the people on screen", () => {
  it("loads a relay list nobody has asked for yet", async () => {
    warmRelayLists([pk(1)]);
    await settle();

    expect(loadReplaceableMock).toHaveBeenCalledTimes(1);
  });

  /** Nothing may wait on it: it runs beside the render, not in front of it. */
  it("returns without waiting for the relays", () => {
    expect(warmRelayLists([pk(1)])).toBeUndefined();
  });

  it("does not ask again for someone already known", async () => {
    held.set(`10002:${pk(1)}`, relayList(pk(1)));

    warmRelayLists([pk(1)]);
    await settle();

    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });

  it("asks once for someone warmed twice", async () => {
    warmRelayLists([pk(1)]);
    warmRelayLists([pk(1)]);
    await settle();

    expect(loadReplaceableMock).toHaveBeenCalledTimes(1);
  });

  /** A feed names hundreds of authors; an `authors` array that long gets cut. */
  it("bounds how many one warm asks about", async () => {
    warmRelayLists(Array.from({ length: 400 }, (_, i) => pk(i)));
    await settle();

    expect(loadReplaceableMock.mock.calls.length).toBeLessThanOrEqual(100);
  });

  it("ignores anything that is not a pubkey", async () => {
    warmRelayLists(["", "nope", "ABC"]);
    await settle();

    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });

  it("never throws, whatever the relays do", async () => {
    loadReplaceableMock.mockRejectedValue(new Error("relays down"));

    expect(() => warmRelayLists([pk(1)])).not.toThrow();
    await settle();
  });
});
