/**
 * Verified muters and verified reporters render from whatever `/stats` returned
 * — the frontend has no threshold of its own to apply, so a preset change shows
 * up purely as different numbers in the response.
 *
 * Issue: .scratch/preset-verified-counts/issues/04-frontend-render-backend-truth.md
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NegativeSignalStats } from "@/components/share/NegativeSignalStats";

const RAW_ID = "nprofile1abc";

/** A /user/{pubkey}/stats payload, as the endpoint shapes it. */
const STATS_UNDER_DEFAULT = {
  muted_by: { verified: 4, total: 31 },
  reported_by: { verified: 2, total: 9 },
};

describe("NegativeSignalStats", () => {
  it("renders both negative signals under the verified lens", () => {
    render(
      <NegativeSignalStats stats={STATS_UNDER_DEFAULT} rawId={RAW_ID} lens="verified" />,
    );

    expect(screen.getByTestId("share-stat-muters")).toHaveTextContent("4Verified Muters");
    expect(screen.getByTestId("share-stat-reporters")).toHaveTextContent(
      "2Verified Reporters",
    );
  });

  it("shows the raw totals under the all lens", () => {
    render(
      <NegativeSignalStats stats={STATS_UNDER_DEFAULT} rawId={RAW_ID} lens="all" />,
    );

    expect(screen.getByTestId("share-stat-muters")).toHaveTextContent("31All Muters");
    expect(screen.getByTestId("share-stat-reporters")).toHaveTextContent("9All Reporters");
  });

  it("renders the counts the response carries, whatever the preset made them", () => {
    // The same subject under a stricter preset: totals unchanged, fewer raters
    // clear the (higher) muter and reporter cutoffs. Nothing here recomputes it.
    const strict = {
      muted_by: { verified: 1, total: 31 },
      reported_by: { verified: 0, total: 9 },
    };

    render(<NegativeSignalStats stats={strict} rawId={RAW_ID} lens="verified" />);

    expect(screen.getByTestId("share-stat-muters")).toHaveTextContent("1Verified Muters");
    expect(screen.getByTestId("share-stat-reporters")).toHaveTextContent(
      "0Verified Reporters",
    );
  });

  it("links each count to its full list", () => {
    render(
      <NegativeSignalStats stats={STATS_UNDER_DEFAULT} rawId={RAW_ID} lens="verified" />,
    );

    expect(screen.getByTestId("share-stat-muters")).toHaveAttribute(
      "href",
      `/p/${RAW_ID}/muters`,
    );
    expect(screen.getByTestId("share-stat-reporters")).toHaveAttribute(
      "href",
      `/p/${RAW_ID}/reporters`,
    );
  });

  it("renders nothing until the stats response lands", () => {
    const { container } = render(
      <NegativeSignalStats stats={undefined} rawId={RAW_ID} lens="verified" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("omits a signal the endpoint had no number for", () => {
    render(
      <NegativeSignalStats
        stats={{ reported_by: { verified: 2, total: 9 } }}
        rawId={RAW_ID}
        lens="verified"
      />,
    );

    expect(screen.queryByTestId("share-stat-muters")).toBeNull();
    expect(screen.getByTestId("share-stat-reporters")).toBeInTheDocument();
  });
});
