/**
 * "Posts about" — the person's most-used hashtags, one measured line. Plain
 * hashtag text, not pills: a pill is a tag ("Tagged as", ProfileTagChips), and
 * the two rows sit one above the other, so the shapes are what tell a tag
 * someone gave from a hashtag the person typed (2026-11-19). The way to tag a
 * person used to trail this row; it lives in the "Tagged as" row now.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopicChips } from "./TopicChips";

const requestNav = vi.fn();
vi.mock("@/components/share/ShareNavContext", () => ({ useShareNav: () => requestNav }));

describe("TopicChips", () => {
  it("shows the hashtags under their label, and opens one when it is pressed", () => {
    render(<TopicChips topics={["word5", "wordle"]} />);
    expect(screen.getByTestId("share-topics")).toHaveTextContent("Posts about");
    // jsdom measures every hashtag at 0px, so the fit keeps only the first.
    const first = screen.getAllByTestId("share-topic-chip")[0];
    expect(first).toHaveTextContent("#word5");
    fireEvent.click(first);
    expect(requestNav).toHaveBeenCalledWith({ kind: "hashtag", target: "#word5", label: "#word5" });
  });

  it("draws a hashtag as text, with none of a tag pill's shape", () => {
    render(<TopicChips topics={["word5"]} />);
    const hashtag = screen.getByTestId("share-topic-chip");
    expect(hashtag.className).not.toMatch(/rounded-full|\bbg-|\bborder\b/);
  });

  it("no hashtags: nothing", () => {
    const { container } = render(<TopicChips topics={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
