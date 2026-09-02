// @vitest-environment jsdom
/**
 * The compact SERP row, news-grade: a news-shaped note renders as a real
 * news card (clickable headline out to the article, source line, summary,
 * thumbnail); bare URLs in ordinary posts become clickable chips; the row
 * itself still opens the in-app event page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { SerpRow } from "./SerpRow";

vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));

function note(content: string, tags: string[][] = []): NostrEvent {
  return {
    id: "e".repeat(64),
    kind: 1,
    pubkey: "a".repeat(64),
    tags,
    content,
    created_at: Math.floor(Date.now() / 1000) - 3600,
    sig: "s",
  } as NostrEvent;
}

const author = {
  pubkey: "a".repeat(64),
  npub: "npub1echo",
  name: "Liverpool Echo Sport",
  wotRank: null,
  wotFollowers: null,
};

const NEWS =
  "Everton fan group 'standing down' after transfer window\n" +
  "https://www.liverpoolecho.co.uk/sport/story-34554156\n" +
  "The 1878s have issued a statement. https://cdn.example/photo.jpg";

beforeEach(() => {
  window.history.replaceState({}, "", "/?q=liverpool");
});

describe("SerpRow", () => {
  it("renders a news-shaped note as a news card with a clickable headline", () => {
    render(<SerpRow event={note(NEWS)} author={author} score={0.7} query="liverpool" />);

    const headline = screen.getByTestId("news-headline");
    expect(headline).toHaveTextContent("Everton fan group 'standing down'");
    expect(headline.getAttribute("href")).toContain("liverpoolecho.co.uk/sport/story-34554156");
    expect(headline.getAttribute("target")).toBe("_blank");

    // Source line: the outlet's domain, Google-News style.
    expect(screen.getByTestId("news-source")).toHaveTextContent("liverpoolecho.co.uk");
    // Description without the raw URLs.
    expect(screen.getByText(/The 1878s have issued a statement/)).toBeInTheDocument();
    expect(screen.queryByText(/photo\.jpg/)).toBeNull();
    // The embedded image is the thumbnail.
    const thumb = screen.getByTestId("news-thumb") as HTMLImageElement;
    expect(thumb.src).toContain("cdn.example/photo.jpg");
  });

  it("turns bare URLs in an ordinary post into clickable chips", () => {
    render(
      <SerpRow
        event={note("check this out https://example.com/thing and also some words")}
        author={author}
        score={0.7}
        query="liverpool"
      />,
    );
    const chip = screen.getByTestId("link-chip");
    expect(chip.getAttribute("href")).toBe("https://example.com/thing");
    expect(chip).toHaveTextContent("example.com");
    // The raw URL text is gone from the snippet.
    expect(screen.queryByText(/https:\/\/example\.com\/thing/)).toBeNull();
  });

  it("clicking the row body opens the in-app event page", () => {
    render(<SerpRow event={note("plain words about liverpool")} author={author} score={0.7} query="liverpool" />);
    fireEvent.click(screen.getByTestId(`serp-row-${"e".repeat(64)}`));
    expect(window.location.pathname).toMatch(/^\/e\//);
  });
});
