/**
 * Every content and media kind through the readers each surface draws from:
 * the embedded card's shape (lib/embedShape), the All tab's row
 * (lib/resultSummary), the kind's name and family (lib/kindLabel,
 * lib/kindFamily) and the date a card shows (lib/eventDate). One spec-shaped
 * fixture per kind (test/contentKindFixtures): no surface may fall to the
 * generic reading for it, and each says what the spec's own fields say.
 */
import { describe, expect, it } from "vitest";
import { CONTENT_KIND_FIXTURES, PUBLISHED_AT } from "@/test/contentKindFixtures";
import { embedShapeOf } from "@/lib/embedShape";
import { summarizeResult } from "@/lib/resultSummary";
import { kindLabel, kindTypeLabel } from "@/lib/kindLabel";
import { kindFamily } from "@/lib/kindFamily";
import { postedAtOf } from "@/lib/eventDate";
import { articleTitle } from "@/lib/publication";
import { describeThing } from "@/lib/thing";
import type { MinimalEvent } from "@/lib/noteRefs";

const fixture = (name: string) => CONTENT_KIND_FIXTURES.find((f) => f.name.startsWith(name))!.event;

/** What the embedded card draws each kind as: never the note card's words, but for posts that are words. */
const EMBED: Record<string, string> = {
  "0 ": "note",
  "1 ": "note",
  "11 ": "note",
  "1111 ": "note",
  "6 ": "note",
  "16 ": "note",
  "20 ": "picture",
  "21 ": "video",
  "22 ": "video",
  "34235 ": "video",
  "34236 ": "video",
  "1063 ": "picture",
  "1222 voice (": "audio",
  "1222 voice, no imeta": "audio",
  "1244 ": "audio",
  "31337 ": "track",
  "36787 ": "track",
  "54 ": "track",
  "30054 ": "track",
  "30055 ": "track",
  "2003 ": "thing",
  "30023 ": "article",
  "30024 ": "article",
  "30040 ": "article",
  "30041 ": "article",
  "30045 ": "article",
  "30817 ": "article",
  "30818 ": "article",
  "30142 ": "thing",
  "34139 ": "thing",
};

describe("every content kind, surface by surface", () => {
  it.each(CONTENT_KIND_FIXTURES.map((f) => [f.name, f] as const))("%s", (_name, { event, shows }) => {
    // (b) the embedded card: the shape its kind has, never the words of a structured event.
    const shape = Object.entries(EMBED).find(([prefix]) => _name.startsWith(prefix))?.[1];
    expect(shape, "a shape is expected for every fixture").toBeDefined();
    expect(embedShapeOf(event)).toBe(shape);

    // (f) its name and family: a word, never "Kind N", and a family to tint it by.
    expect(kindLabel(event)).not.toMatch(/^Kind \d+$/);
    expect(kindFamily(event.kind)).not.toBeNull();

    // (e) the All tab's row: the spec's own words, never JSON, a URL or nothing.
    const row = summarizeResult(event);
    expect(row.shape).toBeNull();
    const words = [row.title, row.body, row.quote].filter(Boolean).join(" ");
    expect(words).not.toMatch(/^\s*[{[]|https?:\/\//);
    if (!/^(1222|1244) /.test(_name)) expect(words).toContain(shows);
  });
});

describe("the readers a fix put right", () => {
  it("a voice message is called one, its row says how long it runs and never its file's URL (NIP-A0)", () => {
    expect(kindTypeLabel(1222)).toBe("Voice message");
    expect(kindTypeLabel(1244)).toBe("Voice reply");
    const row = summarizeResult(fixture("1222 voice (NIP-A0)"));
    expect(row.body).toBeNull();
    expect(row.video).toBeNull();
    expect(row.facts).toEqual(["8s"]);
    const captioned = summarizeResult({
      ...fixture("1222 voice (NIP-A0)"),
      content: "https://blossom.test/voice.mp4 morning thoughts",
    });
    expect(captioned.body).toBe("morning thoughts");
  });

  it("a NIP-7D thread is called a thread", () => {
    expect(kindLabel(fixture("11 "))).toBe("Thread");
    expect(kindTypeLabel(1)).toBe("Note");
  });

  it("an article is dated by its NIP-23 published_at, a note by its created_at", () => {
    expect(postedAtOf(fixture("30023 "))).toBe(PUBLISHED_AT);
    expect(postedAtOf(fixture("21 "))).toBe(PUBLISHED_AT);
    const note = fixture("1 ");
    expect(postedAtOf({ ...note, tags: [["published_at", String(PUBLISHED_AT)]] })).toBe(note.created_at);
    // One that is no time at all leaves the article its created_at.
    const article = fixture("30023 ");
    expect(postedAtOf({ ...article, tags: [["published_at", "soon"]] })).toBe(article.created_at);
  });

  it("an untitled wiki page is named by its d (NIP-54), as every card reads it", () => {
    const wiki = { ...fixture("30818 "), tags: [["d", "north-ridge"]] };
    expect(articleTitle(wiki)).toBe("North Ridge");
    expect(articleTitle({ ...wiki, tags: [["d", "日本語-article"]] })).toBe("日本語 Article");
    // Not an article: no title of its own and none made up.
    expect(articleTitle({ ...fixture("30023 "), tags: [["d", "x"]] })).toBe("");
  });

  it("long-form reads by its brief in the All tab: not its heading again", () => {
    expect(summarizeResult(fixture("30817 ")).body).toBe("A kind for trail conditions.");
    expect(summarizeResult({ ...fixture("30023 "), tags: [["title", "Guide"]] }).body).toBe(
      "Before you go Pack water.",
    );
  });

  it("a generic repost of a replaceable event names it by its `a` (NIP-18), its `e` only without one", () => {
    const addr = `30023:${"b".repeat(64)}:guide`;
    const repost = (tags: string[][]): MinimalEvent => ({ ...fixture("16 "), content: "", tags });
    expect(
      summarizeResult(
        repost([
          ["e", "f".repeat(64)],
          ["a", addr],
          ["k", "30023"],
        ]),
      ).ref,
    ).toEqual({
      addr,
      relay: undefined,
    });
    expect(summarizeResult(repost([["e", "f".repeat(64)]])).ref).toEqual({ id: "f".repeat(64), relay: undefined });
    expect(summarizeResult(repost([["a", addr]])).ref).toMatchObject({ addr });
    // A kind-6 repost names its note by `e`.
    expect(
      summarizeResult({
        ...repost([
          ["e", "f".repeat(64)],
          ["a", addr],
        ]),
        kind: 6,
      }).ref,
    ).toMatchObject({
      id: "f".repeat(64),
    });
  });

  it("a torrent's category comes from its NIP-35 tcat path before its topics and files", () => {
    const torrent = fixture("2003 ");
    const detailOf = (tags: string[][]) => describeThing({ ...torrent, tags: [["title", "X"], ...tags] })?.detail;
    expect(
      detailOf([
        ["i", "tcat:audio,music,flac"],
        ["t", "movie"],
      ]),
    ).toMatchObject({ category: "audio" });
    expect(
      detailOf([
        ["i", "tcat:video,movie,4k"],
        ["file", "song.flac", "1"],
      ]),
    ).toMatchObject({ category: "video" });
    expect(detailOf([["file", "song.flac", "1"]])).toMatchObject({ category: "audio" });
  });
});
