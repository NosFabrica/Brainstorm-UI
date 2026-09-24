// @vitest-environment jsdom
/**
 * The compact note card — a quoted note, or a note in "More from this
 * author". Benjamin (2026-09-24), on Hope With Bitcoin's page: a note that
 * is nothing but a link to one of their articles showed as "📄 article",
 * where the article's own card — cover, title, summary — was expected, as
 * the note's full page already shows it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

const AUTHOR = "3".repeat(64);
const ARTICLE = {
  id: "a".repeat(64), kind: 30023, pubkey: AUTHOR, created_at: 1_780_000_000, sig: "",
  content: "**The 2nd edition** of our Back to School campaign is officially completed.",
  tags: [["d", "back-to-school-2026"], ["title", "Back to School 2026 — Mission Accomplished ❤️"], ["summary", "Through this update, we are happy to share the results"], ["image", "https://img/cover.jpg"]],
};
const addressable = vi.fn(async () => new Map([[`30023:${AUTHOR}:back-to-school-2026`, ARTICLE]]));

vi.mock("@/services/nostr", () => ({ fetchAddressableEvents: (c: unknown) => addressable(c), fetchProfileMap: async () => new Map() }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));

import { EmbeddedNoteCard } from "./EmbeddedNoteCard";

beforeEach(() => vi.clearAllMocks());

describe("EmbeddedNoteCard", () => {
  it("a note that links an article shows the article's card, not a bare '📄 article' link", async () => {
    const naddr = nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: "back-to-school-2026" });
    const note = { id: "b".repeat(64), kind: 1, pubkey: AUTHOR, created_at: 1_780_000_100, content: `nostr:${naddr}`, tags: [["a", `30023:${AUTHOR}:back-to-school-2026`]] };
    renderWithProviders(<EmbeddedNoteCard event={note} author={{ name: "Hope With ₿itcoin" }} />);
    const card = await screen.findByTestId("embedded-article");
    expect(card).toHaveTextContent("Back to School 2026 — Mission Accomplished ❤️");
    expect(card).toHaveTextContent("Through this update");
    await waitFor(() => expect(screen.queryByText("📄 article")).toBeNull());
    expect(addressable).toHaveBeenCalledWith([expect.objectContaining({ kind: 30023, pubkey: AUTHOR, identifier: "back-to-school-2026" })]);
  });

  it("a note with no article link asks the relays for nothing", () => {
    const note = { id: "c".repeat(64), kind: 1, pubkey: AUTHOR, created_at: 1_780_000_100, content: "Just words.", tags: [] };
    renderWithProviders(<EmbeddedNoteCard event={note} author={{ name: "Hope With ₿itcoin" }} />);
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("Just words.");
    expect(addressable).not.toHaveBeenCalled();
  });
});
