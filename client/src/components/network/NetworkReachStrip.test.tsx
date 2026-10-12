// @vitest-environment jsdom
/**
 * The reach strip at the top of the Network page: how far a run reached and
 * how healthy that reach is, from the run's own count_values. It moved here
 * from the dashboard's "Your Network" card, which is gone.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TRUST_TIER_COLORS } from "@/services/trustThreshold";

import { NetworkReachStrip } from "./NetworkReachStrip";

const counts = {
  high: { "1": 40, "2": 10 },
  medium_high: { "2": 100 },
  medium: { "2": 300, "3": 50 },
  medium_low: { "2": 800 },
  low: { "2": 900, "3": 84, "4": 6 },
  low_and_reported_by_2_or_more_trusted_pubkeys: { "2": 3 },
};

describe("NetworkReachStrip", () => {
  it("shows the reach within 1–3 hops and the health split in the ladder's colours", () => {
    render(<NetworkReachStrip counts={counts} loading={false} onDetails={() => {}} />);
    expect(screen.getByTestId("network-reach-count")).toHaveTextContent("2,287");
    expect(screen.getByTestId("network-reach-hops")).toHaveTextContent("1–3 hops");
    const legend = screen.getByTestId("network-health-legend");
    expect(legend).toHaveTextContent("Verified 57%");
    expect(legend).toHaveTextContent("Unknown 43%");
    expect(legend).toHaveTextContent("Flagged 0%");
    const bar = screen.getByTestId("network-health-bar");
    const segments = within(bar).getAllByTestId("network-health-segment");
    expect(segments[0]).toHaveStyle({ backgroundColor: TRUST_TIER_COLORS.trusted });
    expect(segments[1]).toHaveStyle({ backgroundColor: TRUST_TIER_COLORS.unverified });
    expect(segments[2]).toHaveStyle({ backgroundColor: TRUST_TIER_COLORS.flagged });
  });

  it("says nothing invented while there is no run: dashes, not made-up numbers", () => {
    render(<NetworkReachStrip counts={null} loading={false} onDetails={() => {}} />);
    expect(screen.getByTestId("network-reach-count")).toHaveTextContent("—");
    expect(screen.getByTestId("network-health-legend")).toHaveTextContent("Verified —");
  });

  it("the Details link opens the explainer the page owns", () => {
    const onDetails = vi.fn();
    render(<NetworkReachStrip counts={counts} loading={false} onDetails={onDetails} />);
    screen.getByTestId("network-health-details").click();
    expect(onDetails).toHaveBeenCalledTimes(1);
  });
});
