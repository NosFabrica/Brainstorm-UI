// @vitest-environment jsdom
/**
 * A quoted event drawn as words only when it has words: a profile, a repost,
 * app data or a contact list is one line that says what it is (its NIP-31
 * `alt` when it has one), and a repost is the note it reposts. The card opens
 * its page from the keyboard too, a reveal survives a newer version of the
 * same address, a kind card keeps the caller's link and score, and a quote is
 * its own post: the quoting post's reveal does not show it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async () => new Map(),
  fetchEventsByIds: async () => [],
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));

import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { NoteContent } from "./NoteContent";
import { SensitiveRevealScope } from "./SensitiveMedia";

const PK = "4".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][] = [], content = ""): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey: PK,
  created_at: 1_790_000_000,
  tags,
  content,
});
const quote = (event: MinimalEvent, extra: { nested?: boolean; href?: string } = {}) =>
  renderWithProviders(<EmbeddedNoteCard event={event} author={{ name: "Maker" }} href="/e/x" {...extra} />);

beforeEach(() => stubVisibleIntersectionObserver());

describe("a quoted event with no words to read", () => {
  it("a profile is one line, never its JSON or its picture", () => {
    quote(ev(0, [], JSON.stringify({ name: "alice", about: "hi", picture: "https://x.test/y.png" })));
    const line = screen.getByTestId("embedded-structural");
    expect(line).toHaveTextContent("Person");
    expect(screen.getByTestId("embedded-note")).not.toHaveTextContent("{");
    expect(document.querySelector("img[src*='y.png']")).toBeNull();
  });

  it("app data says its alt; an empty contact list or zap says its kind", () => {
    const { unmount } = quote(
      ev(
        30078,
        [
          ["d", "app"],
          ["alt", "Ditto settings"],
        ],
        JSON.stringify({ a: 1 }),
      ),
    );
    expect(screen.getByTestId("embedded-structural")).toHaveTextContent("Ditto settings");
    unmount();
    for (const e of [
      ev(3, [["p", "5".repeat(64)]]),
      ev(9735, [
        ["p", PK],
        ["bolt11", "lnbc1"],
      ]),
    ]) {
      const r = quote(e);
      expect(screen.getByTestId("embedded-structural").textContent?.trim()).not.toBe("");
      r.unmount();
    }
  });

  it("a repost is the note it reposts, one level down", () => {
    const inner = { ...ev(1, [], "reposted words"), sig: "s" };
    quote(
      ev(
        6,
        [
          ["e", inner.id],
          ["p", PK],
        ],
        JSON.stringify(inner),
      ),
    );
    const cards = screen.getAllByTestId("embedded-note");
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveTextContent("reposted words");
    expect(cards[0]).not.toHaveTextContent('"content"');
  });

  it("a repost inside a quote is one line, never a card inside a card inside a card", () => {
    const inner = { ...ev(1, [], "reposted words"), sig: "s" };
    quote(ev(6, [["e", inner.id]], JSON.stringify(inner)), { nested: true });
    expect(screen.getAllByTestId("embedded-note")).toHaveLength(1);
    expect(screen.getByTestId("embedded-structural")).toHaveTextContent("Repost");
  });
});

describe("a quoted card that opens a page", () => {
  it("is reachable from the keyboard: its time is a link to the page", () => {
    quote(ev(1, [], "gm"), { href: "/e/naddr1abc" });
    const card = screen.getByTestId("embedded-note");
    const link = within(card).getByTestId("embedded-open");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/e/naddr1abc");
    // Never a link inside a link.
    expect(link.querySelector("a, button")).toBeNull();
  });
});

describe("a reveal and a newer version of the same address", () => {
  const stream = (id: string, viewers: string): MinimalEvent => ({
    id: id.repeat(64),
    kind: 30311,
    pubkey: PK,
    created_at: 1_790_000_000,
    content: "",
    tags: [
      ["d", "s"],
      ["title", "Stream"],
      ["status", "live"],
      ["current_participants", viewers],
      ["content-warning", "nsfw"],
    ],
  });

  it("survives: the stream is the same stream", () => {
    const { rerender } = quote(stream("a", "1"));
    fireEvent.click(screen.getByTestId("sensitive-show"));
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
    rerender(<EmbeddedNoteCard event={stream("b", "2")} author={{ name: "M" }} href="/e/x" />);
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
  });
});

describe("a kind card keeps what its caller knows", () => {
  it("the caller's link (with its relay hints) is where the card opens", () => {
    quote(
      ev(30311, [
        ["d", "s"],
        ["title", "Stream"],
        ["status", "live"],
      ]),
      { href: "/e/naddr1withhints" },
    );
    const card = screen.getByTestId("embedded-card");
    expect(within(card).getAllByRole("link")[0].getAttribute("href")).toBe("/e/naddr1withhints");
  });
});

describe("a quote inside a sensitive post", () => {
  it("is asked for on its own: the post's reveal does not show it", () => {
    const quoted = ev(1, [["content-warning", "gore"]], "inner https://x.test/inner.jpg");
    renderWithProviders(
      <SensitiveRevealScope>
        <NoteContent content="outer https://x.test/outer.jpg" contentWarning={{ reason: "nsfw" }} />
        <EmbeddedNoteCard event={quoted} author={{ name: "Q" }} />
      </SensitiveRevealScope>,
    );
    const shows = screen.getAllByTestId("sensitive-show");
    expect(shows).toHaveLength(2);
    fireEvent.click(shows[0]);
    expect(screen.getAllByTestId("sensitive-show")).toHaveLength(1);
    expect(document.querySelector("img[src*='inner']")).toBeNull();
  });
});
