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

  it("a long-form article keeps its own summary and its name", () => {
    const article = page(30023, "# Why\n\nBody **bold**.", [["d", "why"], ["title", "Why Bitcoin"], ["summary", "A short case for sound money."]]);
    render(<EmbeddedArticleCard event={article} author={{ name: "Max" }} />);
    const card = screen.getByTestId("embedded-article");
    expect(card).toHaveTextContent("A short case for sound money.");
    expect(card).not.toHaveTextContent("Body");
    expect(card).toHaveTextContent("Article");
  });
});
