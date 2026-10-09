// @vitest-environment jsdom
/**
 * The dashboard's Network Alerts banner: how many flagged accounts need the
 * reader, and the way to /alerts. The detail lives on that page; the banner is
 * a count and a link, and nothing at all when there is nothing to act on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { NetworkAlertEntry } from "@/services/api";

vi.mock("@/services/nostr", () => ({
  publishAlertPrefs: async () => ({ success: true }),
  fetchAlertPrefs: async () => null,
}));

let alerts: { data?: { data: unknown }; isLoading: boolean; isError: boolean } = { isLoading: true, isError: false };
vi.mock("@/hooks/useNetworkAlerts", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useNetworkAlerts: () => alerts,
}));

import { ignoreAlert, markActed } from "@/lib/networkAlertsIgnored";
import { AlertsBanner } from "./AlertsBanner";

const ME = "f".repeat(64);
const pk = (c: string) => c.repeat(64);
const entry = (pubkey: string, hops: number, reports = 10): NetworkAlertEntry => ({
  pubkey,
  influence: 0.3,
  hops,
  verifiedFollowerCount: 20,
  verifiedMuterCount: 0,
  verifiedReporterCount: reports,
  reporterThreshold: 5,
});
const answer = (direct: NetworkAlertEntry[], extended: NetworkAlertEntry[] = []) => {
  alerts = {
    isLoading: false,
    isError: false,
    data: {
      data: {
        observerPubkey: ME,
        directFollows: direct,
        extendedNetwork: extended,
        directFollowsTruncated: false,
        extendedNetworkTruncated: false,
      },
    },
  };
};
/** A visit that already saw these accounts, so only the rest are new. */
const sawBefore = (pubkeys: string[]) =>
  localStorage.setItem(`brainstorm_network_alerts_seen:${ME}`, JSON.stringify({ pubkeys, updated_at: 1 }));

function show() {
  const { hook } = memoryLocation({ path: "/dashboard" });
  return render(
    <Router hook={hook}>
      <AlertsBanner observer={ME} enabled />
    </Router>,
  );
}

beforeEach(() => {
  localStorage.clear();
  alerts = { isLoading: true, isError: false };
});

describe("AlertsBanner", () => {
  it("counts the flagged people you follow and links to /alerts", async () => {
    answer([entry(pk("a"), 1), entry(pk("b"), 1), entry(pk("c"), 1)]);
    show();
    expect(await screen.findByTestId("alerts-banner")).toHaveTextContent("3 people you follow are flagged");
    expect(screen.getByTestId("alerts-banner-manage")).toHaveAttribute("href", "/alerts");
  });

  it("is a polite status for screen readers, not an alert that interrupts every visit", async () => {
    answer([entry(pk("a"), 1)]);
    show();
    expect(await screen.findByRole("status")).toHaveTextContent("1 person you follow is flagged");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves out accounts you acted on, and ones you ignored unless they got worse", async () => {
    // acted on b; ignored c at 10 reports (still 10); ignored d at 4 (now 10: escalated)
    markActed(ME, pk("b"));
    ignoreAlert(ME, pk("c"), 10);
    ignoreAlert(ME, pk("d"), 4);
    answer([entry(pk("a"), 1), entry(pk("b"), 1), entry(pk("c"), 1), entry(pk("d"), 1)]);
    show();
    expect(await screen.findByTestId("alerts-banner")).toHaveTextContent("2 people you follow are flagged");
  });

  it("says how many are new since you last looked", async () => {
    sawBefore([pk("a")]);
    answer([entry(pk("a"), 1), entry(pk("b"), 1)]);
    show();
    expect(await screen.findByTestId("alerts-banner-new")).toHaveTextContent("1 new");
  });

  it("mentions the wider network on a second, quieter line", async () => {
    answer([entry(pk("a"), 1)], [entry(pk("b"), 2), entry(pk("c"), 2)]);
    show();
    expect(await screen.findByTestId("alerts-banner")).toHaveTextContent("1 person you follow is flagged");
    expect(screen.getByTestId("alerts-banner-wider")).toHaveTextContent("Also 2 flagged in your wider network");
  });

  it("is nothing when none of your follows are flagged, however many are further out", () => {
    answer([entry(pk("a"), 1, 2)], [entry(pk("b"), 2), entry(pk("c"), 2)]);
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it("says the wider count has more beyond it when the server cut the list short", async () => {
    answer([entry(pk("a"), 1)], [entry(pk("b"), 2)]);
    (alerts.data!.data as { extendedNetworkTruncated: boolean }).extendedNetworkTruncated = true;
    show();
    expect(await screen.findByTestId("alerts-banner-wider")).toHaveTextContent("Also 1+ flagged in your wider network");
  });

  it("is nothing at all when no one in your network is flagged", () => {
    answer([entry(pk("a"), 1, 2)]); // under the threshold
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it("is nothing while the alerts load, or when they fail", () => {
    const { container, rerender } = show();
    expect(container).toBeEmptyDOMElement();
    alerts = { isLoading: false, isError: true };
    const { hook } = memoryLocation({ path: "/dashboard" });
    rerender(
      <Router hook={hook}>
        <AlertsBanner observer={ME} enabled />
      </Router>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
