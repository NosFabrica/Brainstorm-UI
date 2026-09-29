/**
 * The tag chips on a person's row in search: the matched tags the network
 * put on them, right-aligned, each one tap to the tag page — the collection,
 * how it was formed, who else. Rendered without a router — wouter's Link
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
  it("one link per tag, in order, to the tag's page", () => {
    render(<PersonTagChips tags={[human, author]} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    const chip = screen.getByTestId("person-tag-chip-verified-human");
    expect(chip.getAttribute("href")).toBe(`/tags/${nip19.npubEncode(AUTHOR)}/verified-human`);
    expect(chip).toHaveTextContent("Verified Human");
    expect(chip).toHaveAttribute("title", "Tagged Verified Human by 12 people · see who else");
    expect(screen.getByTestId("person-tag-chip-author")).toHaveAttribute(
      "title",
      "Tagged Author by 1 person · see who else",
    );
    expect(screen.getByTestId("person-tag-chips")).toHaveAttribute("data-state", "ready");
  });

  it("reserves its slot while the lookup is out, and when there is nothing to say", () => {
    const { rerender } = render(<PersonTagChips tags={undefined} />);
    expect(screen.getByTestId("person-tag-chips")).toHaveAttribute("data-state", "pending");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    rerender(<PersonTagChips tags={[]} />);
    expect(screen.getByTestId("person-tag-chips")).toHaveAttribute("data-state", "ready");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("a click opens the tag page and never reaches the row", () => {
    const rowClick = vi.fn();
    const onNavigate = vi.fn();
    render(
      <div onClick={rowClick}>
        <PersonTagChips tags={[human]} onNavigate={onNavigate} linkTabIndex={-1} />
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

  it("says what it does not know about a tag's creator, quietly", () => {
    render(<PersonTagChips tags={[tag("lfo", "lfo", { unverified: true })]} />);
    const chip = screen.getByTestId("person-tag-chip-lfo");
    expect(chip).toHaveAttribute("data-unverified", "true");
    expect(chip).toHaveAttribute("title", expect.stringContaining("don't know anything about whoever made this tag"));
  });

  it("says the matched tag loudly and the person's other tags quietly, matched first", () => {
    render(<PersonTagChips tags={[author, human]} emphasis={new Set([`${AUTHOR}:verified-human`])} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("data-testid"))).toEqual([
      "person-tag-chip-verified-human",
      "person-tag-chip-author",
    ]);
    expect(screen.getByTestId("person-tag-chip-verified-human")).toHaveAttribute("data-emphasis", "loud");
    expect(screen.getByTestId("person-tag-chip-author")).toHaveAttribute("data-emphasis", "quiet");
  });

  it("shows at most three", () => {
    render(<PersonTagChips tags={[human, author, tag("dev", "Dev"), tag("four", "Four")]} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByTestId("person-tag-chip-four")).toBeNull();
  });
});
