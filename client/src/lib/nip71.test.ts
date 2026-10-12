import { describe, expect, it } from "vitest";
import { publishedAtOf, readVideo } from "./nip71";

const NOW = 1_760_000_000; // 2025-10-09
const SHA = "ad9cd0843e7b4e4d4600996ae7a50e16748d1ef5a8c3884864b28f8792f6fe55";

const ev = (tags: string[][], over: Partial<{ kind: number; created_at: number; content: string }> = {}) => ({
  kind: 34236,
  created_at: NOW - 3600,
  content: "",
  ...over,
  tags,
});

/** A short published from Divine's own app. */
const native = (extra: string[][] = [], over: Parameters<typeof ev>[1] = {}) =>
  ev(
    [
      ["d", SHA],
      [
        "imeta",
        `url https://media.divine.video/${SHA}`,
        "m video/mp4",
        "image https://media.divine.video/thumb1",
        "blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj",
        "dim 1080x1920",
        `x ${SHA}`,
        "size 1048576",
      ],
      ["title", "Morning at the lake"],
      ["summary", "Morning at the lake\nFirst light, no wind. #lake"],
      ["t", "Lake"],
      ["t", "sunrise"],
      ["t", "lake"],
      ["published_at", String(NOW - 86_400)],
      ["duration", "6"],
      ["alt", " A lake at sunrise "],
      ["verification", "verified_mobile"],
      ["proofmode", '{"big":"json"}'],
      ["client", "Divine", "31990:abc:divine-mobile", "wss://relay.divine.video"],
      ...extra,
    ],
    { content: "Morning at the lake\nFirst light, no wind. #lake", ...over },
  );

/** A classic Vine restored by Divine's importer: re-imported today, first published in 2014. */
const vine = (extra: string[][] = [], over: Parameters<typeof ev>[1] = {}) =>
  ev(
    [
      ["d", "iq3bXYa5duP"],
      [
        "imeta",
        "url https://media.divine.video/vine1",
        "m video/mp4",
        "dim 480x480",
        "duration 6",
        "image https://media.divine.video/vine1.jpg",
      ],
      ["title", "So cute"],
      ["summary", "So cute\n\nOriginal stats: 491 loops - 39 likes"],
      ["platform", "vine"],
      ["L", "archive.divine.video"],
      ["l", "vine-archive", "archive.divine.video"],
      ["loops", "105"],
      ["likes", "4"],
      ["comments", "1"],
      ["reposts", "0"],
      ["author", "Original Viner"],
      ["r", "https://vine.co/v/iq3bXYa5duP"],
      ["published_at", "1400000000"],
      ["client", "vine-archive-importer"],
      ...extra,
    ],
    { content: "So cute\n\nOriginal stats: 491 loops - 39 likes", ...over },
  );

