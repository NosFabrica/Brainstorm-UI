// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TagSummary } from "@/services/tags";
import { TagSuggestionRow } from "./TagSuggestionRow";

const lfo: TagSummary = {
  key: `39999:${"9".repeat(64)}:lfo`,
  authorPubkey: "9".repeat(64),
  slug: "lfo",
  name: "lfo",
  people: 54,
  vouches: 3,
  sharesName: 1,
  unverified: true,
};

describe("TagSuggestionRow", () => {
  // Team feedback (2026-10-01): trust scores who does the tagging, not who
  // made the tag, so the row says the name and the count and nothing about
  // its creator.
  it("names the tag and how many carry it, and says nothing about who made it", () => {
    render(<TagSuggestionRow tag={lfo} />);
    const row = screen.getByTestId("tag-suggestion");

    expect(row).toHaveTextContent("lfo");
    expect(row).toHaveTextContent("Tag · 54 people");
    expect(row.textContent).not.toMatch(/unknown creator/i);
    expect(screen.queryByTestId("tag-unverified")).toBeNull();
  });

  // The grey line's first word is the kind of thing the row is — Google's
  // "Poodle · Dog breed" — so a tag is never mistaken for a person named the same.
  it("says it is a tag before it says how many", () => {
    const { rerender } = render(<TagSuggestionRow tag={{ ...lfo, people: 1 }} />);
    expect(screen.getByTestId("tag-suggestion")).toHaveTextContent("Tag · 1 person");
    rerender(<TagSuggestionRow tag={{ ...lfo, people: 5 }} />);
    expect(screen.getByTestId("tag-suggestion")).toHaveTextContent("Tag · 5 people");
    expect(screen.getByTestId("tag-suggestion").textContent).not.toMatch(/tagged this/);
  });
});
