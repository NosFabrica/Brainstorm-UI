import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("renders the metric tile: icon chip, value, label", () => {
    render(<StatTile icon={Users} value="1.2K" label="People" data-testid="tile" />);
    const tile = screen.getByTestId("tile");
    expect(tile).toHaveTextContent("1.2K");
    expect(tile).toHaveTextContent("People");
    expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("compact: one line of value and label, for a strip of numbers above a list", () => {
    render(<StatTile compact value={4} label="Faults" tone="warning" role="button" data-testid="pill" />);
    const pill = screen.getByTestId("pill");
    expect(pill).toHaveTextContent("4");
    expect(pill).toHaveTextContent("Faults");
    // No icon chip and no stacked layout: the tone is a dot beside the value.
    expect(pill.querySelector("svg")).toBeNull();
    expect(pill.getAttribute("role")).toBe("button");
    expect(pill.className).not.toMatch(/p-4|p-5|rounded-2xl/);
  });
});
