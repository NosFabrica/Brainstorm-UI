// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicSuggestionRow } from "./TopicSuggestionRow";

describe("TopicSuggestionRow", () => {
  // Each row in the search popup says what kind of thing it is first.
  it("says it is a topic before it says what is there", () => {
    render(<TopicSuggestionRow tag="bitcoin" />);
    const row = screen.getByTestId("topic-suggestion");
    expect(row).toHaveTextContent("#bitcoin");
    expect(row).toHaveTextContent("Topic · Trusted posts and articles");
  });
});
