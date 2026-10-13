// @vitest-environment jsdom
/**
 * The events an activity names, by id or address. An address is a `d` tag of
 * anything — commas and bars included — and a key some clients upper-case: it
 * must still find its event. The authors' profiles are asked once the events
 * are in, not again as each one arrives.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import type { MinimalEvent } from "@/lib/noteRefs";

const PK = "a".repeat(64);
const relayAddresses = new Map<string, MinimalEvent>();
const relayEvents = new Map<string, MinimalEvent>();
const askedAddrs: { kind: number; pubkey: string; identifier: string }[][] = [];
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[]) => {
    // Answers land one at a time, as relays answer.
    const out: MinimalEvent[] = [];
    for (const id of ids) {
      const e = relayEvents.get(id);
      if (!e) continue;
      eventStore.add({ ...e, sig: "s" } as NostrEvent);
      out.push(e);
      await new Promise((r) => setTimeout(r, 5));
    }
    return out;
  },
  fetchAddressableEvents: async (addrs: { kind: number; pubkey: string; identifier: string }[]) => {
    askedAddrs.push(addrs);
    return new Map(
      addrs
        .map((a) => [
          `${a.kind}:${a.pubkey}:${a.identifier}`,
          relayAddresses.get(`${a.kind}:${a.pubkey}:${a.identifier}`),
        ])
        .filter((e): e is [string, MinimalEvent] => !!e[1]),
    );
  },
}));
const profileAsks: string[] = [];
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfiles: (pubkeys: string[]) => {
    profileAsks.push([...pubkeys].sort().join(","));
    return new Map();
  },
}));

import { useRefEvents } from "./useRefEvents";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

const addressable = (d: string, pubkey = PK): MinimalEvent => ({
  id: `${d.length.toString(16)}${"0".repeat(63)}`.slice(0, 64),
  pubkey,
  kind: 30023,
  created_at: 100,
  tags: [["d", d]],
  content: d,
});

describe("useRefEvents", () => {
  it("finds an address whose `d` holds commas and bars", async () => {
    const d = "a,b|c,,|";
    relayAddresses.set(`30023:${PK}:${d}`, addressable(d));
    const refs = [{ addr: `30023:${PK}:${d}`, relay: "wss://r.example" }, { addr: `30023:${PK}:plain` }];
    const { result } = renderHook(() => useRefEvents(refs));
    await waitFor(() => expect(result.current.get({ addr: `30023:${PK}:${d}` })?.content).toBe(d));
    // Asked as one address, its `d` whole.
    expect(askedAddrs.at(-1)?.map((a) => a.identifier)).toEqual([d, "plain"]);
  });

  it("finds an address named with an upper-case key", async () => {
    const d = "upper";
    relayAddresses.set(`30023:${PK}:${d}`, addressable(d));
    const refs = [{ addr: `30023:${PK.toUpperCase()}:${d}` }];
    const { result } = renderHook(() => useRefEvents(refs));
    await waitFor(() => expect(result.current.get(refs[0])?.content).toBe(d));
  });

  it("asks for the authors' profiles once the events are in, not as each arrives", async () => {
    const authors = ["1", "2", "3"].map((c) => c.repeat(64));
    const ids = ["4", "5", "6"].map((c) => c.repeat(64));
    ids.forEach((id, i) =>
      relayEvents.set(id, { id, pubkey: authors[i], kind: 1, created_at: 100, tags: [], content: `note ${i}` }),
    );
    profileAsks.length = 0;
    const refs = ids.map((id) => ({ id }));
    const { result } = renderHook(() => useRefEvents(refs));
    await waitFor(() => expect(result.current.settled).toBe(true));
    await waitFor(() => expect(profileAsks.at(-1)).toBe([...authors].sort().join(",")));
    // Nothing asked for one or two authors on the way.
    const asked = new Set(profileAsks.filter(Boolean));
    expect([...asked]).toEqual([[...authors].sort().join(",")]);
  });
});
