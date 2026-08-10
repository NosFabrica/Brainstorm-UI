import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationCoin, tierForScore01 } from "./VerificationCoin";
import { TRUST_TIER_COLORS } from "@/services/trustThreshold";

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

describe("VerificationCoin", () => {
  it("renders the same fill in both views — POV is no longer on the coin", () => {
    const { unmount } = render(<VerificationCoin score01={0.9} pov="personalized" />);
    const personalized = coin().style.backgroundColor;
    unmount();

    render(<VerificationCoin score01={0.9} pov="global" />);
    expect(coin().style.backgroundColor).toBe(personalized);
    expect(personalized).toBe(rgb(TRUST_TIER_COLORS.highlyTrusted));
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
