import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationCoin, tierForScore01 } from "./VerificationCoin";
import { TRUST_TIER_COLORS } from "@/services/trustThreshold";
import { setTierGranularity } from "@/hooks/useTierGranularity";

/**
 * The coin's contract after POV came off it. The load-bearing test is
 * "same score, same coin, either view" — that's the whole change, and it's the
 * one a future edit could quietly undo by reintroducing a POV tint.
 */

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};
const coin = () => screen.getByTestId("verification-coin");

describe("tierForScore01", () => {
  it("buckets on the shared thresholds", () => {
    expect(tierForScore01(0.9)).toBe("high");
    expect(tierForScore01(0.5)).toBe("high"); // boundary is inclusive
    expect(tierForScore01(0.49)).toBe("trusted");
    expect(tierForScore01(0.2)).toBe("trusted");
    expect(tierForScore01(0.19)).toBe("neutral");
    expect(tierForScore01(0.07)).toBe("neutral");
    expect(tierForScore01(0.0)).toBe("unverified");
  });
});

describe("VerificationCoin (simple ladder — the default, decision 8)", () => {
  beforeEach(() => localStorage.clear());

  it("buckets a strong score as Verified: cyan, a check, the word in the label", () => {
    render(<VerificationCoin score01={0.9} pov="global" />);
    expect(coin().getAttribute("data-ladder")).toBe("simple");
    expect(coin().getAttribute("data-tier")).toBe("verified");
    expect(coin().style.backgroundColor).toBe(rgb(TRUST_TIER_COLORS.trusted));
    expect(coin().getAttribute("aria-label")).toContain("Verified");
  });

  it("buckets everything under the verified line as Unknown, and says why", () => {
    render(<VerificationCoin score01={0.0} pov="global" />);
    expect(coin().getAttribute("data-tier")).toBe("unknown");
    expect(coin().style.backgroundColor).toBe(rgb(TRUST_TIER_COLORS.unverified));
    expect(coin().getAttribute("title")).toContain("vouched");
  });

  it("lets Flagged win over any score, in red, even with no score at all", () => {
    const { unmount } = render(<VerificationCoin score01={0.95} flagged pov="global" />);
    expect(coin().getAttribute("data-tier")).toBe("flagged");
    expect(coin().style.backgroundColor).toBe(rgb(TRUST_TIER_COLORS.flagged));
    unmount();
    render(<VerificationCoin score01={null} flagged pov="global" />);
    expect(coin().getAttribute("data-tier")).toBe("flagged");
  });

  it("carries a glyph outside number mode, so the three buckets survive greyscale", () => {
    localStorage.setItem("brainstorm_score_display:anon", "tier");
    const { unmount } = render(<VerificationCoin score01={0.9} pov="global" />);
    expect(screen.getByTestId("coin-glyph-check")).toBeInTheDocument();
    unmount();
    render(<VerificationCoin score01={0.0} pov="global" />);
    expect(screen.getByTestId("coin-glyph-question")).toBeInTheDocument();
  });

  it("draws three pips in level mode — the ladder's length, not a hard-coded five", () => {
    localStorage.setItem("brainstorm_score_display:anon", "level");
    render(<VerificationCoin score01={0.9} pov="global" />);
    expect(screen.getByTestId("coin-pips").children.length).toBe(3);
  });
});

