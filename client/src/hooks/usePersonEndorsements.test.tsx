// @vitest-environment jsdom
/**
 * A person's "Followed by …" line, one server call per person and Perspective
 * per session — and per viewer: the "people you follow" half belongs to the
 * Active Account, so another Account signing in must not inherit it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const fetchMock = vi.fn(async (pubkey: string) => ({ pubkey, followedBy: [] }));
vi.mock("@/services/endorsements", () => ({
  fetchPersonEndorsements: (pubkey: string) => fetchMock(pubkey),
}));

import { accountChanged } from "@/lib/accountScoped";
import { usePersonEndorsements, __resetPersonEndorsementsCache } from "./usePersonEndorsements";

const PK = "a".repeat(64);

beforeEach(() => {
  fetchMock.mockClear();
  __resetPersonEndorsementsCache();
});

describe("usePersonEndorsements", () => {
  it("asks once per person, and again for the next Account", async () => {
    const first = renderHook(() => usePersonEndorsements(PK, true));
    await waitFor(() => expect(first.result.current).not.toBeNull());
    renderHook(() => usePersonEndorsements(PK, true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    accountChanged();
    const next = renderHook(() => usePersonEndorsements(PK, true));
    expect(next.result.current).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
