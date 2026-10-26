// @vitest-environment jsdom
/**
 * How the dashboard is put together for a returning user: one slim status
 * strip carrying the single prompt, the page's own search box, then alerts,
 * then what the network is reading — not three setup panels before any
 * product. The network itself lives on /network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders } from "@/test/utils";
import { accountKey } from "@/lib/accountStorage";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

const ME = "f".repeat(64);

// The header's own search box is off on this page: the page's hero box is the one.
vi.mock("@/components/AppHeader", () => ({
  AppHeader: ({ search }: { search?: boolean }) => <div data-testid="app-header" data-search={String(search)} />,
}));
vi.mock("@/components/search/SearchBox", () => ({
  SearchBox: ({ ariaLabel, autoFocus }: { ariaLabel?: string; autoFocus?: boolean }) => (
    <input role="combobox" aria-label={ariaLabel} data-autofocus={String(!!autoFocus)} data-testid="search-box" />
  ),
}));
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
vi.mock("@/hooks/useShortLink", () => ({ useShortLink: () => "", profileShortLink: () => ({}) }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "has-follows" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/accounts/display", () => ({ identityHas: () => false }));
// The relay verdict: "none" — no kind-10040 names Brainstorm, so activation is
// pending — unless a test flips it to "brainstorm" for the activated cohort, or
// "other" for a Treasure Map that gives the rank duty to another Assistant.
let provider: "none" | "brainstorm" | "other" = "none";
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
// When the run last finished; a test moves it to make the scores old or fresh.
let runUpdatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
vi.mock("@/services/api", () => ({
  apiClient: {
    getGrapeRankResult: async () => ({
      data: {
        internal_publication_status: "success",
        ta_status: "success",
        average: 0.4321,
        updated_at: runUpdatedAt,
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
  runUpdatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
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

  // Another Assistant has the rank duty: their choice. Neither the activation
  // line nor the consent one beneath it ("Select Brainstorm") asks again —
  // /setup offers the switch, quietly.
  it("asks nothing of a user whose Treasure Map gives rank to another Assistant", async () => {
    provider = "other";
    localStorage.setItem(accountKey("brainstorm_invite_card_seen", ME), "true");
    show();
    await screen.findByTestId("card-overall-trust-score");
    expect(screen.queryByTestId("dashboard-prompt")).toBeNull();
  });

  it("reads status → search → alerts → reading, top to bottom: the network lives on /network now", async () => {
    show();
    const strip = await screen.findByTestId("card-overall-trust-score");
    const search = screen.getByTestId("dashboard-search");
    const alerts = screen.getByTestId("alerts-banner");
    const reading = screen.getByTestId("card-network-articles");
    expect(before(strip, search)).toBe(true);
    expect(before(search, alerts)).toBe(true);
    expect(before(alerts, reading)).toBe(true);
    expect(screen.queryByTestId("card-your-network")).toBeNull();
  });

  it("puts the cursor in the box on a desktop, so a returning reader can just type", async () => {
    const mm = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(
        (query: string) => ({ matches: query === "(pointer: fine)", media: query }) as MediaQueryList,
      );
    show();
    expect(await screen.findByTestId("search-box")).toHaveAttribute("data-autofocus", "true");
    mm.mockRestore();
  });

  it("leaves the box alone on a phone, where autofocus would pop the keyboard over the page", async () => {
    const mm = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(
        (query: string) => ({ matches: query === "(pointer: coarse)", media: query }) as MediaQueryList,
      );
    show();
    expect(await screen.findByTestId("search-box")).toHaveAttribute("data-autofocus", "false");
    mm.mockRestore();
  });

  it("brings the header's search box in once the hero box has scrolled away, and steps it aside when the hero is back", async () => {
    const io = stubControllableIntersectionObserver();
    show();
    const hero = await screen.findByTestId("dashboard-search");
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-search", "false");
    const watching = io.observers.find((o) => o.observed.has(hero));
    expect(watching).toBeDefined();
    watching!.report(hero, false);
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-search", "true");
    watching!.report(hero, true);
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-search", "false");
  });

  it("the slash key puts the cursor in the search box, unless the reader is already typing somewhere", async () => {
    show();
    const box = await screen.findByTestId("search-box");
    box.blur();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(box);

    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();
    fireEvent.keyDown(field, { key: "/" });
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it("is a search page first: one search box, the page's own, with the header's switched off", async () => {
    show();
    const search = await screen.findByTestId("dashboard-search");
    expect(within(search).getByTestId("search-box")).toHaveAttribute("aria-label", "Search Brainstorm");
    expect(screen.getAllByTestId("search-box")).toHaveLength(1);
    expect(screen.getByTestId("app-header")).toHaveAttribute("data-search", "false");
  });

  it("says how old the scores are in words, and when they are weeks old, says so and asks for a recalculation", async () => {
    runUpdatedAt = new Date(Date.now() - 49 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    show();
    const strip = await screen.findByTestId("card-overall-trust-score");
    expect(within(strip).getByTestId("text-overall-trust-score-sub")).toHaveTextContent("Scores are 7 weeks old");
    expect(strip).not.toHaveTextContent("Scores ready");
    expect(within(strip).getByTestId("button-trigger-graperank")).toHaveTextContent("Recalculate now");
  });

  it("fresh scores read as ready, with their age in words rather than a date", async () => {
    runUpdatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    show();
    const strip = await screen.findByTestId("card-overall-trust-score");
    expect(within(strip).getByTestId("text-overall-trust-score-sub")).toHaveTextContent("Scores ready");
    expect(within(strip).getByTestId("text-trust-signals-updated")).toHaveTextContent("Updated 3 days ago");
    expect(within(strip).getByTestId("button-trigger-graperank")).toHaveTextContent(/^Recalculate$/);
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
