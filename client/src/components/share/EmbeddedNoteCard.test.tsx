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
const QUOTED_AUTHOR = "7".repeat(64);
const MENTIONED = "8".repeat(64);
const QUOTED = { id: "d".repeat(64), kind: 1, pubkey: QUOTED_AUTHOR, created_at: 1_779_000_000, sig: "", content: "Some days posting here feels like nobody's listening.", tags: [] };
const byIds = vi.fn(async (ids: string[]) => (ids.includes(QUOTED.id) ? [QUOTED] : []));

vi.mock("@/services/nostr", () => ({
  fetchAddressableEvents: (c: unknown) => addressable(c),
  fetchEventsByIds: (ids: string[]) => byIds(ids),
  fetchProfileMap: async (pks: string[]) => new Map(pks.flatMap((pk) => (pk === QUOTED_AUTHOR ? [[pk, { name: "Derek Ross" }]] : pk === MENTIONED ? [[pk, { name: "Max" }]] : []))),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));

import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { __resetLinkedArticles } from "@/hooks/useLinkedArticles";
import { __resetQuotedNotes } from "@/hooks/useQuotedNotes";

beforeEach(() => {
  vi.clearAllMocks();
  __resetLinkedArticles();
  __resetQuotedNotes();
});

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

  it("a note that quotes another shows the quoted note itself — its author and words — not a '↳ quoted note' link", async () => {
    const nevent = nip19.neventEncode({ id: QUOTED.id });
    const note = { id: "e".repeat(64), kind: 1, pubkey: AUTHOR, created_at: 1_780_000_200, content: `This. nostr:${nevent}`, tags: [["q", QUOTED.id]] };
    renderWithProviders(<EmbeddedNoteCard event={note} author={{ name: "Hope With ₿itcoin" }} />);
    const quoted = await screen.findByTestId("embedded-quote");
    expect(quoted).toHaveTextContent("Derek Ross");
    expect(quoted).toHaveTextContent("Some days posting here feels like nobody's listening.");
    await waitFor(() => expect(screen.queryByText("↳ quoted note")).toBeNull());
  });

  it("a quoted note's own quotes stay links — one level deep, never a card inside a card inside a card", async () => {
    const inner = nip19.neventEncode({ id: "f".repeat(64) });
    const quotedWithQuote = { ...QUOTED, id: "d".repeat(64), content: `Look: nostr:${inner}`, tags: [["q", "f".repeat(64)]] };
    byIds.mockResolvedValueOnce([quotedWithQuote]);
    const nevent = nip19.neventEncode({ id: QUOTED.id });
    const note = { id: "e".repeat(64), kind: 1, pubkey: AUTHOR, created_at: 1_780_000_200, content: `nostr:${nevent}`, tags: [["q", QUOTED.id]] };
    renderWithProviders(<EmbeddedNoteCard event={note} author={{ name: "Hope With ₿itcoin" }} />);
    const quoted = await screen.findByTestId("embedded-quote");
    expect(quoted).toHaveTextContent("↳ quoted note");
    expect(byIds).toHaveBeenCalledTimes(1);
  });

  it("a person mentioned inside the quoted note is named, not shown as a key", async () => {
    const mentioned = nip19.npubEncode(MENTIONED);
    const quotedWithMention = { ...QUOTED, content: `Write the code with nostr:${mentioned}` };
    byIds.mockResolvedValueOnce([quotedWithMention]);
    const nevent = nip19.neventEncode({ id: QUOTED.id });
    const note = { id: "e".repeat(64), kind: 1, pubkey: AUTHOR, created_at: 1_780_000_200, content: `nostr:${nevent}`, tags: [["q", QUOTED.id]] };
    renderWithProviders(<EmbeddedNoteCard event={note} author={{ name: "Hope With ₿itcoin" }} />);
    const quoted = await screen.findByTestId("embedded-quote");
    await waitFor(() => expect(quoted).toHaveTextContent("@Max"));
    expect(quoted).not.toHaveTextContent("npub1");

  });
});

// feat/hide-blank-events: a quoted note its author deleted by overwriting is a
// quiet stub in the quote's place — the reader still learns what the note was
// about, and nothing asks to be clicked.
const HUSK_PK = "a".repeat(64);
const husk = (content: string, tags: string[][] = []) =>
  ({ id: "e".repeat(64), kind: 1, pubkey: HUSK_PK, tags, content, created_at: 1_700_000_000 }) as import("@/lib/noteRefs").MinimalEvent;

describe("EmbeddedNoteCard — deleted by overwriting", () => {
  it("a quoted note deleted by overwriting is a quiet stub — named when we know who, generic when we don't", () => {
    const { rerender } = renderWithProviders(<EmbeddedNoteCard event={husk("")} author={{ display_name: "Zap Cooking" }} href="/e/x" />);
    const stub = screen.getByTestId("embedded-deleted");
    expect(stub).toHaveTextContent("Zap Cooking deleted this post.");
    expect(screen.queryByTestId("embedded-note")).toBeNull();
    expect(stub.querySelector("a, button, img")).toBeNull();
    rerender(<EmbeddedNoteCard event={husk("")} href="/e/x" />);
    expect(screen.getByTestId("embedded-deleted")).toHaveTextContent("This post was deleted by its author.");
  });

  it("a note with words is a note", () => {
    renderWithProviders(<EmbeddedNoteCard event={husk("gm")} author={{ display_name: "Zap Cooking" }} />);
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("gm");
    expect(screen.queryByTestId("embedded-deleted")).toBeNull();
  });
});
