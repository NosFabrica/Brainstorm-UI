// @vitest-environment jsdom
/**
 * The Network page's controls read in a reader's words and one trust language:
 * group pills say which way a relationship runs, the trust filters wear the
 * shared tier colours, and a line under the title says whose scores these are —
 * and the toggle on it changes which perspective the connections are asked for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import { renderWithProviders } from "@/test/utils";
import { TRUST_TIER_COLORS } from "@/services/trustThreshold";

const ME = "f".repeat(64);
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/GlossBackground", () => ({ GlossBackground: () => null }));
vi.mock("@/components/DeferredSession", () => ({ DeferredSessionNotice: () => null }));
vi.mock("@/components/CalculatingNotice", () => ({ CalculatingNotice: () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useTrustPresetSync", () => ({ useTrustPresetSync: () => ({ preset: "default", isLoading: false }) }));
vi.mock("@/hooks/useTierGranularity", () => ({ useTierGranularity: () => ["simple", () => {}] }));
vi.mock("@/hooks/useScoreDisplayMode", () => ({ useScoreDisplayMode: () => ["word", () => {}] }));
vi.mock("@/hooks/useSocialActions", () => ({
  useSocialActions: () => ({
    isFollowing: () => false,
    isMuted: () => false,
    isAnyPending: false,
    listsLoading: false,
    follow: vi.fn(),
    unfollow: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
  }),
}));
vi.mock("@/services/nostr", () => ({ fetchProfiles: async () => {}, eventStore: { getReplaceable: () => undefined } }));
vi.mock("@/services/api", () => ({
  apiClient: {
    getGrapeRankResult: async () => ({ data: { internal_publication_status: "success" } }),
    getUserByPubkey: async () => ({ data: null }),
    getUserStats: async () => ({ data: null }),
  },
  isAuthRedirecting: () => false,
}));

// The perspective store the account menu's toggle also writes: the test flips it.
let perspective: "mywot" | "nosfabrica" = "mywot";
const setPerspective = vi.fn((next: "mywot" | "nosfabrica") => {
  perspective = next;
});
vi.mock("@/hooks/useActivePerspective", () => ({
  useActivePerspective: () => [perspective, setPerspective],
  hasStoredPerspective: () => true,
}));
vi.mock("@/components/score/TrustScorePov", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  TrustScoreModal: () => null,
}));

// What the page asks the connections for, call by call.
const connectionsAsked = vi.fn();
vi.mock("@/hooks/useSelf", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSelfOverview: () => ({ data: { data: { counts: { followed_by: 2, following: 1 } } }, isLoading: false }),
  useSelfStats: () => ({ data: undefined, isLoading: false }),
  useSelfConnections: (_pk: string, kind: string, opts: { enabled?: boolean; house?: boolean }) => {
    if (opts?.enabled) connectionsAsked(kind, opts.house);
    return {
      data: { pages: [{ data: { items: [], total: 0 } }] },
      isFetching: false,
      isLoading: false,
      hasNextPage: false,
    };
  },
}));

import NetworkPage from "./NetworkPage";

function show() {
  renderWithProviders(
    <TooltipProvider>
      <Router hook={memoryLocation({ path: "/network" }).hook}>
        <NetworkPage />
      </Router>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  perspective = "mywot";
  connectionsAsked.mockClear();
  localStorage.setItem("brainstorm_calc_completed", "true");
});

describe("NetworkPage controls", () => {
  it("group pills say which way the relationship runs", async () => {
    show();
    const graph = await screen.findByTestId("row-group-filters-graph");
    expect(within(graph).getByTestId("button-filter-followed_by")).toHaveTextContent("Follows you");
    expect(within(graph).getByTestId("button-filter-following")).toHaveTextContent("You follow");
    expect(within(graph).getByTestId("button-filter-muted_by")).toHaveTextContent("Muted you");
    expect(within(graph).getByTestId("button-filter-reporting")).toHaveTextContent("You reported");
  });

  it("the trust filters read Verified · Unknown · Flagged in the shared tier colours, with no drawn rings", async () => {
    show();
    const row = await screen.findByTestId("row-trust-filters");
    const labels = within(row)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(labels).toEqual(["All", "Verified", "Unknown", "Flagged"]);
    expect(row.querySelector("svg circle")).toBeNull();
    // jsdom reports colours as rgb(); compare in that form.
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const dotOf = (key: string) =>
      (within(row).getByTestId(`button-trust-filter-${key}`).querySelector("span[aria-hidden]") as HTMLElement).style
        .backgroundColor;
    expect(dotOf("verified")).toBe(rgb(TRUST_TIER_COLORS.trusted));
    expect(dotOf("flagged")).toBe(rgb(TRUST_TIER_COLORS.flagged));
  });

  it("says whose scores these are — the switch itself lives in the account menu, not here", async () => {
    show();
    const line = await screen.findByTestId("network-perspective");
    expect(line).toHaveTextContent("Scores from your perspective · Default preset");
    expect(within(line).queryByTestId("pov-toggle")).toBeNull();
    expect(connectionsAsked).toHaveBeenCalledWith("followed_by", false);
  });

  it("follows the perspective chosen in the menu: Brainstorm's means the house view is asked for", async () => {
    perspective = "nosfabrica";
    show();
    const line = await screen.findByTestId("network-perspective");
    expect(line).toHaveTextContent("Scores from Brainstorm's perspective");
    expect(connectionsAsked).toHaveBeenCalledWith("followed_by", true);
  });
});
