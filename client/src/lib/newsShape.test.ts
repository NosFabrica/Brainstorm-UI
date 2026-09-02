// @vitest-environment node
/**
 * News-shaped note detection. The wire has no OG unfurl (CORS forbids it
 * browser-side; no proxy yet) — but the news bots EMBED their metadata:
 * headline first, the article URL, then the description. Parse that
 * structure and the SERP can render true news cards without a server.
 */
import { describe, expect, it } from "vitest";
import { parseNewsShape } from "./newsShape";

const ECHO =
  "Everton fan group 'standing down' after being left 'disgusted' over transfer window\n" +
  "https://www.liverpoolecho.co.uk/sport/football/football-news/everton-fan-group-standing-down-34554156\n" +
  "Everton fans' group the 1878s have issued a statement saying they are standing down due to their disgust over the transfer window.";

describe("parseNewsShape", () => {
  it("splits headline / article URL / description out of a news-bot note", () => {
    const news = parseNewsShape(ECHO)!;
    expect(news.headline).toBe(
      "Everton fan group 'standing down' after being left 'disgusted' over transfer window",
    );
    expect(news.url).toContain("liverpoolecho.co.uk");
    expect(news.domain).toBe("liverpoolecho.co.uk");
    expect(news.description).toContain("the 1878s have issued a statement");
  });

  it("pulls an embedded image URL out as the thumbnail", () => {
    const news = parseNewsShape(
      "Big comeback win against City tonight\nhttps://news.example/story\nWhat a match. https://cdn.example/photo.jpg",
    )!;
    expect(news.imageUrl).toBe("https://cdn.example/photo.jpg");
    // The image URL doesn't leak into the visible description.
    expect(news.description).not.toContain("photo.jpg");
  });

  it("keeps nostr: mention tokens in the description for the renderer", () => {
    // The renderer turns these into the person's name + picture — stripping
    // them here would lose the mention entirely.
    const news = parseNewsShape(
      "2026-27 WSL preview: Full table prediction\nhttps://espn.com/story\nPosted into Soccer nostr:nprofile1qy2hwumn9gh",
    )!;
    expect(news.description).toBe("Posted into Soccer nostr:nprofile1qy2hwumn9gh");
  });

  it("returns null for notes that aren't news-shaped", () => {
    expect(parseNewsShape("gm, liverpool is doing fine")).toBeNull(); // no URL
    expect(parseNewsShape("https://example.com/x")).toBeNull(); // no headline
    expect(parseNewsShape("check this out https://example.com/x")).toBeNull(); // a share, not a story
    const tooLong = parseNewsShape(`${"word ".repeat(60)}\nhttps://example.com/x`);
    expect(tooLong).toBeNull(); // a wall of text before the link is a post, not a headline
  });
});