describe("readVideo — a NIP-71 video read for showing", () => {
  it("reads a native Divine short", () => {
    expect(readVideo(native(), NOW)).toEqual({
      publishedAt: NOW - 86_400,
      durationSeconds: 6,
      dim: { width: 1080, height: 1920 },
      hashtags: ["lake", "sunrise"],
      contentWarning: null,
      expiresAt: undefined,
      vine: null,
      capture: "mobile",
      divineUrl: `https://divine.video/video/${SHA}`,
      description: "First light, no wind. #lake",
      alt: "A lake at sunrise",
    });
  });

  it("reads a restored classic Vine", () => {
    expect(readVideo(vine(), NOW)).toEqual({
      publishedAt: 1_400_000_000,
      durationSeconds: 6,
      dim: { width: 480, height: 480 },
      hashtags: [],
      contentWarning: null,
      expiresAt: undefined,
      vine: { loops: 105, likes: 4, author: "Original Viner" },
      capture: null,
      divineUrl: "https://divine.video/video/iq3bXYa5duP",
      description: undefined,
      alt: undefined,
    });
  });

  describe("publishedAt", () => {
    const withPublished = (value: string) => readVideo(ev([["published_at", value]]), NOW).publishedAt;

    it("is published_at ahead of created_at: a re-imported Vine keeps its year", () => {
      expect(readVideo(vine([], { created_at: NOW }), NOW).publishedAt).toBe(1_400_000_000);
    });

    it("falls back to created_at when published_at is missing, not a number, in milliseconds, too old or ahead of now", () => {
      expect(readVideo(ev([]), NOW).publishedAt).toBe(NOW - 3600);
      expect(withPublished("yesterday")).toBe(NOW - 3600);
      expect(withPublished("1400000000.5")).toBe(NOW - 3600);
      expect(withPublished("1400000000000")).toBe(NOW - 3600);
      expect(withPublished("1000000000")).toBe(NOW - 3600); // 2001, before Vine or Nostr
      expect(withPublished(String(NOW + 2 * 86_400))).toBe(NOW - 3600);
    });

    it("allows a clock up to a day ahead", () => {
      expect(withPublished(String(NOW + 3600))).toBe(NOW + 3600);
    });

    it("is there on its own, for a byline that needs nothing else", () => {
      expect(publishedAtOf(vine([], { created_at: NOW }), NOW)).toBe(1_400_000_000);
      expect(publishedAtOf(ev([["published_at", "yesterday"]]), NOW)).toBe(NOW - 3600);
    });
  });

  it("reads the length from imeta first, then the duration tag, and only a positive number", () => {
    expect(
      readVideo(
        ev([
          ["imeta", "url https://x/v", "duration 6.5"],
          ["duration", "9"],
        ]),
        NOW,
      ).durationSeconds,
    ).toBe(6.5);
    expect(readVideo(ev([["duration", "65"]]), NOW).durationSeconds).toBe(65);
    expect(readVideo(ev([["duration", "0"]]), NOW).durationSeconds).toBeUndefined();
    expect(readVideo(ev([["duration", "-3"]]), NOW).durationSeconds).toBeUndefined();
    expect(readVideo(ev([["duration", "long"]]), NOW).durationSeconds).toBeUndefined();
    expect(readVideo(ev([]), NOW).durationSeconds).toBeUndefined();
  });

  it("reads a length only when it is a plain number of seconds, falling through a garbage imeta value to the tag", () => {
    const length = (imeta: string | null, tag: string | null) =>
      readVideo(
        ev([
          ...(imeta === null ? [] : [["imeta", "url https://x/v", `duration ${imeta}`]]),
          ...(tag ? [["duration", tag]] : []),
        ]),
        NOW,
      ).durationSeconds;
    expect(length("abc", "9")).toBe(9);
    expect(length("0", "9")).toBe(9);
    expect(length("6s", null)).toBeUndefined();
    expect(length(null, "6s")).toBeUndefined();
    expect(length(null, "1e1")).toBeUndefined();
    expect(length(null, "0x10")).toBeUndefined();
    expect(length(null, ".5")).toBeUndefined();
    expect(length(null, "6.033")).toBe(6.033);
  });

  it("reads dim as width and height, or nothing", () => {
    expect(readVideo(ev([["imeta", "dim 1080X1920"]]), NOW).dim).toEqual({ width: 1080, height: 1920 });
    expect(readVideo(ev([["imeta", "dim 1080x1920px"]]), NOW).dim).toBeUndefined();
    expect(readVideo(ev([["imeta", "dim 1080.5x1920"]]), NOW).dim).toBeUndefined();
    expect(readVideo(ev([["imeta", "dim 1e3x1e3"]]), NOW).dim).toBeUndefined();
    expect(readVideo(ev([["imeta", "dim 1080x1080"]]), NOW).dim).toEqual({ width: 1080, height: 1080 });
    expect(readVideo(ev([["imeta", "dim 1080"]]), NOW).dim).toBeUndefined();
    expect(readVideo(ev([["imeta", "dim 0x0"]]), NOW).dim).toBeUndefined();
    expect(readVideo(ev([["imeta", "dim widextall"]]), NOW).dim).toBeUndefined();
    expect(readVideo(ev([["dim", "1080x1920"]]), NOW).dim).toBeUndefined();
  });

  it("lowercases and dedupes hashtags, keeping their order", () => {
    expect(
      readVideo(
        ev([
          ["t", "Vine"],
          ["t", "comedy"],
          ["t", "VINE"],
          ["t", ""],
          ["t", " Comedy "],
          ["t", "cats"],
        ]),
        NOW,
      ).hashtags,
    ).toEqual(["vine", "comedy", "cats"]);
  });

  // The readers themselves are tested in nip36.test.ts and nip40.test.ts.
  it("carries the creator's content warning, from the tag or from labels", () => {
    expect(readVideo(native([["content-warning", "nudity"]]), NOW).contentWarning).toEqual({ reason: "nudity" });
    expect(readVideo(native([["l", "violence", "content-warning"]]), NOW).contentWarning).toEqual({
      reason: "violence",
    });
    expect(readVideo(native(), NOW).contentWarning).toBeNull();
  });

  it("carries the expiration when it is a time", () => {
    expect(readVideo(native([["expiration", String(NOW - 10)]]), NOW).expiresAt).toBe(NOW - 10);
    expect(readVideo(native([["expiration", "soon"]]), NOW).expiresAt).toBeUndefined();
    expect(readVideo(native(), NOW).expiresAt).toBeUndefined();
  });

  describe("vine", () => {
    it("is set by the platform tag or by the archive label", () => {
      expect(readVideo(ev([["platform", "vine"]]), NOW).vine).toEqual({});
      expect(readVideo(ev([["l", "vine-archive", "archive.divine.video"]]), NOW).vine).toEqual({});
      expect(readVideo(ev([["platform", "tiktok"]]), NOW).vine).toBeNull();
      expect(readVideo(native([["loops", "9"]]), NOW).vine).toBeNull();
    });

    it("keeps only whole, non-negative counts", () => {
      const stats = (loops: string, likes: string) =>
        readVideo(
          ev([
            ["platform", "vine"],
            ["loops", loops],
            ["likes", likes],
          ]),
          NOW,
        ).vine;
      expect(stats("0", "1234567")).toEqual({ loops: 0, likes: 1_234_567 });
      expect(stats("-4", "many")).toEqual({});
      expect(stats("1.5", "")).toEqual({});
      expect(stats("1e3", " 12 ")).toEqual({ likes: 12 });
    });
  });

  it("reads Divine's capture check, and nothing else, as capture", () => {
    expect(readVideo(ev([["verification", "verified_mobile"]]), NOW).capture).toBe("mobile");
    expect(readVideo(ev([["verification", "verified_web"]]), NOW).capture).toBe("web");
    expect(readVideo(ev([["verification", "verified"]]), NOW).capture).toBeNull();
    expect(readVideo(ev([]), NOW).capture).toBeNull();
  });

  describe("divineUrl", () => {
    it("is Divine's page for a video its app published", () => {
      expect(
        readVideo(
          ev([
            ["d", "abc"],
            ["client", "Divine", "31990:abc:divine-mobile"],
          ]),
          NOW,
        ).divineUrl,
      ).toBe("https://divine.video/video/abc");
    });

    it("is Divine's page for a Vine its importer restored", () => {
      expect(
        readVideo(
          ev([
            ["d", "iq3bXYa5duP"],
            ["client", "vine-archive-importer"],
          ]),
          NOW,
        ).divineUrl,
      ).toBe("https://divine.video/video/iq3bXYa5duP");
    });

    it("is Divine's page for a video Divine hosts, whatever client is named", () => {
      const hosted = (url: string) =>
        readVideo(
          ev([
            ["d", "abc"],
            ["imeta", `url ${url}`, "m video/mp4"],
          ]),
          NOW,
        ).divineUrl;
      expect(hosted("https://media.divine.video/abc")).toBe("https://divine.video/video/abc");
      expect(hosted("https://divine.video/abc.mp4")).toBe("https://divine.video/video/abc");
      expect(hosted("https://notdivine.video/abc")).toBeUndefined();
      expect(hosted("https://divine.video.evil.example/abc")).toBeUndefined();
    });

    it("is undefined for a video from elsewhere, and without a d", () => {
      expect(
        readVideo(
          ev([
            ["d", "abc"],
            ["imeta", "url https://cdn.example/talk.mp4", "m video/mp4"],
            ["client", "Amethyst"],
          ]),
          NOW,
        ).divineUrl,
      ).toBeUndefined();
      expect(readVideo(ev([["client", "Divine"]]), NOW).divineUrl).toBeUndefined();
      expect(
        readVideo(
          ev([
            ["d", ""],
            ["client", "Divine"],
          ]),
          NOW,
        ).divineUrl,
      ).toBeUndefined();
    });

    it("encodes a d with odd characters", () => {
      expect(
        readVideo(
          ev([
            ["d", "a b/c?d#e"],
            ["client", "Divine"],
          ]),
          NOW,
        ).divineUrl,
      ).toBe("https://divine.video/video/a%20b%2Fc%3Fd%23e");
    });
  });

  describe("description", () => {
    const described = (title: string, summary: string, extra: string[][] = [], content = "") =>
      readVideo(ev([["title", title], ...(summary ? [["summary", summary]] : []), ...extra], { content }), NOW)
        .description;

    it("drops a leading line that only says the title again", () => {
      expect(described("lol", "lol\n\nYou had to be there.")).toBe("You had to be there.");
      expect(described("Morning at the lake", "  MORNING AT THE LAKE \nFirst light.")).toBe("First light.");
      // A title inside the first sentence is the sentence itself.
      expect(described("Morning", "Morning at the lake")).toBe("Morning at the lake");
    });

    it('drops the "Original stats" line for a Vine only', () => {
      const text = "A day out\n\nOriginal stats: 491 loops - 39 likes";
      expect(described("Day", text, [["platform", "vine"]])).toBe("A day out");
      expect(described("Day", text)).toBe(text);
    });

    it("is undefined when nothing is left, or only the title", () => {
      expect(described("So cute", "So cute\n\nOriginal stats: 491 loops - 39 likes", [["platform", "vine"]])).toBe(
        undefined,
      );
      expect(described("So cute", "So cute")).toBeUndefined();
      expect(described("So cute", "", [], "  so cute  ")).toBeUndefined();
      expect(described("So cute", "")).toBeUndefined();
    });

    it("reads the summary ahead of the content, and the content when there is no summary", () => {
      expect(described("T", "From the summary", [], "From the content")).toBe("From the summary");
      expect(described("T", "", [], "From the content")).toBe("From the content");
    });
  });

  it("never reads the proof tags", () => {
    const big = "x".repeat(20_000);
    const video = readVideo(
      native([
        ["proofmode", big],
        ["device_attestation", big],
      ]),
      NOW,
    );
    expect(JSON.stringify(video)).not.toContain("xxxx");
  });
});
