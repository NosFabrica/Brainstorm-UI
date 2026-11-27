// @vitest-environment jsdom
/**
 * Every content and media kind through the cards that draw it in a list: the
 * Top page's and the grid's generic row (SerpRow), the Media tab's card
 * (MediaCard) and tile (MediaTiles), and a quote (EmbeddedNoteCard). One
 * spec-shaped fixture per kind (test/contentKindFixtures): none may fall to
 * the generic reading — "Structured data", raw JSON, a file's URL as words,
 * a sound drawn as a video — and each shows what the spec's own fields say.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { nip19, type NostrEvent } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";
import { AUTHOR, CONTENT_KIND_FIXTURES, OTHER, PUBLISHED_AT } from "@/test/contentKindFixtures";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async () => new Map(),
  fetchEventsByIds: async () => [],
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => () => {} }));

import { SerpRow } from "./SerpRow";
import { MediaCard } from "./cards";
import { MediaTiles, hasVisual } from "./RichSections";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { TAB_KINDS } from "@/services/search";

beforeEach(() => stubVisibleIntersectionObserver());

const fixture = (name: string) => CONTENT_KIND_FIXTURES.find((f) => f.name.startsWith(name))!.event;
const asHit = (event: MinimalEvent) => ({ event: event as NostrEvent, author: null, rank: null });
/** What the generic reading of a structured event or a bare file looks like. */
const GENERIC = /Structured data|^\s*\{|"id":|https?:\/\//;
const VOICE = /^(1222|1244) /;

describe("the generic row (SerpRow) reads every content kind", () => {
  it.each(CONTENT_KIND_FIXTURES.map((f) => [f.name, f] as const))("%s", (name, { event, shows }) => {
    renderWithProviders(<SerpRow event={event as NostrEvent} author={null} query="" />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Structured data/);
    expect(text).not.toContain('"id":');
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).toContain(VOICE.test(name) ? "Voice" : shows);
  });
});

describe("the Media tab's card and tile draw each media kind as what it is", () => {
  const MEDIA = CONTENT_KIND_FIXTURES.filter((f) => TAB_KINDS.media.includes(f.event.kind) && f.event.kind !== 2003);
  it.each(MEDIA.map((f) => [f.name, f] as const))("%s", (name, { event, shows }) => {
    renderWithProviders(<MediaCard event={event as NostrEvent} author={null} />);
    const card = screen.getByTestId(`media-card-${event.id}`);
    expect(card.textContent).not.toMatch(GENERIC);
    if (VOICE.test(name)) {
      // A sound plays as one, never as a clip.
      expect(card.querySelector("video")).toBeNull();
      expect(card).toHaveTextContent("Voice message");
    } else expect(card).toHaveTextContent(shows);
    cleanup();

    // A tile is a picture or a clip: a sound with no picture stays a row (the Top page tiles what `hasVisual` passes).
    expect(hasVisual(event as NostrEvent)).toBe(!VOICE.test(name));
    if (VOICE.test(name)) return;
    renderWithProviders(<MediaTiles hits={[asHit(event)]} />);
    expect(screen.getByTestId(`media-tile-${event.id}`).textContent).not.toMatch(GENERIC);
  });
});

describe("a quote (EmbeddedNoteCard) draws each kind as its card, not its JSON", () => {
  it.each(CONTENT_KIND_FIXTURES.map((f) => [f.name, f] as const))("%s", (name, { event, shows }) => {
    renderWithProviders(<EmbeddedNoteCard event={event} author={{ name: "Maker" }} href="/e/x" />);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain('"id":');
    expect(text).not.toMatch(/Structured data/);
    // A profile quoted is one line that says it is a person; the rest say their own words.
    if (event.kind === 0) expect(text).toContain("Person");
    else if (!VOICE.test(name)) expect(text).toContain(shows);
  });
});

describe("the row's readings a fix put right", () => {
  it("a repost is its post under who reposted it (NIP-18), and names a generic repost's kind by `k`", () => {
    renderWithProviders(<SerpRow event={fixture("6 ") as NostrEvent} author={null} query="" />);
    expect(screen.getByTestId(`serp-repost-${fixture("6 ").id}`)).toHaveTextContent("Good morning from the mountains");
    cleanup();
    const byAddress = {
      ...fixture("16 "),
      content: "",
      tags: [
        ["e", "f".repeat(64)],
        ["a", `30023:${OTHER}:guide`],
        ["k", "30023"],
      ],
    };
    renderWithProviders(<SerpRow event={byAddress as NostrEvent} author={null} query="" />);
    const link = screen.getByTestId("serp-repost-link");
    expect(link).toHaveTextContent("reposted article");
    expect(link.getAttribute("href")).toMatch(/^\/e\/naddr1/);
  });

  it("an article's row is its NIP-23 summary, not its markdown", () => {
    renderWithProviders(<SerpRow event={fixture("30023 ") as NostrEvent} author={null} query="" />);
    expect(document.body).toHaveTextContent("Everything you need before you go");
    expect(document.body.textContent).not.toContain("##");
  });

  it("a profile's row is the person, never its JSON (NIP-01/24)", () => {
    renderWithProviders(<SerpRow event={fixture("0 ") as NostrEvent} author={null} query="" />);
    expect(document.body).toHaveTextContent("Alice Liddell");
    expect(document.body).toHaveTextContent("Down the rabbit hole");
  });

  it("a voice message plays in its row, its caption without the file's URL (NIP-A0)", () => {
    const voice = { ...fixture("1222 voice (NIP-A0)"), content: "https://blossom.test/voice.mp4 morning thoughts" };
    renderWithProviders(<SerpRow event={voice as NostrEvent} author={null} query="" />);
    expect(document.body).toHaveTextContent("morning thoughts");
    expect(document.body).toHaveTextContent("Voice message");
    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector("[data-testid=serp-video-thumb]")).toBeNull();
  });

  it("an `naddr` in a note's words is a way to it (NIP-27), never its key", () => {
    const naddr = nip19.naddrEncode({ kind: 30023, pubkey: AUTHOR, identifier: "guide" });
    const note: MinimalEvent = { ...fixture("1 "), tags: [], content: `Read this nostr:${naddr}` };
    renderWithProviders(<SerpRow event={note as NostrEvent} author={null} query="" />);
    expect(document.body.textContent).not.toContain("naddr1");
    const link = screen.getByTestId("serp-address-link");
    expect(link).toHaveTextContent("article");
    expect(link.getAttribute("href")).toBe(`/e/${naddr}`);
  });

  it("a quoted NIP-7D thread leads with its title", () => {
    renderWithProviders(<EmbeddedNoteCard event={fixture("11 ")} author={{ name: "Maker" }} href="/e/x" />);
    expect(screen.getByTestId("embedded-heading")).toHaveTextContent("Favourite trails");
  });

  it("an article's card is dated by its NIP-23 published_at, as its own page is", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date((PUBLISHED_AT + 400 * 86_400) * 1000));
    try {
      renderWithProviders(<EmbeddedArticleCard event={fixture("30023 ")} author={{ name: "Maker" }} />);
      // 400 days after it was published; its created_at (an edit) is far later.
      expect(screen.getByTestId("embedded-article")).toHaveTextContent("13mo ago");
    } finally {
      vi.useRealTimers();
    }
  });
});
