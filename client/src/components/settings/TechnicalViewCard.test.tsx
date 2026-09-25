// @vitest-environment jsdom
/**
 * The switch for kind labels on every card (Settings › Advanced). Off by
 * default: the pill earns its place only where kinds mix — the team and
 * technical readers turn this on for the full view, on this device.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { technicalViewOn } from "@/lib/technicalView";
import { TechnicalViewCard } from "./TechnicalViewCard";

beforeEach(() => localStorage.clear());

describe("TechnicalViewCard", () => {
  it("is off until the reader turns it on, and remembers the choice on this device", () => {
    render(<TechnicalViewCard />);
    const toggle = screen.getByRole("switch", { name: /^technical view$/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(technicalViewOn()).toBe(false);
    fireEvent.click(toggle);
    expect(technicalViewOn()).toBe(true);
    fireEvent.click(toggle);
    expect(technicalViewOn()).toBe(false);
  });
});
