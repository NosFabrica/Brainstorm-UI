// @vitest-environment jsdom
/**
 * A profile page's subject: the held copy at once — never a spinner in front
 * of a name the device knows — while the relays, the nprofile's hints among
 * them, are asked all the same, and a newer copy replaces it as it lands.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NostrEvent } from "nostr-tools";
import type { ReactNode } from "react";
import { eventStore } from "@/lib/eventStore";
import { __useCacheStore } from "@/lib/eventCache";

const refreshMock = vi.fn<(pubkey: string, opts: { relayHints?: string[] }) => Promise<NostrEvent | null>>(
  () => new Promise(() => {}), // the relays never finish
);
const profileMapMock = vi.fn(async () => new Map());
vi.mock("@/services/nostr", () => ({
  refreshProfileEvent: (pubkey: string, opts: { relayHints?: string[] }) => refreshMock(pubkey, opts),
  fetchProfileMap: () => profileMapMock(),
}));

import { useLiveProfile, useLiveProfiles } from "./useLiveProfile";

let n = 0;
const kind0 = (pubkey: string, created_at: number, name: string) =>
  ({ id: (++n).toString(16).padStart(64, "0"), kind: 0, pubkey, created_at, content: JSON.stringify({ name }), sig: "s", tags: [] }) as NostrEvent;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
  __useCacheStore(null);
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
  __useCacheStore(undefined);
});
beforeEach(() => vi.clearAllMocks());

describe("useLiveProfile", () => {
  it("shows the held copy at once, asks the relays with the hints anyway, and takes a newer one", async () => {
    const pk = "1".repeat(64);
    eventStore.add(kind0(pk, 100, "old name"));
    const { result } = renderHook(() => useLiveProfile(pk, ["wss://hint.example/"]), { wrapper });

    expect(result.current.profile?.name).toBe("old name");
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith(pk, { relayHints: ["wss://hint.example/"] }));

    act(() => {
      eventStore.add(kind0(pk, 200, "new name"));
    });
    await waitFor(() => expect(result.current.profile?.name).toBe("new name"));
  });

  it("is loading only while nothing at all is known", async () => {
    const pk = "2".repeat(64);
    const { result } = renderHook(() => useLiveProfile(pk), { wrapper });
    expect(result.current.loading).toBe(true);
    act(() => {
      eventStore.add(kind0(pk, 100, "first answer"));
    });
    await waitFor(() => expect(result.current.profile?.name).toBe("first answer"));
    expect(result.current.loading).toBe(false);
  });
});

describe("useLiveProfiles", () => {
  it("names held people at once, and renames them when a newer copy lands", async () => {
    const pk = "3".repeat(64);
    eventStore.add(kind0(pk, 100, "carol"));
    const { result } = renderHook(() => useLiveProfiles([pk]), { wrapper });
    expect(result.current.get(pk)?.name).toBe("carol");
    await waitFor(() => expect(profileMapMock).toHaveBeenCalled()); // still asked
    act(() => {
      eventStore.add(kind0(pk, 200, "carol (edited)"));
    });
    await waitFor(() => expect(result.current.get(pk)?.name).toBe("carol (edited)"));
  });
});
