// @vitest-environment jsdom
/** Search never walks the hub's whole tag catalogue — it took half a minute. Tag rows come from the search relay. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { TagSummary } from "@/services/tags";

const fetchTagIndexMock = vi.fn<(...args: unknown[]) => Promise<TagSummary[]>>();
vi.mock("@/services/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tags")>()),
  fetchTagIndex: (...args: unknown[]) => fetchTagIndexMock(...args),
}));
const searchTagsMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
vi.mock("@/services/searchTags", () => ({ fetchSearchTags: (...args: unknown[]) => searchTagsMock(...args) }));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  searchStream: () => () => {},
  suggestProfiles: async () => [],
  suggestProfileHits: async () => [],
  fetchRepoCounts: async () => ({ issues: 0, patches: 0 }),
}));
vi.mock("@/services/nostr", () => ({
  fetchProfile: async () => null,
  fetchRecentByKinds: async () => [],
  fetchLiveStreams: async () => [],
  fetchProfileMap: async () => new Map(),
  fetchEventsByIds: async () => [],
  fetchAddressableEvents: async () => new Map(),
}));
vi.mock("@/services/api", () => ({ apiClient: new Proxy({}, { get: () => async () => null }) }));
vi.mock("@/hooks/usePersonContent", () => ({ usePersonContent: () => new Map() }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.85 }));
vi.mock("@/hooks/useAppEndorsements", () => ({ useAppEndorsements: () => null }));
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: new Set<string>(), ready: true, signedIn: false }),
}));
vi.mock("@/hooks/usePersonEndorsements", () => ({ usePersonEndorsements: () => null }));
vi.mock("@/hooks/useAuthorFlags", () => ({ useAuthorFlags: () => () => false }));
vi.mock("@/hooks/useNetworkReach", () => ({
  useNetworkReach: () => ({ direct: new Set(), friends: new Set(), ready: true }),
}));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => ({ hasMywot: false }) }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => ({ isSearchObserver: false }) }));
vi.mock("@/lib/wavlake", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wavlake")>()),
  searchWavlakeTracks: async () => [],
  searchWavlake: async () => ({ artists: [], albums: [], songs: [] }),
  fetchWavlakeTrending: async () => [],
}));
vi.mock("@/components/feed/HomeFeed", () => ({ HomeFeed: () => null }));
vi.mock("@/components/FinishSetupBanner", () => ({ FinishSetupBanner: () => null }));
vi.mock("@/components/AccountCards", () => ({ AccountCards: () => null }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));

import Landing from "./landing";

const renderLanding = () => renderWithProviders(<Landing />).queryClient;

/**
 * Type into the box. It is a contenteditable (the grammar's tokens draw as pills there), so a
 * value set plus an `input` is one keystroke — `fireEvent.change` means nothing to it.
 */
function typeInBox(text: string): HTMLElement & { value: string } {
  const box = screen.getByTestId("input-home-search") as HTMLElement & { value: string };
  box.value = text;
  fireEvent.input(box);
  return box;
}

describe("the tag catalogue on the home search", () => {
  beforeEach(() => {
    cleanup();
    fetchTagIndexMock.mockReset();
    fetchTagIndexMock.mockResolvedValue([]);
    searchTagsMock.mockReset();
    searchTagsMock.mockResolvedValue([]);
  });

  it("isn't fetched when a results page opens from a link", async () => {
    window.history.replaceState({}, "", "/?q=bitcoin");
    renderLanding();
    await waitFor(() => expect((screen.getByTestId("input-home-search") as HTMLInputElement).value).toBe("bitcoin"));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchTagIndexMock).not.toHaveBeenCalled();
  });

  it("isn't fetched when someone types either: the tag row comes from the search relay", async () => {
    searchTagsMock.mockResolvedValue([
      {
        key: "a|bitcoiners",
        authorPubkey: "a".repeat(64),
        slug: "bitcoiners",
        name: "Bitcoiners",
        people: 12,
        vouches: 3,
        sharesName: 1,
        unverified: false,
        members: [],
      },
    ]);
    window.history.replaceState({}, "", "/");
    renderLanding();
    typeInBox("bitc");
    expect(await screen.findByTestId("home-tag-suggestion")).toHaveTextContent("Bitcoiners");
    expect(searchTagsMock.mock.calls[0]?.[0]).toBe("bitc");
    expect(fetchTagIndexMock).not.toHaveBeenCalled();
  });
});
