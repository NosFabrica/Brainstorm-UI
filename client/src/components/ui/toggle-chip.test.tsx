/**
 * ToggleChip is the pressable pill: a filter, a sort or a choice that is on or
 * off (docs/design-system.md). Chip stays the span for tags and badges.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToggleChip } from "./toggle-chip";

describe("ToggleChip", () => {
  it("is a button that says whether it is pressed, and never submits a form", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ToggleChip pressed={false} onClick={onClick}>
          Open now
        </ToggleChip>
      </form>,
    );
    const chip = screen.getByRole("button", { name: "Open now" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveAttribute("type", "button");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a keyboard focus ring", () => {
    render(<ToggleChip pressed>Near you</ToggleChip>);
    expect(screen.getByRole("button")).toHaveClass("focus-visible:ring-2", "focus-visible:ring-brand-accent");
  });

  it("fills with the brand colour when pressed (solid, the default)", () => {
    const { rerender } = render(<ToggleChip pressed>Cafe</ToggleChip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button")).toHaveClass(
      "rounded-full",
      "border-brand-primary",
      "bg-brand-primary",
      "text-white",
    );
    rerender(<ToggleChip pressed={false}>Cafe</ToggleChip>);
    expect(screen.getByRole("button")).not.toHaveClass("bg-brand-primary");
    expect(screen.getByRole("button")).toHaveClass("border-slate-200", "bg-white");
  });

  it("tints instead of filling when soft, and has no border when ghost", () => {
    render(
      <>
        <ToggleChip pressed variant="soft">
          Soft
        </ToggleChip>
        <ToggleChip pressed variant="ghost">
          Ghost
        </ToggleChip>
        <ToggleChip pressed={false} variant="ghost">
          Idle
        </ToggleChip>
      </>,
    );
    expect(screen.getByRole("button", { name: "Soft" })).toHaveClass(
      "border",
      "bg-brand-primary/10",
      "text-brand-deep",
    );
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveClass("bg-brand-primary", "text-white");
    expect(screen.getByRole("button", { name: "Ghost" })).not.toHaveClass("border");
    expect(screen.getByRole("button", { name: "Idle" })).toHaveClass("text-slate-500");
  });

  it("puts a count after the label, read with it", () => {
    render(
      <ToggleChip pressed={false} count={3}>
        Restaurant
      </ToggleChip>,
    );
    expect(screen.getByRole("button", { name: "Restaurant 3" })).toBeInTheDocument();
  });

  it("lets a caller adjust its classes", () => {
    render(
      <ToggleChip pressed={false} className="px-2.5 font-semibold">
        $$
      </ToggleChip>,
    );
    expect(screen.getByRole("button")).toHaveClass("px-2.5", "font-semibold");
    expect(screen.getByRole("button")).not.toHaveClass("px-3", "font-medium");
  });
});
