/**
 * "Posts about" — the person's most-used hashtags, one measured line. It can
 * carry a trailing affordance after the chips (the quiet "+ Tag" that used
 * to be a dotted pill in its own "Known for" row, 2026-09-08).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicChips } from "./TopicChips";

const requestNav = vi.fn();
vi.mock("@/components/share/ShareNavContext", () => ({ useShareNav: () => requestNav }));

describe("TopicChips", () => {
  it("chips for the topics, and the trailing affordance after them", () => {
    render(<TopicChips topics={["word5", "wordle"]} trailing={<button data-testid="tag-them">+ Tag</button>} />);
    const row = screen.getByTestId("share-topics");
    expect(row).toHaveTextContent("Posts about");
    // jsdom measures every chip at 0px, so the fit keeps only the first; the
    // order and the trailing slot are what matter here.
    const chips = screen.getAllByTestId("share-topic-chip");
    expect(chips[0]).toHaveTextContent("#word5");
    const tail = screen.getByTestId("tag-them");
    expect(chips.at(-1)!.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no topics but a trailing affordance: the affordance alone, no label", () => {
    render(<TopicChips topics={[]} trailing={<button data-testid="tag-them">+ Tag</button>} />);
    expect(screen.getByTestId("tag-them")).toBeInTheDocument();
    expect(screen.queryByText("Posts about")).toBeNull();
  });

  it("neither topics nor an affordance: nothing", () => {
    const { container } = render(<TopicChips topics={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
