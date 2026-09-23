/**
 * The article card in the Articles tab. A wiki page (kind 30818) carries no
 * summary tag, so the card showed a title and nothing else — and called an
 * AsciiDoc page mirrored from Wikipedia an "Article". It reads the page's
 * words as its brief and says what it is.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { EmbeddedArticleCard } from "./EmbeddedArticleCard";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));

const PK = "a".repeat(64);
function page(kind: number, content: string, tags: string[][]): MinimalEvent {
  return { id: "e".repeat(64), kind, pubkey: PK, tags, content, created_at: Math.floor(Date.now() / 1000) - 3600 } as MinimalEvent;
}

describe("EmbeddedArticleCard", () => {
  it("a wiki page without a summary shows its words as the brief and calls itself a Wiki", () => {
    const wiki = page(30818, "A [[comedian]] is one who entertains through [[comedy]].\n\n== Comedians\n=== A\n* [[Celya AB]] (born 1995)", [["d", "list-of-comedians"], ["title", "List of comedians"]]);
    render(<EmbeddedArticleCard event={wiki} author={{ name: "GitCitadel" }} />);
    const card = screen.getByTestId("embedded-article");
    expect(card).toHaveTextContent("List of comedians");
    expect(card).toHaveTextContent("A comedian is one who entertains through comedy. Celya AB (born 1995)");
    expect(card.textContent).not.toMatch(/\[\[|==/);
    expect(card).toHaveTextContent("Wiki");
    expect(card).not.toHaveTextContent("Article");
  });

  // A spec (kind 30817) reads like an article and says what it is — and which kinds it covers.
  it("a spec calls itself a Spec and names the kinds it covers", () => {
    const spec = page(30817, "# Scheduler DVM", [["d", "scheduler-dvm"], ["title", "Scheduler DVM"], ["summary", "Schedule signed events for later."], ["k", "5905", "DVM Job Request"], ["k", "7000"]]);
    render(<EmbeddedArticleCard event={spec} author={{ name: "nogringo" }} />);
    const card = screen.getByTestId("embedded-article");
    expect(card).toHaveTextContent("Spec");
    expect(card).not.toHaveTextContent("Article");
    expect(card).toHaveTextContent("Schedule signed events for later.");
    expect(screen.getByTestId("article-kinds")).toHaveTextContent("5905");
    expect(screen.getByTestId("article-kinds")).toHaveTextContent("7000");
  });

  // Specs wore the generic Brainstorm article cover (Benjamin, 2026-09-23:
  // "when showing Specs in search lets use this image — name it for SEO").
  // A spec with no image of its own gets the NIP cover, named and described
  // for what it is.
  it("a spec without an image wears the NIP cover, named for search engines", () => {
    const spec = page(30817, "# Trusted Assertions", [["d", "trusted-assertions"], ["title", "Trusted Assertions"], ["k", "10040"]]);
    render(<EmbeddedArticleCard event={spec} author={{ name: "Russell" }} />);
    const img = screen.getByTestId("embedded-article").querySelector("img")!;
    expect(img.getAttribute("src")).toMatch(/nostr-implementation-decentralized-network-specs-cover/);
    expect(img.getAttribute("alt")).toBe("Nostr Implementation — decentralized network specs");
  });

  // NoorNote's capability profile lists forty kinds; its card ran to nine
  // rows of chips beside cards with one (Benjamin, 2026-09-23: "a limit on
  // how many show, so they all look aligned"). Six, then how many more —
  // the spec page has them all — and the kind the search asked for leads,
  // so a reader sees why the card matched.
  it("shows six kinds and counts the rest, with the searched kind first", () => {
    const kinds = [0, 1, 3, 4, 5, 6, 7, 8, 13, 14, 30078, 30311, 32267].map((k) => ["k", String(k)]);
    const spec = page(30817, "# NoorNote", [["d", "noornote"], ["title", "NoorNote"], ...kinds]);
    render(<EmbeddedArticleCard event={spec} author={{ name: "alp" }} leadKinds={["30078"]} />);
    const row = screen.getByTestId("article-kinds");
    expect([...row.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["kind 30078", "kind 0", "kind 1", "kind 3", "kind 4", "kind 5"]);
    expect(screen.getByTestId("article-kinds-more")).toHaveTextContent("+7 more");
  });

  // "Read article" under a SPEC label contradicts itself (Benjamin, 2026-09-23).
  it("the button says what it opens: spec, wiki, article", () => {
    render(<EmbeddedArticleCard event={page(30817, "# TA", [["d", "ta"], ["title", "TA"]])} author={{ name: "Russell" }} />);
    expect(screen.getByTestId("article-read")).toHaveTextContent(/^Read spec$/);
  });
  it("a wiki page reads as a wiki", () => {
    render(<EmbeddedArticleCard event={page(30818, "A page.", [["d", "x"], ["title", "X"]])} author={{ name: "GitCitadel" }} />);
    expect(screen.getByTestId("article-read")).toHaveTextContent(/^Read wiki$/);
  });

  // Thumbnails stretched to the card's text height and cropped a different
  // slice of the same cover on every card (Benjamin, 2026-09-23: "why are
  // the Brainstorm article images different sizes?"; the NIP banner's edges
  // cut off). One shape for every card — 16:9, the shape covers are — with
  // its dimensions declared so the page does not jump as they load.
  it("every card's thumbnail is the same 16:9 shape, declared up front", () => {
    const spec = page(30817, "# TA", [["d", "ta"], ["title", "TA"]]);
    render(<EmbeddedArticleCard event={spec} author={{ name: "ManiMe" }} />);
    const img = screen.getByTestId("embedded-article").querySelector("img")!;
    expect(img.className).toMatch(/\baspect-video\b/);
    expect(img.className).not.toMatch(/self-stretch|object-top/);
    expect(img.getAttribute("width")).toBe("1280");
    expect(img.getAttribute("height")).toBe("720");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  // A `k` tag that is not a number ("nip", seen on Trusted Assertions
  // (Sovereign Version)) is not a kind — no chip, no broken search.
  it("only numeric k tags are kinds", () => {
    const spec = page(30817, "# TA", [["d", "ta"], ["title", "TA"], ["k", "10040"], ["k", "nip"]]);
    render(<EmbeddedArticleCard event={spec} author={{ name: "ManiMe" }} />);
    expect([...screen.getByTestId("article-kinds").querySelectorAll("a")].map((a) => a.textContent)).toEqual(["kind 10040"]);
  });

  // The kind chips are the NIPs tab's filter — no chip row on the tab itself
  // (the team's "too busy"; Benjamin 2026-09-23). Each opens the specs that
  // cover that kind, in numeric order.
  it("a spec's kind chips open the specs that cover that kind", () => {
    const spec = page(30817, "# Scheduler DVM", [["d", "scheduler-dvm"], ["title", "Scheduler DVM"], ["k", "7000"], ["k", "5905"]]);
    render(<EmbeddedArticleCard event={spec} author={{ name: "nogringo" }} />);
    const links = [...screen.getByTestId("article-kinds").querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["kind 5905", "kind 7000"]);
    expect(links[0].getAttribute("href")).toBe("/?t=nips&q=kind%3A5905");
  });

  it("a long-form article keeps its own summary and its name", () => {
    const article = page(30023, "# Why\n\nBody **bold**.", [["d", "why"], ["title", "Why Bitcoin"], ["summary", "A short case for sound money."]]);
    render(<EmbeddedArticleCard event={article} author={{ name: "Max" }} />);
    const card = screen.getByTestId("embedded-article");
    expect(card).toHaveTextContent("A short case for sound money.");
    expect(card).not.toHaveTextContent("Body");
    expect(card).toHaveTextContent("Article");
  });
});
