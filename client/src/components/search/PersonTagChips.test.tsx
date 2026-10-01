/**
 * The tag pill on a person's row in search: the one tag the words matched,
 * right-aligned, one tap to the tag page — the collection, how it was formed,
 * who else. Rendered without a router — wouter's Link
 * works on the browser location.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import type { TagSummary } from "@/services/tags";
import { PersonTagChips } from "./PersonTagChips";

const AUTHOR = "9".repeat(64);
const tag = (slug: string, name: string, extra: Partial<TagSummary> = {}): TagSummary => ({
  key: `39999:${AUTHOR}:${slug}`,
  authorPubkey: AUTHOR,
  slug,
  name,
  people: 12,
  vouches: 3,
  sharesName: 0,
  unverified: false,
  ...extra,
});
const human = tag("verified-human", "Verified Human");
const author = tag("author", "Author", { people: 1 });

describe("PersonTagChips", () => {
  it("is one link to the tag's page, saying how many carry it", () => {
    const { rerender } = render(<PersonTagChips tag={human} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const chip = screen.getByTestId("person-tag-chip-verified-human");
    expect(chip.getAttribute("href")).toBe(`/tags/${nip19.npubEncode(AUTHOR)}/verified-human`);
    expect(chip).toHaveTextContent("Verified Human");
    expect(chip).toHaveAttribute("title", "Tagged Verified Human by 12 people · see who else");
    expect(screen.getByTestId("person-tag-chips")).toHaveAttribute("data-state", "ready");

    rerender(<PersonTagChips tag={author} />);
    expect(screen.getByTestId("person-tag-chip-author")).toHaveAttribute(
      "title",
      "Tagged Author by 1 person · see who else",
    );
  });

  it("reserves its slot while the lookup is out, and when there is nothing to say", () => {
    const { rerender } = render(<PersonTagChips tag={undefined} pending />);
    expect(screen.getByTestId("person-tag-chips")).toHaveAttribute("data-state", "pending");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    rerender(<PersonTagChips tag={undefined} />);
    expect(screen.getByTestId("person-tag-chips")).toHaveAttribute("data-state", "ready");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("a click opens the tag page and never reaches the row", () => {
    const rowClick = vi.fn();
    const onNavigate = vi.fn();
    render(
      <div onClick={rowClick}>
        <PersonTagChips tag={human} onNavigate={onNavigate} linkTabIndex={-1} />
      </div>,
    );
    const link = screen.getByTestId("person-tag-chip-verified-human");
    expect(link).toHaveAttribute("tabindex", "-1");
    // Mousedown is swallowed so the search box keeps its focus.
    expect(fireEvent.mouseDown(link)).toBe(false);
    fireEvent.click(link);
    expect(rowClick).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(`/tags/${nip19.npubEncode(AUTHOR)}/verified-human`);
  });

  // Team feedback (2026-10-01): who made a tag is not what trust scores, so a
  // tag with an unscored creator looks and reads like every other tag.
  it("draws every tag the same, whoever made it", () => {
    const { rerender } = render(<PersonTagChips tag={human} />);
    const known = screen.getByTestId("person-tag-chip-verified-human").firstElementChild!.className;

    rerender(<PersonTagChips tag={tag("lfo", "lfo", { unverified: true })} />);
    const chip = screen.getByTestId("person-tag-chip-lfo");
    expect(chip.firstElementChild!.className).toBe(known);
    expect(chip).not.toHaveAttribute("data-unverified");
    expect(chip).toHaveAttribute("title", "Tagged lfo by 12 people · see who else");
  });
});
