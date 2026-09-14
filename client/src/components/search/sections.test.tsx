// @vitest-environment jsdom
/**
 * A results section is titled in words — "Latest", "Shop" — with a quiet
 * "See all" at the right. Colour belongs to the content, not the label.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Section } from "./sections";

describe("Section", () => {
  it("titles itself in sentence case with a quiet See all that switches to its tab", () => {
    const onTab = vi.fn();
    render(
      <Section id="latest" kicker="Latest" tab="notes" onTabChange={onTab}>
        <p>rows</p>
      </Section>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Latest" });
    expect(heading.className).not.toMatch(/uppercase|font-mono|tracking-\[/);
    const all = screen.getByTestId("serp-more-latest");
    expect(all).toHaveTextContent("See all");
    fireEvent.click(all);
    expect(onTab).toHaveBeenCalledWith("notes");
  });
});
