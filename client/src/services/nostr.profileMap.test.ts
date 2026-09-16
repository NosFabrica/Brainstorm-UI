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
vi.mock("@/lib/loaders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/loaders")>();
  return { ...actual, loadReplaceable: (...args: unknown[]) => loadReplaceableMock(...(args as [])) };
});
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getEvent: () => undefined, getReplaceable: () => undefined, add: (e: NostrEvent) => e },
}));

import { fetchProfileMap } from "./nostr";

const A = "a".repeat(64);
const B = "b".repeat(64);
const profile = (pubkey: string, name: string): NostrEvent =>
  ({ id: `id-${pubkey}`, kind: 0, pubkey, tags: [], content: JSON.stringify({ name }), created_at: 1, sig: "s" }) as NostrEvent;

beforeEach(() => {
  vi.clearAllMocks();
  loadReplaceableMock.mockResolvedValue(null);
});

describe("fetchProfileMap", () => {
  it("takes the queue's answer and never troubles the profile relays for it", async () => {
    wantProfileMock.mockImplementation((pubkey, onProfile) => {
      onProfile(profile(pubkey, "answered"));
      return () => {};
    });

    const map = await fetchProfileMap([A]);
    expect(map.get(A)?.name).toBe("answered");
    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });

  it("falls back to the profile relays for anyone the search relay has never seen", async () => {
    wantProfileMock.mockImplementation(() => () => {});
    loadReplaceableMock.mockResolvedValue(profile(B, "elsewhere"));

    const map = await fetchProfileMap([B], 50);
    expect(map.get(B)?.name).toBe("elsewhere");
    expect(loadReplaceableMock).toHaveBeenCalled();
  });

  it("asks the queue once per person, however many cards want them", async () => {
    wantProfileMock.mockImplementation((pubkey, onProfile) => {
      onProfile(profile(pubkey, "once"));
      return () => {};
    });

    await fetchProfileMap([A, A, A]);
    expect(wantProfileMock).toHaveBeenCalledTimes(1);
  });
});
