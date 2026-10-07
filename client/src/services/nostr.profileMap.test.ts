// @vitest-environment jsdom
/**
 * Who a card asks about its people. The search relay holds kind-0s for the
 * whole corpus and its socket is already open for the results, so the shared
 * author queue answers first — and with it, the device's own copy. The profile
 * relays remain the fallback for anyone the search relay has never seen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const wantProfileMock = vi.fn<(pubkey: string, onProfile: (p: NostrEvent) => void) => () => void>();
vi.mock("@/services/authorProfileQueue", () => ({
  wantProfile: (pubkey: string, onProfile: (p: NostrEvent) => void) => wantProfileMock(pubkey, onProfile),
}));
const loadReplaceableMock = vi.fn<() => Promise<NostrEvent | null>>(() => Promise.resolve(null));
// The fallback beyond the search relay: batched, de-duped and disk-cached by its own loader.
const loadElsewhereMock = vi.fn<(pubkey: string, timeoutMs?: number) => Promise<NostrEvent | undefined>>(() =>
  Promise.resolve(undefined),
);
vi.mock("@/lib/loaders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/loaders")>();
  return {
    ...actual,
    loadReplaceable: (...args: unknown[]) => loadReplaceableMock(...(args as [])),
    loadProfileElsewhere: (pubkey: string, timeoutMs?: number) => loadElsewhereMock(pubkey, timeoutMs),
  };
});
// The fallback: one batched kind-0 REQ to the profile relays.
const requestAllMock = vi.fn<(relays: string[], filter: unknown, timeoutMs: number) => Promise<NostrEvent[]>>(() =>
  Promise.resolve([]),
);
vi.mock("@/lib/relayRequest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relayRequest")>();
  return { ...actual, requestAll: (...args: unknown[]) => requestAllMock(...(args as [string[], unknown, number])) };
});
const warmMock = vi.fn();
vi.mock("@/lib/relayRouting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relayRouting")>();
  return { ...actual, warmRelayLists: (pubkeys: string[]) => warmMock(pubkeys) };
});
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getEvent: () => undefined, getReplaceable: () => undefined, add: (e: NostrEvent) => e },
}));

import { fetchProfileMap } from "./nostr";
import { SEARCH_RELAY } from "@/lib/relays";

const A = "a".repeat(64);
const B = "b".repeat(64);
const profile = (pubkey: string, name: string): NostrEvent =>
  ({
    id: `id-${pubkey}`,
    kind: 0,
    pubkey,
    tags: [],
    content: JSON.stringify({ name }),
    created_at: 1,
    sig: "s",
  }) as NostrEvent;

beforeEach(() => {
  vi.clearAllMocks();
  loadReplaceableMock.mockResolvedValue(null);
  requestAllMock.mockResolvedValue([]);
  loadElsewhereMock.mockResolvedValue(undefined);
});
const kind0Asks = () => requestAllMock.mock.calls.filter(([, f]) => (f as { kinds?: number[] }).kinds?.[0] === 0);

describe("fetchProfileMap", () => {
  it("takes the queue's answer and never troubles the profile relays for it", async () => {
    wantProfileMock.mockImplementation((pubkey, onProfile) => {
      onProfile(profile(pubkey, "answered"));
      return () => {};
    });

    const map = await fetchProfileMap([A]);
    expect(map.get(A)?.name).toBe("answered");
    // No kind-0 asked of the profile relays — which is the claim. The kind-10002
    // that also goes out is the routing warm (lib/relayRouting), not the
    // profile: a person on screen may be RSVPed to or vouched for a moment
    // later, and a relay-list lookup at THAT point is dead air before signing.
    const kindsAsked = loadReplaceableMock.mock.calls.map((call) => call[0]);
    expect(kindsAsked).not.toContain(0);
    expect(kind0Asks()).toHaveLength(0);
    expect(loadElsewhereMock).not.toHaveBeenCalled();
  });

  it("falls back to the profile relays for anyone the search relay has never seen — not the search relay again", async () => {
    wantProfileMock.mockImplementation(() => () => {});
    loadElsewhereMock.mockResolvedValue(profile(B, "elsewhere"));

    const map = await fetchProfileMap([B], 50);
    expect(map.get(B)?.name).toBe("elsewhere");
    expect(loadElsewhereMock).toHaveBeenCalledWith(B, 50);
    // Not the general loader, whose lookup set includes the search relay the queue already asked.
    expect(loadReplaceableMock.mock.calls.map((call) => call[0])).not.toContain(0);
  });

  it("looks beyond the search relay only — never at it again", async () => {
    const { PROFILE_RELAYS_BESIDES_SEARCH } = await vi.importActual<typeof import("@/lib/loaders")>("@/lib/loaders");
    expect(PROFILE_RELAYS_BESIDES_SEARCH.length).toBeGreaterThan(0);
    expect(PROFILE_RELAYS_BESIDES_SEARCH).not.toContain(SEARCH_RELAY);
  });

  it("moves on the moment the queue says it has nobody, rather than waiting out the clock", async () => {
    // The queue answers null for a key the search relay has never seen. Waiting
    // for the timeout instead put six seconds in front of every unknown author.
    wantProfileMock.mockImplementation((_pubkey, onProfile) => {
      onProfile(null);
      return () => {};
    });
    loadElsewhereMock.mockResolvedValue(profile(B, "elsewhere"));

    const started = Date.now();
    const map = await fetchProfileMap([B], 60_000);
    expect(map.get(B)?.name).toBe("elsewhere");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("asks the queue once per person, however many cards want them", async () => {
    wantProfileMock.mockImplementation((pubkey, onProfile) => {
      onProfile(profile(pubkey, "once"));
      return () => {};
    });

    await fetchProfileMap([A, A, A]);
    expect(wantProfileMock).toHaveBeenCalledTimes(1);
  });

  it("warms relay lists only when asked to — names alone fetch nothing of theirs next", async () => {
    wantProfileMock.mockImplementation((pubkey, onProfile) => {
      onProfile(profile(pubkey, "named"));
      return () => {};
    });
    await fetchProfileMap([A], 6000, { warm: false });
    expect(warmMock).not.toHaveBeenCalled();
    await fetchProfileMap([B]);
    expect(warmMock).toHaveBeenCalledWith([B]);
  });
});
