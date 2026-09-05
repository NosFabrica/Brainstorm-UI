// @vitest-environment jsdom
/**
 * Browse is a tab with no words (?t=notes). Its filters must work like any
 * search's — Google's tools work for everyone, signed in or not — and live
 * in the URL so Back, reload and a shared link keep them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SearchSnapshot } from "@/services/search";

const streamMock = vi.fn();
let allStreams: { query: string; params: { tab?: string; limit?: number }; cb: (s: SearchSnapshot) => void }[] = [];
const isPanelProbe = (q: string, p?: { tab?: string; limit?: number }) =>
  q.startsWith("#") || (p?.tab === "apps" && p?.limit === 6) || (p?.tab === "events" && p?.limit === 60);
const mainStreamCalls = () => streamMock.mock.calls.filter(([q, p]) => !isPanelProbe(String(q), p as { tab?: string; limit?: number }));
vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    searchStream: (...args: unknown[]) => {
      allStreams.push({ query: args[0] as string, params: args[1] as { tab?: string; limit?: number }, cb: args[2] as (s: SearchSnapshot) => void });
      streamMock(args[0], args[1]);
      return () => {};
    },
    suggestProfiles: async () => [],
    fetchRepoCounts: async () => ({ issues: 0, patches: 0 }),
  };
});
vi.mock("@/services/nostr", () => ({
  fetchProfile: async () => null,
  fetchRecentByKinds: async () => [],
  fetchLiveStreams: async () => [],
  fetchProfileMap: async () => new Map(),
}));
vi.mock("@/services/api", () => ({ apiClient: new Proxy({}, { get: () => async () => null }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.85 }));
vi.mock("@/hooks/useAppEndorsements", () => ({ useAppEndorsements: () => null }));
vi.mock("@/hooks/useMyFollows", () => ({ useMyFollows: () => ({ follows: new Set<string>(), ready: true, signedIn: false }) }));
vi.mock("@/hooks/usePersonEndorsements", () => ({ usePersonEndorsements: () => null }));
vi.mock("@/hooks/useAuthorFlags", () => ({ useAuthorFlags: () => () => false }));
vi.mock("@/hooks/useNetworkReach", () => ({ useNetworkReach: () => ({ direct: new Set(), friends: new Set(), ready: true }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
vi.mock("@/hooks/useTags", () => ({ useTagMatches: () => [] }));
vi.mock("@/lib/wavlake", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/wavlake")>()), searchWavlakeTracks: async () => [] }));
vi.mock("@/components/feed/HomeFeed", () => ({ HomeFeed: () => null }));
vi.mock("@/components/FinishSetupBanner", () => ({ FinishSetupBanner: () => null }));
vi.mock("@/components/AccountCards", () => ({ AccountCards: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));

import Landing from "./landing";

const fParam = () => new URLSearchParams(window.location.search).get("f");

describe("browsing a vertical with filters, signed out", () => {
  beforeEach(() => {
    cleanup();
    allStreams = [];
    streamMock.mockClear();
    window.history.replaceState({}, "", "/?t=notes");
  });

  it("a filter re-runs the browse with it, keeps showing it, and lands in the URL", async () => {
    render(<Landing />);
    await waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(0));
    const before = mainStreamCalls().length;
    fireEvent.click(await screen.findByTestId("search-filters-toggle"));
    fireEvent.click(screen.getByTestId("filter-verified"));
    await waitFor(() => expect(fParam()).toBe("trust:verified"));
    expect(new URLSearchParams(window.location.search).get("t")).toBe("notes");
    expect(screen.getByTestId("filter-verified")).toBeChecked();
    expect(screen.getByTestId("filters-active-count")).toHaveTextContent("1");
    // The browse re-ran for the same tab (the verified gate itself is applied
    // on the device — the token stays off the wire).
    await waitFor(() => expect(mainStreamCalls().length).toBeGreaterThan(before));
    expect((mainStreamCalls().at(-1)![1] as { tab?: string }).tab).toBe("notes");
    // The words stay empty: browsing, not searching for a token.
    expect(screen.getByTestId("form-home-search").querySelector("input")).toHaveValue("");
  });

  it("a shared browse link restores its filter", async () => {
    window.history.replaceState({}, "", "/?t=notes&f=trust%3Averified");
    render(<Landing />);
    fireEvent.click(await screen.findByTestId("search-filters-toggle"));
    expect(screen.getByTestId("filter-verified")).toBeChecked();
    expect(screen.getByTestId("filters-active-count")).toHaveTextContent("1");
  });

  it("clearing the last filter returns to the plain browse link", async () => {
    window.history.replaceState({}, "", "/?t=notes&f=trust%3Averified");
    render(<Landing />);
    fireEvent.click(await screen.findByTestId("search-filters-toggle"));
    fireEvent.click(screen.getByTestId("filter-verified"));
    await waitFor(() => expect(fParam()).toBeNull());
    expect(window.location.search).toBe("?t=notes");
    expect(screen.queryByTestId("filters-active-count")).toBeNull();
  });
});
