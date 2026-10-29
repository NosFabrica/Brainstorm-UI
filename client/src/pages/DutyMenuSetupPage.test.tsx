/**
 * /setup/duty-menu: what the server offers for the reader's Brainstorm
 * Assistant beside the menu it has published, and the one button that has the
 * server publish it — or, on a server without the route, nothing to press.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { AssistantDutyMenu } from "@/hooks/useAssistantDutyMenu";
import { offerRows } from "@/lib/dutyMenu";

const SCORES = "wss://scores.example";
const DCOSL = "wss://dcosl.brainstorm.world";
const OFFER = offerRows([
  ["30382:rank", SCORES],
  ["30392", SCORES],
  ["39998", DCOSL],
]);

const h = vi.hoisted(() => ({ menu: null as unknown as AssistantDutyMenu }));
vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLocation: () => ["/setup/duty-menu", vi.fn()],
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/hooks/useAssistantDutyMenu", () => ({ useAssistantDutyMenu: () => h.menu }));

import DutyMenuSetupPage from "./DutyMenuSetupPage";

function show(menu: Partial<AssistantDutyMenu>) {
  h.menu = {
    supported: true,
    assistant: "b".repeat(64),
    offer: OFFER,
    published: null,
    publishedRows: [],
    status: "missing",
    settled: true,
    error: null,
    publish: vi.fn(async () => ({ event: {} as never, relays: [] })),
    publishing: false,
    ...menu,
  };
  renderWithProviders(<DutyMenuSetupPage />);
}

describe("DutyMenuSetupPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows what the Assistant offers, by category, key and relay", () => {
    show({});
    const offer = screen.getByTestId("duty-menu-offer");
    expect(offer).toHaveTextContent("Scores · 30382:rank · wss://scores.example/");
    expect(offer).toHaveTextContent("Lists · 30392");
    expect(offer).toHaveTextContent("Concepts · 39998 · wss://dcosl.brainstorm.world/");
  });

  it("with no menu yet, says so and offers to publish", () => {
    show({ status: "missing" });
    expect(screen.getByTestId("duty-menu-published-none")).toHaveTextContent("No Duty Menu was found");
    expect(screen.getByTestId("duty-menu-status")).toHaveTextContent("has not published a Duty Menu yet");
    expect(screen.getByTestId("duty-menu-publish")).toBeEnabled();
  });

  it("an up-to-date menu shows its rows, and there's nothing to publish", () => {
    show({ status: "current", published: { kind: 39999 } as never, publishedRows: OFFER });
    expect(screen.getByTestId("duty-menu-published")).toHaveTextContent("Scores · 30382:rank");
    expect(screen.getByTestId("duty-menu-status")).toHaveTextContent("up to date");
    expect(screen.getByTestId("duty-menu-publish")).toBeDisabled();
  });

  it("waits while either side is still being read", () => {
    show({ status: null, settled: false });
    expect(screen.getByTestId("duty-menu-published-none")).toHaveTextContent("Checking…");
    expect(screen.getByTestId("duty-menu-publish")).toBeDisabled();
  });

  it("publishing reports each relay", async () => {
    const publish = vi.fn(async () => ({
      event: {} as never,
      relays: [
        { url: SCORES, ok: true },
        { url: "wss://slow.example", ok: false, message: "timeout" },
      ],
    }));
    show({ status: "out-of-date", publish });
    expect(screen.getByTestId("duty-menu-status")).toHaveTextContent("out of date");
    fireEvent.click(screen.getByTestId("duty-menu-publish"));
    await waitFor(() => expect(screen.getByTestId("duty-menu-report")).toHaveTextContent("wss://slow.example"));
    expect(screen.getByTestId("duty-menu-report")).toHaveTextContent("timeout");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("on a server without the route, says it can't yet and offers nothing", () => {
    show({ supported: false });
    expect(screen.getByTestId("duty-menu-unavailable")).toHaveTextContent("can’t publish Duty Menus yet");
    expect(screen.queryByTestId("duty-menu-publish")).toBeNull();
  });
});
