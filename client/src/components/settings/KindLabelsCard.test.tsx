// @vitest-environment jsdom
/**
 * The switch for kind labels on every card (Settings › Advanced). Off by
 * default: the pill earns its place only where kinds mix — the team and
 * technical readers turn this on for the full view, on this device.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { kindLabelsEverywhere } from "@/lib/kindLabelsPref";
import { KindLabelsCard } from "./KindLabelsCard";

beforeEach(() => localStorage.clear());

describe("KindLabelsCard", () => {
  it("is off until the reader turns it on, and remembers the choice on this device", () => {
    render(<KindLabelsCard />);
    const toggle = screen.getByRole("switch", { name: /kind labels on every card/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(kindLabelsEverywhere()).toBe(false);
    fireEvent.click(toggle);
    expect(kindLabelsEverywhere()).toBe(true);
    fireEvent.click(toggle);
    expect(kindLabelsEverywhere()).toBe(false);
  });
});
