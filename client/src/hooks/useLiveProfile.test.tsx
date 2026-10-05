// @vitest-environment jsdom
/**
 * A profile page's subject: the held copy at once — never a spinner in front
 * of a name the device knows — while the relays, the nprofile's hints among
 * them, are asked all the same, and a newer copy replaces it as it lands.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
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

import { __resetAskedProfiles, useLiveProfile, useLiveProfiles } from "./useLiveProfile";

let n = 0;
const kind0 = (pubkey: string, created_at: number, name: string) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 0,
    pubkey,
    created_at,
    content: JSON.stringify({ name }),
    sig: "s",
    tags: [],
  }) as NostrEvent;

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
  __useCacheStore(null);
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
  __useCacheStore(undefined);
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  __resetAskedProfiles();
});

describe("useLiveProfile", () => {
  it("shows the held copy at once, asks the relays with the hints anyway, and takes a newer one", async () => {
    const pk = "1".repeat(64);
    eventStore.add(kind0(pk, 100, "old name"));
    const { result } = renderHook(() => useLiveProfile(pk, ["wss://hint.example/"]));

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
    const { result } = renderHook(() => useLiveProfile(pk));
    expect(result.current.loading).toBe(true);
    act(() => {
      eventStore.add(kind0(pk, 100, "first answer"));
    });
    await waitFor(() => expect(result.current.profile?.name).toBe("first answer"));
    expect(result.current.loading).toBe(false);
  });
});

describe("useLiveProfile asks", () => {
  it("settles to 'no profile' when the relays answer empty", async () => {
    const pk = "5".repeat(64);
    refreshMock.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useLiveProfile(pk));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBeUndefined();
  });

  it("asks again only after 10–15 minutes, for someone it found", async () => {
    const pk = "6".repeat(64);
    eventStore.add(kind0(pk, 100, "erin"));
    refreshMock.mockResolvedValue(null);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);

    renderHook(() => useLiveProfile(pk)).unmount();
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    clock.mockReturnValue(now + 10 * 60_000 - 1);
    renderHook(() => useLiveProfile(pk)).unmount();
    expect(refreshMock).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(now + 15 * 60_000);
    renderHook(() => useLiveProfile(pk)).unmount();
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("joins an ask already out instead of sending a second", async () => {
    const pk = "7".repeat(64);
    let answer!: (e: NostrEvent | null) => void;
    refreshMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const first = renderHook(() => useLiveProfile(pk));
    const second = renderHook(() => useLiveProfile(pk));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(second.result.current.loading).toBe(true);

    await act(async () => answer(null));
    expect(first.result.current.loading).toBe(false);
    expect(second.result.current.loading).toBe(false);
  });
});

describe("useLiveProfiles", () => {
  it("names held people at once, and renames them when a newer copy lands", async () => {
    const pk = "3".repeat(64);
    eventStore.add(kind0(pk, 100, "carol"));
    const { result } = renderHook(() => useLiveProfiles([pk]));
    expect(result.current.get(pk)?.name).toBe("carol");
    await waitFor(() => expect(profileMapMock).toHaveBeenCalled()); // still asked
    act(() => {
      eventStore.add(kind0(pk, 200, "carol (edited)"));
    });
    await waitFor(() => expect(result.current.get(pk)?.name).toBe("carol (edited)"));
  });

  it("asks once for someone every list on the page shows", async () => {
    const pk = "4".repeat(64);
    eventStore.add(kind0(pk, 100, "dave"));
    renderHook(() => useLiveProfiles([pk]));
    await waitFor(() => expect(profileMapMock).toHaveBeenCalledTimes(1));
    renderHook(() => useLiveProfiles([pk]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(profileMapMock).toHaveBeenCalledTimes(1);
  });

  it("a second list joins an ask already out, and names the person when it answers", async () => {
    const pk = "8".repeat(64);
    let answer!: (m: Map<string, unknown>) => void;
    profileMapMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    renderHook(() => useLiveProfiles([pk]));
    const second = renderHook(() => useLiveProfiles([pk]));
    expect(profileMapMock).toHaveBeenCalledTimes(1);

    await act(async () => answer(new Map([[pk, { name: "frank" }]])));
    expect(second.result.current.get(pk)?.name).toBe("frank");
  });
});
