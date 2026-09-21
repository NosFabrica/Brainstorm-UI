// @vitest-environment jsdom
/**
 * The header on the setup screens. Brand guidelines v1.0 give the identity two
 * signatures — the handwritten wordmark artwork, and the standalone B symbol
 * "wherever a compact identifier is required" — and put navigation in the
 * symbol column. There is no symbol-plus-wordmark lockup in the system, and the
 * wordmark is drawn script that no font reproduces.
 *
 * Both setup pages used to set the name in bold Figtree beside the mark, which
 * broke all three rules at once (Benjamin, 2026-09-21: "only the B should be
 * showing here").
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OnboardingHeader } from "./OnboardingHeader";

describe("the setup header", () => {
  it("carries the mark, and never the name as type", () => {
    render(<OnboardingHeader onSkip={() => {}} skipLabel="Skip for now" skipTestId="welcome-skip" />);

    const header = screen.getByTestId("onboarding-header");
    expect(screen.getAllByRole("img", { name: /brainstorm/i }).length).toBeGreaterThan(0);
    expect(header.textContent).not.toMatch(/Brainstorm/);
    expect(header.querySelector(".font-brand")).toBeNull();
  });

  it("gives the mark a dark-mode twin, like every other header", () => {
    render(<OnboardingHeader onSkip={() => {}} skipLabel="Skip for now" skipTestId="welcome-skip" />);

    // An SVG's `className` is an SVGAnimatedString, so read the attribute.
    const classes = screen.getAllByRole("img", { name: /brainstorm/i }).map((m) => m.getAttribute("class") ?? "");
    expect(classes.some((c) => c.includes("dark:hidden"))).toBe(true);
    expect(classes.some((c) => c.includes("dark:block"))).toBe(true);
  });

  it("offers the way out the page asked for", () => {
    const onSkip = vi.fn();
    render(<OnboardingHeader onSkip={onSkip} skipLabel="Skip — just let me search" skipTestId="activate-skip" />);

    fireEvent.click(screen.getByTestId("activate-skip"));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("activate-skip")).toHaveTextContent("Skip — just let me search");
  });
});
