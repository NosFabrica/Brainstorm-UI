// @vitest-environment jsdom
/**
 * "Your Network" on a phone: the two counts share one row, and reach and
 * trust health are a row each under them — not four full-width boxes that
 * pushed the reading modules two screens down.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useScoreDisplayMode", () => ({ useScoreDisplayMode: () => ["word", () => {}] }));
vi.mock("@/hooks/useTierGranularity", () => ({ useTierGranularity: () => ["simple", () => {}] }));

import { YourNetworkCard } from "./YourNetworkCard";

function show() {
  render(
    <YourNetworkCard
      isReady
      loading={false}
      followers={16}
      following={249}
      extendedCount={195769}
      hopRange={[1, 3]}
      maxHop={5}
      onHopChange={() => {}}
      health={[
        { name: "Verified", value: 2, color: "#13d2e5" },
        { name: "Unknown", value: 97, color: "#8c929e" },
        { name: "Flagged", value: 1, color: "#ef4444" },
      ]}
      onNavigate={() => {}}
    />,
  );
}

describe("YourNetworkCard", () => {
  it("puts Followers and Following side by side, whatever the width", () => {
    show();
    const followers = screen.getByTestId("your-network-followed_by");
    const following = screen.getByTestId("your-network-following");
    expect(followers.parentElement).toBe(following.parentElement);
    // Two columns on a phone (four from lg); reach and health span both phone columns.
    expect(followers.parentElement!.className).toMatch(/\bgrid-cols-2\b/);
    expect(screen.getByTestId("your-network-health-bar").closest(".col-span-2")).not.toBeNull();
  });

  it("shows the counts and the reach as the numbers they are", () => {
    show();
    expect(screen.getByTestId("your-network-followed_by")).toHaveTextContent("16");
    expect(screen.getByTestId("your-network-following")).toHaveTextContent("249");
    expect(screen.getByTestId("card-your-network")).toHaveTextContent("195,769");
  });
});
