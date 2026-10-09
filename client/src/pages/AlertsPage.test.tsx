// @vitest-environment jsdom
/**
 * /alerts — where the dashboard banner sends people. Looking here is what
 * "seen" means: rows new since the last look are tagged NEW for this visit,
 * and the banner stops counting them as new.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { renderWithProviders } from "@/test/utils";
import type { NetworkAlertEntry } from "@/services/api";

const ME = "f".repeat(64);
const pk = (c: string) => c.repeat(64);

vi.mock("@/services/nostr", () => ({
  publishAlertPrefs: async () => ({ success: true }),
  fetchAlertPrefs: async () => null,
}));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
// The reader's history with each account is the details test's concern.
vi.mock("@/hooks/useMyInteractions", () => ({
  useMyInteractions: () => ({ summaryOf: () => null, dmPartial: false }),
}));

const entry = (pubkey: string, hops = 1): NetworkAlertEntry => ({
  pubkey,
  influence: 0.3,
  hops,
  verifiedFollowerCount: 20,
  verifiedMuterCount: 0,
  verifiedReporterCount: 10,
  reporterThreshold: 5,
});
let alerts: unknown = { isLoading: true, isError: false };
vi.mock("@/hooks/useNetworkAlerts", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useNetworkAlerts: () => alerts,
}));
const answer = (direct: NetworkAlertEntry[]) => {
  alerts = {
    isLoading: false,
    isError: false,
    data: {
      data: {
        observerPubkey: ME,
        directFollows: direct,
        extendedNetwork: [],
        directFollowsTruncated: false,
        extendedNetworkTruncated: false,
      },
    },
  };
};

import AlertsPage from "./AlertsPage";
import { AlertsBanner } from "@/components/dashboard/AlertsBanner";

const at = (path: string, ui: React.ReactElement) =>
  renderWithProviders(<Router hook={memoryLocation({ path }).hook}>{ui}</Router>);

beforeEach(() => {
  localStorage.clear();
  alerts = { isLoading: true, isError: false };
});

describe("AlertsPage", () => {
  it("tags what's new since the last look, and the banner stops counting it once you've looked", async () => {
    localStorage.setItem(`brainstorm_network_alerts_seen:${ME}`, JSON.stringify({ pubkeys: [pk("a")], updated_at: 1 }));
    answer([entry(pk("a")), entry(pk("b"))]);

    const page = at("/alerts", <AlertsPage />);
    const newRow = await screen.findByTestId(`network-alert-row-${pk("b").slice(0, 8)}`);
    expect(within(newRow).getByTestId("network-alert-new")).toBeInTheDocument();
    const oldRow = screen.getByTestId(`network-alert-row-${pk("a").slice(0, 8)}`);
    expect(within(oldRow).queryByTestId("network-alert-new")).toBeNull();
    expect(screen.getByTestId("alerts-search")).toBeInTheDocument();
    page.unmount();

    await act(async () => {
      at("/dashboard", <AlertsBanner observer={ME} enabled />);
    });
    expect(screen.getByTestId("alerts-banner")).toHaveTextContent("2 people you follow are flagged");
    expect(screen.queryByTestId("alerts-banner-new")).toBeNull();
  });
});
