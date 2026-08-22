import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const fetchContactList = vi.fn(async (): Promise<unknown> => null);
const fetchOutboxRelayList = vi.fn(async () => undefined);
const createdInApp = vi.fn(() => false);

vi.mock("@/services/socialActions", () => ({
  fetchContactList: (...a: unknown[]) => fetchContactList(...(a as [])),
}));
vi.mock("@/services/nostr", () => ({
  fetchOutboxRelayList: (...a: unknown[]) => fetchOutboxRelayList(...(a as [])),
}));
vi.mock("@/accounts/display", () => ({
  identityHas: () => createdInApp(),
}));

import { useVerifiedNoFollows } from "./useVerifiedNoFollows";
import { knownFollowCount, recordFollowList } from "@/lib/followStore";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);

const listEvent = (pubkeys: string[]) => ({
  pubkey: ME,
  kind: 3,
  tags: pubkeys.map((pk) => ["p", pk]),
  content: "",
  created_at: 100,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  createdInApp.mockReturnValue(false);
  fetchContactList.mockResolvedValue(null);
});

describe("useVerifiedNoFollows", () => {
  it("answers has-follows from the floor without touching the network", () => {
    recordFollowList(ME, listEvent([OTHER]) as never, { authoritative: true });

    const { result } = renderHook(() => useVerifiedNoFollows(ME), { wrapper });

    expect(result.current).toBe("has-follows");
    expect(fetchContactList).not.toHaveBeenCalled();
  });

  it("answers none for a key minted in this app, without touching the network", () => {
    createdInApp.mockReturnValue(true);

    const { result } = renderHook(() => useVerifiedNoFollows(ME), { wrapper });

    expect(result.current).toBe("none");
    expect(fetchContactList).not.toHaveBeenCalled();
  });

  it("finds the list on relays, repairs the floor, and answers has-follows", async () => {
    fetchContactList.mockResolvedValue(listEvent([OTHER]));

    const { result } = renderHook(() => useVerifiedNoFollows(ME), { wrapper });

    expect(result.current).toBe("checking");
    await waitFor(() => expect(result.current).toBe("has-follows"));
    expect(knownFollowCount(ME)).toBe(1); // the floor grew — AutoScoreReturning can act
  });

  it("warms the outbox list before reading, so the real write relays are asked", async () => {
    const { result } = renderHook(() => useVerifiedNoFollows(ME), { wrapper });

    await waitFor(() => expect(result.current).toBe("none"));
    expect(fetchOutboxRelayList).toHaveBeenCalledWith(ME);
    const warmOrder = fetchOutboxRelayList.mock.invocationCallOrder[0];
    const readOrder = fetchContactList.mock.invocationCallOrder[0];
    expect(warmOrder).toBeLessThan(readOrder);
  });

  it("settles on none when relays have nothing — the commit guard is the backstop", async () => {
    const { result } = renderHook(() => useVerifiedNoFollows(ME), { wrapper });

    await waitFor(() => expect(result.current).toBe("none"));
    expect(knownFollowCount(ME)).toBe(0);
  });
});
