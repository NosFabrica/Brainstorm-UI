// @vitest-environment jsdom
/**
 * How the dashboard is put together for a returning user: one slim status
 * strip carrying the single prompt, then alerts, then the network, then what
 * the network is reading — not three setup panels before any product.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders } from "@/test/utils";
import { accountKey } from "@/lib/accountStorage";

const ME = "f".repeat(64);

vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/PageBackground", () => ({ default: () => null }));
vi.mock("@/components/DeferredSession", () => ({ DeferredSessionNotice: () => null }));
vi.mock("@/components/FollowToCalculateCard", () => ({ FollowToCalculateCard: () => null }));
vi.mock("@/components/ShareProfileModal", () => ({ ShareProfileModal: () => null }));
vi.mock("@/components/ActivateBrainstormModal", () => ({ ActivateBrainstormModal: () => null }));
vi.mock("@/components/dashboard/SetupProgressCard", () => ({ SetupProgressCard: () => null }));
vi.mock("@/components/dashboard/TaggedYouModule", () => ({ TaggedYouModule: () => null }));
vi.mock("@/components/dashboard/ClientShelf", () => ({ ClientShelf: () => null }));
vi.mock("@/components/dashboard/AlertsBanner", () => ({ AlertsBanner: () => <div data-testid="alerts-banner" /> }));
vi.mock("@/components/dashboard/YourNetworkCard", () => ({
  YourNetworkCard: () => <div data-testid="card-your-network" />,
}));
vi.mock("@/components/dashboard/NetworkArticlesModule", () => ({
  NetworkArticlesModule: () => <div data-testid="card-network-articles" />,
}));
vi.mock("@/components/dashboard/NetworkThreadModule", () => ({
  NetworkThreadModule: () => <div data-testid="card-network-thread" />,
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: ME, npub: "npub1relay", displayName: "Relay Outpost" }),
}));
vi.mock("@/hooks/useTrustPresetSync", () => ({ useTrustPresetSync: () => ({ preset: "default", isLoading: false }) }));
vi.mock("@/hooks/useTierGranularity", () => ({ useTierGranularity: () => ["simple", () => {}] }));
vi.mock("@/hooks/useNetworkFaces", () => ({ useNetworkFaces: () => ({ data: undefined }) }));
vi.mock("@/hooks/useShareUrl", () => ({ useShareUrl: () => "" }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "has-follows" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/accounts/display", () => ({ identityHas: () => false }));
// The relay verdict: "none" — no kind-10040 names Brainstorm, so activation is
// pending — unless a test flips it to "brainstorm" for the activated cohort.
let provider: "none" | "brainstorm" = "none";
vi.mock("@/hooks/useTrustProviderStatus", () => ({ useTrustProviderStatus: () => ({ data: provider }) }));
vi.mock("@/hooks/useSelf", () => ({
  useSelfOverview: () => ({
    isSuccess: true,
    isLoading: false,
    data: { data: { counts: { followed_by: 16, following: 249 }, flagged_count: 1 } },
  }),
  useSelfHistory: () => ({ data: { data: { ta_pubkey: "a".repeat(64), last_time_calculated_graperank: null } } }),
  useSelfStats: () => ({ isLoading: false, data: { data: {} } }),
}));
vi.mock("@/services/api", () => ({
  apiClient: {
    getGrapeRankResult: async () => ({
      data: {
        internal_publication_status: "success",
        ta_status: "success",
        average: 0.4321,
        updated_at: "2026-10-01T10:38:00",
      },
    }),
    triggerGrapeRank: async () => ({ data: {} }),
  },
  isAuthRedirecting: () => false,
}));

import DashboardPage from "./DashboardPage";

function show() {
  renderWithProviders(
    <Router hook={memoryLocation({ path: "/dashboard" }).hook}>
      <DashboardPage />
    </Router>,
  );
}

beforeEach(() => {
  localStorage.clear();
  provider = "none";
  // A returning user: scores existed before this visit, and the invite card was never seen.
  localStorage.setItem(accountKey("brainstorm_calc_completed", ME), "true");
});

const before = (a: HTMLElement, b: HTMLElement) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("DashboardPage for a returning user", () => {
  it("mentions activation once — a line in the status strip — with no Activate or Invite panel", async () => {
    show();
    const prompt = await screen.findByTestId("dashboard-prompt");
    expect(prompt).toHaveTextContent("Not visible in apps yet");
    expect(within(prompt).getByRole("button", { name: /Activate Brainstorm/ })).toBeInTheDocument();
    expect(screen.queryByTestId("card-activate-brainstorm")).toBeNull();
    expect(screen.queryByTestId("card-invite-grow")).toBeNull();
    expect(screen.queryByTestId("card-nip85-cta")).toBeNull();
    // The strip's status no longer repeats the prompt: it says what the reader has.
    expect(screen.getByTestId("text-overall-trust-score-sub")).toHaveTextContent("Scores ready");
    expect(screen.getAllByText(/Activate/)).toHaveLength(1);
  });

  it("reads status → alerts → network → reading, top to bottom", async () => {
    show();
    const strip = await screen.findByTestId("card-overall-trust-score");
    const alerts = screen.getByTestId("alerts-banner");
    const network = screen.getByTestId("card-your-network");
    const reading = screen.getByTestId("card-network-articles");
    expect(before(strip, alerts)).toBe(true);
    expect(before(alerts, network)).toBe(true);
    expect(before(network, reading)).toBe(true);
  });

  it("the greeting is one line: no slogan under it for a user whose network is already running", async () => {
    show();
    const header = await screen.findByTestId("section-dashboard-header-copy");
    expect(header).toHaveTextContent("Welcome back, Relay Outpost");
    expect(header).not.toHaveTextContent("active and growing");
  });

  it("an activated user gets the same one-line strip — Active, updated, Recalculate, insights — not a fold", async () => {
    provider = "brainstorm";
    localStorage.setItem(accountKey("brainstorm_invite_card_seen", ME), "true");
    show();
    const strip = await screen.findByTestId("card-overall-trust-score");
    expect(strip).toHaveTextContent("Active");
    expect(within(strip).getByTestId("button-trigger-graperank")).toHaveTextContent("Recalculate");
    expect(within(strip).getByTestId("link-view-insights")).toBeInTheDocument();
    expect(screen.queryByTestId("button-wot-expand")).toBeNull();
    expect(screen.queryByTestId("badge-nip85-active")).toBeNull();
    // Nothing owed and the invite already seen: the unpublished assistant is the one line.
    const prompt = screen.getByTestId("dashboard-prompt");
    expect(prompt).toHaveTextContent("Your assistant isn't published yet");
    expect(within(prompt).getByRole("button", { name: /Publish assistant/ })).toBeInTheDocument();
  });
});
