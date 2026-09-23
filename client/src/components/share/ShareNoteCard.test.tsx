import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";

import { renderWithProviders } from "@/test/utils";
import { ShareNoteCard } from "./ShareNoteCard";
import type { MinimalEvent } from "@/lib/noteRefs";

// The page is not what's under test; the card is a player either way.
vi.mock("@/lib/fountain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fountain")>()),
  useFountainItem: () => ({ loading: false, item: null }),
}));
const unfurlMock = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: unfurlMock }));
// A Primal link's resolution, controlled per test: what it settles to, and when.
const clientLink = vi.hoisted(() => ({
  resolve: vi.fn<(ref: unknown) => Promise<unknown>>(() => new Promise(() => {})),
  peek: vi.fn<(ref: unknown) => unknown>(() => undefined),
}));
vi.mock("@/services/clientLinks", () => ({ resolveClientLink: clientLink.resolve, peekClientLink: clientLink.peek }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));

const PUBKEY = "a".repeat(64);
const base = { pubkey: PUBKEY, tags: [] as string[][], created_at: 1_700_000_000 };
const repost: MinimalEvent = { ...base, id: "r".repeat(64), kind: 6, content: "" };
const note: MinimalEvent = { ...base, id: "n".repeat(64), kind: 1, content: "hello" };

function card(event: MinimalEvent) {
  return <ShareNoteCard event={event} profiles={new Map()} eventsById={new Map()} />;
}

describe("ShareNoteCard", () => {
  // Rendered unkeyed on the featured slot and the /e page, so one instance can
  // flip between a repost and a note. The repost early return must not change
  // the hook count (React: "Rendered fewer hooks than expected").
  it("survives the same instance flipping between repost and note", () => {
    const { rerender } = renderWithProviders(card(repost));
    expect(screen.getByTestId("note-repost")).toBeInTheDocument();

    expect(() => rerender(card(note))).not.toThrow();
    expect(screen.getByTestId("note-card")).toBeInTheDocument();

    expect(() => rerender(card(repost))).not.toThrow();
    expect(screen.getByTestId("note-repost")).toBeInTheDocument();
  });

  // Like Wavlake and YouTube, a Fountain link plays where it sits in the text.
  // It used to get an inline chip and a second player card below the note.
  it("renders a Fountain link once, inline, not as chip plus card", () => {
    const fountain: MinimalEvent = { ...base, id: "f".repeat(64), kind: 1, content: "listen https://fountain.fm/episode/abc123" };
    renderWithProviders(card(fountain));
    expect(screen.queryAllByTestId("link-chip")).toHaveLength(0);
    expect(unfurlMock).not.toHaveBeenCalled();
  });

  /**
   * A note whose content is a Primal article URL rendered as a bare
   * "primal.net" chip that left Brainstorm for Primal (Benjamin, 2026-09-23).
   * The link names a Nostr article; it renders as the article, here.
   */
  describe("a Primal link", () => {
    const AUTHOR = "7".repeat(64);
    const article = { id: "4".repeat(64), kind: 30023, pubkey: AUTHOR, tags: [["d", "were-back"], ["title", "We're back"], ["summary", "White Noise is back on iOS and Android."]], content: "# We're back", created_at: 1, sig: "s" };
    const post: MinimalEvent = { ...base, id: "p".repeat(64), kind: 1, content: "https://primal.net/whitenoise/were-back" };

    beforeEach(() => {
      stubVisibleIntersectionObserver();
      unfurlMock.mockClear();
      clientLink.peek.mockReturnValue(undefined);
      clientLink.resolve.mockImplementation(() => new Promise(() => {}));
    });

    it("shows the chip while the link resolves, and asks no preview for it", () => {
      renderWithProviders(card(post));
      expect(screen.getAllByTestId("link-chip")).toHaveLength(1);
      expect(screen.queryByTestId("embedded-article")).toBeNull();
      expect(unfurlMock).not.toHaveBeenCalled();
    });

    it("renders the article it names, in place of the chip, opening here", async () => {
      clientLink.resolve.mockResolvedValue({ kind: "article", event: article, author: { name: "White Noise" } });
      renderWithProviders(card(post));
      const embedded = await screen.findByTestId("embedded-article");
      expect(embedded).toHaveTextContent("We're back");
      expect(embedded).toHaveTextContent("White Noise");
      expect(screen.queryAllByTestId("link-chip")).toHaveLength(0);
      expect(screen.getByTestId("article-read").getAttribute("href")).toBe(`/a/${nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: "were-back" })}`);
      expect(unfurlMock).not.toHaveBeenCalled();
    });

    it("renders a person's link as their name, the way an npub mention reads", async () => {
      const who: MinimalEvent = { ...base, id: "w".repeat(64), kind: 1, content: "follow https://primal.net/whitenoise" };
      clientLink.resolve.mockResolvedValue({ kind: "profile", pubkey: AUTHOR, npub: nip19.npubEncode(AUTHOR), profile: { display_name: "White Noise" } });
      renderWithProviders(card(who));
      const mention = await screen.findByRole("button", { name: "@White Noise" });
      expect(screen.queryAllByTestId("link-chip")).toHaveLength(0);
      expect(unfurlMock).not.toHaveBeenCalled();
      fireEvent.click(mention);
    });

    it("keeps the chip, and asks for the preview, when the link resolves to nothing", async () => {
      clientLink.resolve.mockResolvedValue(null);
      renderWithProviders(card(post));
      await waitFor(() => expect(unfurlMock).toHaveBeenCalledWith("https://primal.net/whitenoise/were-back"));
      expect(screen.getAllByTestId("link-chip")).toHaveLength(1);
      expect(screen.queryByTestId("embedded-article")).toBeNull();
    });
  });
});
