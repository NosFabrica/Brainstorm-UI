/**
 * The public profile's bio used to stop at two lines with no way to read
 * the rest — a power user's first complaint (2026-09-05): "I'd like the
 * full bio." Three lines by default, the whole text on a tap, paragraph
 * breaks kept, and the toggle only when there is more to read.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfileBio } from "@/components/share/ProfileBio";

const SHORT = "Builder of small tools.";
const LONG =
  "On a mission to transform technology into a force for good, advocating for user sovereignty and creative solutions for a more equitable digital world. user-focused | data sovereignty | digital renaissance | fair access | tech liberation https://brainstorm.world/about";

describe("ProfileBio", () => {
  it("a short bio reads whole with nothing to tap", () => {
    render(<ProfileBio text={SHORT} />);
    expect(screen.getByTestId("share-bio")).toHaveTextContent(SHORT);
    expect(screen.queryByTestId("share-bio-toggle")).toBeNull();
  });

  it("a long bio shows three lines and offers the rest", () => {
    render(<ProfileBio text={LONG} />);
    const text = screen.getByTestId("share-bio-text");
    expect(text).toHaveClass("line-clamp-3");
    // Clamped, blank lines collapse so the three lines are all words.
    expect(text).not.toHaveClass("whitespace-pre-line");
    const toggle = screen.getByTestId("share-bio-toggle");
    expect(toggle).toHaveTextContent("Show more");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByTestId("share-bio-text")).not.toHaveClass("line-clamp-3");
    // Open, the paragraph breaks come back.
    expect(screen.getByTestId("share-bio-text")).toHaveClass("whitespace-pre-line");
    expect(toggle).toHaveTextContent("Show less");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.getByTestId("share-bio-text")).toHaveClass("line-clamp-3");
  });

  it("a short bio written as a list of lines still has more below the fold", () => {
    render(<ProfileBio text={"dev\nwriter\nrunner\ncook"} />);
    expect(screen.getByTestId("share-bio-toggle")).toHaveTextContent("Show more");
  });

  it("a link in the bio stays a link, whole", () => {
    render(<ProfileBio text={LONG} />);
    const link = screen.getByRole("link", { name: "brainstorm.world/about" });
    expect(link).toHaveAttribute("href", "https://brainstorm.world/about");
    expect(link).not.toHaveClass("break-all");
  });
});
