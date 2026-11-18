// @vitest-environment jsdom
/**
 * The tag row on an event's page reads and tags what the event is (issue
 * #334): an addressable event — a listing, an article, a DList item — by its
 * coordinate, so a tag survives its next edit; a note by its id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  read: vi.fn((..._a: unknown[]) => ({ data: { tags: [], mine: [], unverifiable: 0, trustUnverified: false } })),
  apply: vi.fn((..._a: unknown[]) => ({ mutate: vi.fn(), isPending: false })),
  options: [] as unknown[],
}));
vi.mock("@/hooks/useTags", () => ({
  useEventTags: (...a: unknown[]) => h.read(...a),
  useApplyEventTag: (...a: unknown[]) => h.apply(...a),
  usePickerTags: () => ({ data: h.options }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { inSentence, NoteTagChips } from "./NoteTagChips";

const ID = "7".repeat(64);
const LISTING = `30402:${"5".repeat(64)}:circular-hoodie`;

describe("NoteTagChips", () => {
  beforeEach(() => {
    h.read.mockClear();
    h.apply.mockClear();
    h.options = [];
  });

  it("reads and tags an addressable event by its coordinate", () => {
    render(<NoteTagChips eventId={ID} address={LISTING} relayHint="wss://r.example" canTag />);
    expect(h.read).toHaveBeenCalledWith(ID, LISTING);
    expect(h.apply).toHaveBeenCalledWith(ID, "wss://r.example", { address: LISTING });
  });

  it("reads and tags a note by its id", () => {
    render(<NoteTagChips eventId={ID} relayHint="wss://r.example" canTag />);
    expect(h.read).toHaveBeenCalledWith(ID, undefined);
    expect(h.apply).toHaveBeenCalledWith(ID, "wss://r.example", undefined);
  });

  it("offers tags for posts first, then those mostly on people, and a test tag only when typed", async () => {
    Element.prototype.scrollIntoView = () => {};
    const tag = (slug: string, band: "content" | "profile", unverified = false) => ({
      key: `${"a".repeat(64)}|${slug}`,
      authorPubkey: "a".repeat(64),
      slug,
      name: slug,
      people: band === "profile" ? 9 : 0,
      vouches: 1,
      sharesName: 1,
      unverified,
      band,
    });
    h.options = [tag("developer", "profile"), tag("stoicism", "content"), tag("qa-note-1784", "content", true)];
    render(<NoteTagChips eventId={ID} canTag />);
    fireEvent.click(screen.getByTestId("note-add-tag"));
    await screen.findByTestId("note-tag-search");
    expect(screen.getAllByTestId("note-tag-existing").map((e) => e.textContent)).toEqual(["stoicism"]);
    expect(screen.getAllByTestId("note-tag-for-people").map((e) => e.textContent)).toEqual(["developer"]);
    fireEvent.change(screen.getByTestId("note-tag-search"), { target: { value: "qa" } });
    expect(screen.getAllByTestId("note-tag-existing").map((e) => e.textContent)).toEqual(["qa-note-1784"]);
  });

  it("names what it tags: a Dictionary item as its list calls it, anything else a post", async () => {
    Element.prototype.scrollIntoView = () => {};
    const { unmount } = render(<NoteTagChips eventId={ID} address={LISTING} canTag noun="GitHub Account" />);
    expect(screen.getByTestId("note-add-tag")).toHaveTextContent("Tag this GitHub account");
    fireEvent.click(screen.getByTestId("note-add-tag"));
    expect(await screen.findByTestId("note-tag-search")).toHaveAttribute(
      "placeholder",
      "What is this GitHub account about?",
    );
    unmount();
    render(<NoteTagChips eventId={ID} canTag />);
    expect(screen.getByTestId("note-add-tag")).toHaveTextContent("Tag this post");
  });
});

describe("inSentence", () => {
  it("lowers a word that is only capitalised, and keeps one cased on purpose", () => {
    expect(inSentence("GitHub Account")).toBe("GitHub account");
    expect(inSentence("Food and Drink Place")).toBe("food and drink place");
    expect(inSentence("NIP")).toBe("NIP");
  });
});
