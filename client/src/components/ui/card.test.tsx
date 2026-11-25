/**
 * Card is the design system's surface (docs/design-system.md). A card that is a
 * link, a button, a form or a landmark keeps its own element: `asChild` lends
 * it the card's look, as Button's does.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./card";

describe("Card", () => {
  it("is a div by default", () => {
    render(<Card data-testid="card">Hi</Card>);
    expect(screen.getByTestId("card").tagName).toBe("DIV");
    expect(screen.getByTestId("card")).toHaveClass("rounded-2xl", "border-border", "bg-card");
  });

  it("dresses its child instead with asChild, keeping the child's element and classes", () => {
    render(
      <Card asChild interactive className="p-3">
        <button type="button">Open</button>
      </Card>,
    );
    const button = screen.getByRole("button", { name: "Open" });
    expect(button.closest(".bg-card")).toBe(button);
    expect(button).toHaveClass("rounded-2xl", "bg-card", "cursor-pointer", "p-3");
  });
});