describe("VerificationCoin (detailed ladder)", () => {
  beforeEach(() => {
    localStorage.clear();
    setTierGranularity("detailed");
  });

  it("renders the same FILL in both views — hue is tier, never point of view", () => {
    // The regression this guards: when hue meant POV, a 95 and a 12 were the
    // same colour in global view, and a teammate read grey as "scores badly".
    const { unmount } = render(<VerificationCoin score01={0.9} pov="personalized" />);
    const personalized = coin().style.backgroundColor;
    unmount();

    render(<VerificationCoin score01={0.9} pov="global" />);
    expect(coin().style.backgroundColor).toBe(personalized);
    expect(personalized).toBe(rgb(TRUST_TIER_COLORS.highlyTrusted));
  });

  it("distinguishes the two views by RING, so the score still says whose view it is", () => {
    // The team's actual ask. Tier keeps the fill; POV gets its own channel.
    const { unmount } = render(<VerificationCoin score01={0.9} pov="personalized" />);
    const personalized = coin().className;
    expect(coin().getAttribute("data-pov-ring")).toBe("personalized");
    unmount();

    render(<VerificationCoin score01={0.9} pov="global" />);
    expect(coin().getAttribute("data-pov-ring")).toBe("global");
    expect(coin().className).not.toBe(personalized);
  });

  it("separates the ring from the fill, so a purple ring survives a purple coin", () => {
    // Aurora Purple is both brand-primary and the `high` tier fill. Without the
    // surface-coloured inner step the personalized ring would be invisible on
    // exactly the coins that matter most.
    render(<VerificationCoin score01={0.95} pov="personalized" />);
    const cls = coin().className;
    expect(cls).toContain("#ffffff"); // the separator step
    expect(cls).toContain("#7237ff"); // the ring itself
  });

  it("draws no ring when there is no number to attribute", () => {
    render(<VerificationCoin score01={null} pov="personalized" />);
    expect(coin().getAttribute("data-pov-ring")).toBe("none");
  });

  it("draws no ring where the surface already labels the view", () => {
    // The compare-both rows in TrustScoreModal print "Personalized" / "Global"
    // beside each coin; a ring there is just repetition.
    render(<VerificationCoin score01={0.9} pov="personalized" ring={false} />);
    expect(coin().getAttribute("data-pov-ring")).toBe("none");
  });

  it("still names the view for screen readers", () => {
    const { unmount } = render(<VerificationCoin score01={0.9} pov="global" />);
    expect(coin().getAttribute("aria-label")).toContain("global view");
    unmount();

    render(<VerificationCoin score01={0.9} pov="personalized" />);
    expect(coin().getAttribute("aria-label")).toContain("personalized view");
  });

  it("takes its hues from the shared tier palette", () => {
    const cases: Array<[number, string]> = [
      [0.9, TRUST_TIER_COLORS.highlyTrusted],
      [0.3, TRUST_TIER_COLORS.trusted],
      [0.1, TRUST_TIER_COLORS.neutral],
      [0.0, TRUST_TIER_COLORS.unverified],
    ];
    for (const [score, hex] of cases) {
      const { unmount } = render(<VerificationCoin score01={score} pov="global" />);
      expect(coin().style.backgroundColor).toBe(rgb(hex));
      unmount();
    }
  });

  it("uses dark text on the light fills, so nothing ships under AA", () => {
    // Cyan on white was 1.85:1 before this. These three are the fills where
    // white text fails; the check is that they are NOT white.
    for (const score of [0.3, 0.05, 0.0]) {
      const { unmount } = render(<VerificationCoin score01={score} pov="global" />);
      expect(coin().style.color).not.toBe("rgb(255, 255, 255)");
      unmount();
    }
  });

  it("keeps white text on the dark fills", () => {
    for (const score of [0.9, 0.1]) {
      const { unmount } = render(<VerificationCoin score01={score} pov="global" />);
      expect(coin().style.color).toBe("rgb(255, 255, 255)");
      unmount();
    }
  });

  it("draws an unrated coin as an outline, not another grey", () => {
    render(<VerificationCoin score01={null} pov="global" />);
    // A difference in KIND from the grey "unverified" fill — two greys a shade
    // apart are indistinguishable at the 20px this renders at in lists.
    expect(coin().style.backgroundColor).toBe("transparent");
    expect(coin().className).toContain("border-dashed");
    expect(coin()).toHaveTextContent("—");
    expect(coin().getAttribute("data-tier")).toBe("unrated");
  });

  it("clamps out-of-range scores rather than printing them", () => {
    const { unmount } = render(<VerificationCoin score01={1.4} pov="global" />);
    expect(coin()).toHaveTextContent("100");
    unmount();

    render(<VerificationCoin score01={-0.5} pov="global" />);
    expect(coin()).toHaveTextContent("0");
  });
});
