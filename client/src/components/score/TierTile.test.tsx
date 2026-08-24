import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TierTile } from "./TierTile";
import { setScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { setTierGranularity } from "@/hooks/useTierGranularity";

describe("TierTile follows both viewer settings", () => {
  beforeEach(() => localStorage.clear());

  it("says the Simple word and shows digits by default", () => {
    render(<TierTile score01={0.9} pov="global" caption="Brainstorm network score" />);
    expect(screen.getByTestId("tier-tile-word")).toHaveTextContent("Verified");
    expect(screen.getByTestId("verification-coin")).toHaveTextContent("90");
    expect(screen.getByTestId("tier-tile").getAttribute("data-ladder")).toBe("simple");
  });

  it("says the Detailed word when the viewer chose the full ladder", () => {
    setTierGranularity("detailed");
    render(<TierTile score01={0.9} pov="global" caption="x" />);
    expect(screen.getByTestId("tier-tile-word")).toHaveTextContent("Highly verified");
  });

  it("never leaves the coin box empty — tier mode shows the glyph, level mode the pips", () => {
    setScoreDisplayMode("tier");
    const { unmount } = render(<TierTile score01={0.9} pov="global" caption="x" />);
    expect(screen.getByTestId("coin-glyph-check")).toBeInTheDocument();
    unmount();
    setScoreDisplayMode("level");
    render(<TierTile score01={0.9} pov="global" caption="x" />);
    expect(screen.getByTestId("coin-pips")).toBeInTheDocument();
  });

  it("explains Unknown instead of repeating the caption", () => {
    render(<TierTile score01={0.0} pov="global" caption="Brainstorm network score" />);
    expect(screen.getByTestId("tier-tile")).toHaveTextContent("vouched");
  });

  it("is simply absent when verification is off", () => {
    setScoreDisplayMode("off");
    render(<TierTile score01={0.9} pov="global" caption="x" />);
    expect(screen.queryByTestId("tier-tile")).toBeNull();
  });
});
