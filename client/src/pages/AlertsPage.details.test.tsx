// @vitest-environment jsdom
/**
 * /alerts row details: a flagged account's row stays light until opened; open,
 * it says what the reader has had to do with the account and who reported it,
 * grouped by how the reader would weigh them. Who reported is only asked for
 * once a row is opened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
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
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfiles: (pks: string[]) => new Map(pks.map((p) => [p, { name: `Name ${p.slice(0, 2)}` }])),
}));
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: new Set([pk("a"), pk("r")]), ready: true, signedIn: true }),
}));

const entry = (pubkey: string): NetworkAlertEntry => ({
  pubkey,
  influence: 0.3,
  hops: 1,
  verifiedFollowerCount: 20,
  verifiedMuterCount: 0,
  verifiedReporterCount: 10,
  reporterThreshold: 5,
});
vi.mock("@/hooks/useNetworkAlerts", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useNetworkAlerts: () => ({
    isLoading: false,
    isError: false,
    data: {
      data: {
        observerPubkey: ME,
        directFollows: [entry(pk("a"))],
        extendedNetwork: [],
        directFollowsTruncated: false,
        extendedNetworkTruncated: false,
      },
    },
  }),
}));

// The reader's history with each flagged account, from their own data.
vi.mock("@/hooks/useMyInteractions", () => ({
  useMyInteractions: () => ({
    summaryOf: () => ({
      youFollow: true,
      youMuted: false,
      youMessaged: true,
      theyMessaged: false,
      replies: 3,
      reactions: 0,
      reposts: 0,
      lastAt: 1_700_000_000,
    }),
    dmPartial: false,
  }),
}));

// Who reported them, as the reader's perspective scores them.
const reportersAsked = vi.fn();
vi.mock("@/hooks/useAlertReporters", () => ({
  useAlertReporters: (pubkey: string) => {
    reportersAsked(pubkey);
    return {
      isLoading: false,
      isError: false,
      pov: "personalized",
      data: {
        total: 4,
        reporters: [
          { pubkey: pk("r"), influence: 0.01 },
          { pubkey: pk("s"), influence: 0.6 },
          { pubkey: pk("t"), influence: 0.3 },
          { pubkey: pk("u"), influence: 0.001 },
        ],
      },
    };
  },
}));

import AlertsPage from "./AlertsPage";

beforeEach(() => {
  localStorage.clear();
  reportersAsked.mockClear();
});

const show = () =>
  renderWithProviders(
    <Router hook={memoryLocation({ path: "/alerts" }).hook}>
      <AlertsPage />
    </Router>,
  );

describe("AlertsPage row details", () => {
  it("a closed row carries no details and asks no one who reported it", async () => {
    show();
    await screen.findByTestId(`network-alert-row-${pk("a").slice(0, 8)}`);
    expect(screen.queryByTestId("alert-details")).toBeNull();
    expect(reportersAsked).not.toHaveBeenCalled();
    expect(screen.getByTestId("alerts-search")).toBeInTheDocument();
  });

  it("opened, it shows your history with the account and who reported it, grouped", async () => {
    show();
    const row = await screen.findByTestId(`network-alert-row-${pk("a").slice(0, 8)}`);
    fireEvent.click(within(row).getByTestId("network-alert-details-toggle"));

    const details = within(row).getByTestId("alert-details");
    expect(reportersAsked).toHaveBeenCalledWith(pk("a"));
    expect(within(details).getByTestId("alert-history")).toHaveTextContent("You follow them");
    expect(within(details).getByTestId("alert-history")).toHaveTextContent("You've messaged them");
    expect(within(details).getByTestId("alert-history")).toHaveTextContent("3 replies");
    expect(within(details).getByTestId("alert-reporters-summary")).toHaveTextContent(
      "1 person you follow · 2 verified · 1 unverified",
    );
    expect(within(details).getByTestId("alert-reporters-all")).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/p\/npub1.+\/reporters$/),
    );
  });
});
