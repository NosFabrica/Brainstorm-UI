// @vitest-environment jsdom
/**
 * Notes on the search page showed "@nprofile1q…", "Replying to @someone" and
 * "↳ quoted note" (2026-09-07) because search knew only the hit's author. The
 * profile page had the recipe — collect what the notes refer to, fetch the
 * quoted events and every mentioned profile once, store-first. This hook IS
 * that recipe, shared, so both pages name who a note mentions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import type { ReactNode } from "react";
import type { MinimalEvent } from "@/lib/noteRefs";

const AUTHOR = "a".repeat(64);
const QUOTER = "b".repeat(64);
const CAROL = "c".repeat(64);
const DAVE = "d".repeat(64);
const QUOTED_ID = "e".repeat(64);
const PARENT_ID = "f".repeat(64);
const NAMES: Record<string, string> = { [AUTHOR]: "alice", [QUOTER]: "quoter", [CAROL]: "carol", [DAVE]: "dave" };

const profileMapMock = vi.fn(async (pks: string[]) => new Map(pks.filter((pk) => NAMES[pk]).map((pk) => [pk, { name: NAMES[pk] }])));
const eventsByIdsMock = vi.fn(async (ids: string[]) =>
  ids.includes(QUOTED_ID)
    ? [{ id: QUOTED_ID, kind: 1, pubkey: QUOTER, content: `hello nostr:${nip19.npubEncode(DAVE)}`, tags: [], created_at: 1 }]
    : [],
);
const addrMock = vi.fn(async () => new Map());
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: (pks: string[]) => profileMapMock(pks),
  fetchEventsByIds: (ids: string[]) => eventsByIdsMock(ids),
  fetchAddressableEvents: () => addrMock(),
}));

import { useNoteRefs } from "./useNoteRefs";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const note: MinimalEvent = {
  id: "1".repeat(64),
  kind: 1,
  pubkey: AUTHOR,
  content: `Yo quiero nostr:${nip19.nprofileEncode({ pubkey: CAROL })} nostr:${nip19.neventEncode({ id: QUOTED_ID })}`,
  tags: [["e", PARENT_ID, "", "reply"], ["p", DAVE]],
  created_at: 1,
};

beforeEach(() => {
  profileMapMock.mockClear();
  eventsByIdsMock.mockClear();
});

describe("useNoteRefs", () => {
  it("a note's mention, reply target and quote all resolve — the quote's author included", async () => {
    const { result } = renderHook(() => useNoteRefs([note]), { wrapper });
    await waitFor(() => expect(result.current.eventsById.get(QUOTED_ID)?.pubkey).toBe(QUOTER));
    await waitFor(() => expect(result.current.profiles.get(QUOTER)?.name).toBe("quoter"));
    expect(result.current.profiles.get(CAROL)?.name).toBe("carol");
    expect(result.current.profiles.get(DAVE)?.name).toBe("dave");
  });

  it("nothing to resolve asks the relays for nothing", async () => {
    const { result } = renderHook(() => useNoteRefs([]), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.profiles.size).toBe(0);
    expect(profileMapMock).not.toHaveBeenCalled();
    expect(eventsByIdsMock).not.toHaveBeenCalled();
  });

  it("extra pubkeys — a bio's mentions — ride along in the one profile fetch", async () => {
    const { result } = renderHook(() => useNoteRefs([], { extraPubkeys: [DAVE] }), { wrapper });
    await waitFor(() => expect(result.current.profiles.get(DAVE)?.name).toBe("dave"));
    expect(profileMapMock).toHaveBeenCalledTimes(1);
  });
});
