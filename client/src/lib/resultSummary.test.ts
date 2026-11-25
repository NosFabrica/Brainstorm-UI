import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { markdownExcerpt, summarizeResult } from "./resultSummary";
import { kindFamily, kindTone } from "./kindFamily";
import { kindTypeLabel } from "./kindLabel";

const PK = "4".repeat(64);
const ev = (kind: number, tags: string[][] = [], content = "") => ({
  id: "e".repeat(64),
  pubkey: PK,
  kind,
  created_at: 1_790_000_000,
  tags,
  content,
});

describe("summarizeResult — any kind as the All tab's row", () => {
  // The question that started the All tab: a kind-39999 place has no content and no picture.
  it("a D-list place reads its name, and its own short fields as facts", () => {
    const s = summarizeResult(
      ev(39999, [
        ["d", "osm-way-995734197"],
        ["z", "39998:b83a:food-and-drink-places"],
        ["name", "La Tarantella - Recoleta"],
        ["category", "restaurant"],
        ["country", "PY"],
        ["cuisine", "pizza"],
        ["osm-id", "way:995734197"],
        ["lat", "-25.3064685"],
        ["opening-hours", "Tu-Su 19:00-22:00"],
        ["btcmap-id", "28718"],
      ]),
    );
    expect(s.title).toBe("La Tarantella - Recoleta");
    expect(s.facts).toEqual(["restaurant", "PY", "pizza", "Tu-Su 19:00-22:00"]);
    expect(s.image).toBeNull();
    expect(s.href).toMatch(/^\/e\//);
  });

  it("a highlight is its passage, its comment and where it is from", () => {
    const web = summarizeResult(
      ev(
        9802,
        [
          ["r", "https://www.example.org/post"],
          ["context", "Before. The passage. After."],
        ],
        "The passage.",
      ),
    );
    expect(web).toMatchObject({
      title: null,
      body: null,
      quote: "The passage.",
      facts: ["From example.org"],
      ref: null,
    });
    const article = summarizeResult(
      ev(
        9802,
        [
          ["a", `30023:${PK}:essay`],
          ["comment", "**Yes.**"],
        ],
        "The passage.",
      ),
    );
    expect(article).toMatchObject({
      body: "Yes.",
      quote: "The passage.",
      facts: [],
      ref: { addr: `30023:${PK}:essay` },
    });
    // A bare key in the passage is a person, as in any row's words.
    const npub = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";
    expect(summarizeResult(ev(9802, [], `Thanks ${npub}`)).quote).toBe(`Thanks nostr:${npub}`);
  });

  // A dead poster (flare's expired S3 thumbnails) still leaves the clip's first frame to show.
  it("a video keeps its clip beside its poster, a picture post has none", () => {
    const s = summarizeResult(
      ev(34235, [
        ["d", "ahXkCgR"],
        ["url", "https://cdn.satellite.earth/946f.mp4"],
        ["title", "How Nostr Saves Healthcare"],
        ["thumb", "https://flare-pub.s3.amazonaws.com/thumbnails/vSWs.png"],
      ]),
    );
    expect(s.image).toBe("https://flare-pub.s3.amazonaws.com/thumbnails/vSWs.png");
    expect(s.video).toBe("https://cdn.satellite.earth/946f.mp4");
    expect(summarizeResult(ev(20, [["imeta", "url https://x.test/a.jpg", "m image/jpeg"]])).video).toBeNull();
  });

  it("a profile is the person: name, about and their profile page — the face stays in the byline", () => {
    const s = summarizeResult(
      ev(0, [], JSON.stringify({ name: "nova", display_name: "NOVA", about: "Music", picture: "https://img/n.jpg" })),
    );
    expect(s).toMatchObject({ title: "NOVA", body: "Music", image: null });
    expect(s.href).toBe(`/p/${nip19.npubEncode(PK)}`);
  });

  it("a listing says its price, place and status", () => {
    const s = summarizeResult(
      ev(30402, [
        ["d", "x"],
        ["title", "Coat"],
        ["price", "300", "USD"],
        ["location", "Gubbio, Italy"],
        ["status", "sold"],
        ["image", "https://img/c.jpg"],
      ]),
    );
    expect(s.title).toBe("Coat");
    expect(s.image).toBe("https://img/c.jpg");
    expect(s.facts.at(-1)).toBe("Sold");
    expect(s.facts.length).toBe(3);
  });

  it("an article is its summary, else its markdown as prose", () => {
    const s = summarizeResult(
      ev(
        30023,
        [
          ["d", "a"],
          ["title", "T"],
        ],
        "# Head\n\nSome **bold** [link](https://x).\n\n![](https://i/p.png)",
      ),
    );
    expect(s.body).toBe("Head Some bold link.");
    const withSummary = summarizeResult(
      ev(
        30023,
        [
          ["d", "a"],
          ["title", "T"],
          ["summary", "Short"],
        ],
        "long",
      ),
    );
    expect(withSummary.body).toBe("Short");
  });

  it("content that is not words says what it is instead", () => {
    expect(summarizeResult(ev(30078, [["d", "app"]], "A".repeat(80))).shape).toBe("encrypted");
    expect(summarizeResult(ev(12345, [], '{"a":1}')).shape).toBe("json");
    // The author's NIP-31 alt line, when there is one, is the words.
    expect(summarizeResult(ev(12345, [["alt", "A thing"]], '{"a":1}')).body).toBe("A thing");
  });

  it("an opaque d is never a title; a readable one is", () => {
    expect(summarizeResult(ev(31234, [["d", "a3f1c2d4e5f60718"]])).title).toBeNull();
    expect(summarizeResult(ev(31234, [["d", "reading-list"]])).title).toBe("reading-list");
    // A list keeps its own name, however empty.
    expect(summarizeResult(ev(30001, [["d", "reading-list"]])).title).toBe("reading-list");
  });

  it("a D-list header is named by its plural", () => {
    expect(
      summarizeResult(
        ev(39998, [
          ["d", "x"],
          ["names", "place", "places"],
        ]),
      ).title,
    ).toBe("places");
  });
});

describe("kind names and families", () => {
  it("names the kinds this app had no word for, and keeps its own words", () => {
    expect(kindTypeLabel(39999)).toBe("List item");
    expect(kindTypeLabel(1301)).toBe("Workout");
    expect(kindTypeLabel(30023)).toBe("Article");
    expect(kindTypeLabel(987_654)).toBe("Kind 987654");
  });

  it("tints a pill by family; an unnamed kind is slate", () => {
    expect(kindFamily(30023)).toBe("article");
    expect(kindTone(30023)).toBe("amber");
    expect(kindTone(30402)).toBe(kindTone(30018));
    expect(kindTone(987_654)).toBe("slate");
  });
});

describe("markdownExcerpt", () => {
  it("drops code, images and markup, keeping the words", () => {
    expect(markdownExcerpt("```js\nx()\n```\n- one\n- two\n> quoted\n---\n| a | b |\n|---|---|")).toBe(
      "one two quoted | a | b |",
    );
  });
});

describe("the title is not said twice", () => {
  it("drops a heading the words open with, even behind a byline", () => {
    const s = summarizeResult(
      ev(
        30023,
        [
          ["d", "a"],
          ["title", "Senate Opens Markup"],
        ],
        "Bitcoin Magazine\n\n# Senate Opens Markup\n\nThe committee met.",
      ),
    );
    expect(s.body).toBe("The committee met.");
    // A title that only turns up deep in the words leaves them alone.
    const deep = summarizeResult(ev(1, [["subject", "goats"]], `${"x ".repeat(40)}goats are great`));
    expect(deep.body).toContain("goats are great");
  });
});

describe("a note's markdown", () => {
  it("keeps a link's words, not its brackets", () => {
    const s = summarizeResult(ev(1, [], "Joined by [Fiatjaf](https://x.com/f) and **Vitor**."));
    expect(s.body).toBe("Joined by Fiatjaf and Vitor.");
  });
});

describe("audit fixes", () => {
  it("a short title is not cut out of the sentence that holds it", () => {
    expect(
      summarizeResult(
        ev(30402, [
          ["d", "x"],
          ["title", "Chair"],
          ["summary", "A beautiful oak chair for you"],
          ["price", "1", "USD"],
        ]),
      ).body,
    ).toBe("A beautiful oak chair for you");
    const jack = summarizeResult(ev(0, [], JSON.stringify({ name: "Jack", about: "Jack of all trades" })));
    expect(jack.body).toBe("Jack of all trades");
  });

  it("markdown marks go only where they pair: names, sums and tags keep theirs", () => {
    expect(markdownExcerpt("ping @john_doe about __init__ and 5 * 3")).toBe("ping @john_doe about init and 5 * 3");
    expect(markdownExcerpt("if a < b and c > d, *really* `x`")).toBe("if a < b and c > d, really x");
    expect(markdownExcerpt("<b>bold</b> :smile_face:")).toBe("bold :smile_face:");
  });

  it("a website fact is its host, and a missing one leaves no separator", () => {
    const s = summarizeResult(ev(0, [], JSON.stringify({ name: "A", nip05: "a@x.com", website: "https://x.com/me" })));
    expect(s.facts).toEqual(["a@x.com", "x.com"]);
  });

  it("a bare npub in the words is a person, not a key", () => {
    const npub = nip19.npubEncode("b".repeat(64));
    const s = summarizeResult(ev(1, [], `thanks @${npub} and ${npub}!`));
    expect(s.body).toBe(`thanks nostr:${npub} and nostr:${npub}!`);
  });
});

// Safe by default: the row's picture is decided here, so whether that picture is a video
// its creator marked sensitive is decided here too, for the event the picture came from.
describe("summarizeResult — a video marked sensitive", () => {
  const imeta = [
    "imeta",
    "url https://media.divine.video/b0f9",
    "m video/mp4",
    "image https://media.divine.video/thumb",
  ];
  const short = (tags: string[][] = []) => ev(34236, [["d", "b0f9"], ["title", "Morning at the lake"], imeta, ...tags]);

  it("carries the warning beside the picture it is about", () => {
    const s = summarizeResult(short([["content-warning", "nudity"]]));
    expect(s.image).toBe("https://media.divine.video/thumb");
    expect(s.sensitive).toEqual({ reason: "nudity" });
    expect(summarizeResult(short([["l", "violence", "content-warning"]])).sensitive).toEqual({ reason: "violence" });
  });

  it("is not set for an unflagged video, or for flagged words with no video", () => {
    expect(summarizeResult(short()).sensitive).toBeUndefined();
    expect(summarizeResult(ev(1, [["content-warning", "spoilers"]], "The butler did it.")).sensitive).toBeUndefined();
  });

  it("covers a note whose picture is a flagged clip", () => {
    const note = ev(1, [["content-warning"]], "look https://cdn.example/clip.mp4");
    expect(summarizeResult(note).video).toBe("https://cdn.example/clip.mp4");
    expect(summarizeResult(note).sensitive).toEqual({});
  });

  // The repost's own tags say nothing: the picture and its warning are the reposted video's.
  it("a repost inherits the warning of the video it carries", () => {
    const flagged = short([["content-warning", "nudity"]]);
    for (const kind of [6, 16]) {
      const s = summarizeResult(
        ev(
          kind,
          [
            ["e", flagged.id],
            ["k", "34236"],
          ],
          JSON.stringify(flagged),
        ),
      );
      expect(s.image).toBe("https://media.divine.video/thumb");
      expect(s.sensitive).toEqual({ reason: "nudity" });
    }
    expect(summarizeResult(ev(16, [], JSON.stringify(short()))).sensitive).toBeUndefined();
  });
});

describe("NKBIP-01 publications as rows", () => {
  const section = ev(
    30041,
    [["d", "constitution-article-i-section-1"]],
    "== Article I\n[NOTE]\n====\nAll legislative Powers herein granted shall be vested in a link:https://x.org[Congress].\n====\n. one\n. two",
  );

  it("an untitled section is named by its slug and reads as words, not AsciiDoc", () => {
    const s = summarizeResult(section);
    expect(s.title).toBe("Constitution Article I Section 1");
    expect(s.body).toContain("All legislative Powers herein granted shall be vested in a Congress.");
    expect(s.body).not.toMatch(/==|\[NOTE\]|link:|====/);
  });

  it("a bookshelf says what is on it", () => {
    const shelf = ev(30045, [
      ["d", "root"],
      ["a", `30040:${PK}:a-book`],
      ["a", `30040:${PK}:another`],
      ["a", `30045:${PK}:poetry`],
    ]);
    const s = summarizeResult(shelf);
    expect(s.title).toBe("Bookshelf");
    expect(s.body).toBe("2 books · 1 shelf");
  });
});

describe("polls and designations on the All tab", () => {
  const at = (kind: number, tags: string[][], content = "") => ({
    id: "9".repeat(64),
    pubkey: "4".repeat(64),
    kind,
    created_at: 1_790_000_000,
    tags,
    content,
  });

  // NIP-88: the question is the content; the options, the rule and the close are its tags.
  it("a poll is its question, with its options and rule as facts", () => {
    const s = summarizeResult(
      at(
        1068,
        [
          ["option", "y1", "Yay"],
          ["option", "n1", "Nay"],
          ["polltype", "multiplechoice"],
        ],
        "Pineapple on pizza?",
      ),
    );
    expect(s.body).toBe("Pineapple on pizza?");
    expect(s.facts).toEqual(["Yay / Nay", "Pick any"]);
  });

  it("a zap poll's options are its `poll_option`s, with its range", () => {
    const s = summarizeResult(
      at(
        6969,
        [
          ["poll_option", "0", "Yes"],
          ["poll_option", "1", "No"],
          ["value_minimum", "10"],
          ["value_maximum", "10"],
        ],
        "Ship it?",
      ),
    );
    expect(s.facts).toEqual(["Yes / No", "Zap poll", "10 sats a vote"]);
  });

  it("a designation is its rows in words, and the relays they name", () => {
    const s = summarizeResult(at(10040, [["30382:rank", "e".repeat(64), "wss://nip85.brainstorm.world"]]));
    expect(s.title).toBe("Trust designation");
    expect(s.body).toBe("Activated Brainstorm trust signals · Rank");
    expect(s.facts).toEqual(["nip85.brainstorm.world"]);
  });
});

// The All row said a stream's raw `status`: "Live" on a stream nobody had
// updated for two years, where the Live tab, the tile and the page say it is over.
describe("summarizeResult — a NIP-53 stream says the state the Live tab reads", () => {
  const now = Math.floor(Date.now() / 1000);
  const stream = (tags: string[][], created_at: number) => ({
    ...ev(30311, [["d", "s"], ["title", "Building a relay"], ...tags]),
    created_at,
  });

  it("a fresh live stream is Live, with who is watching", () => {
    const s = summarizeResult(
      stream(
        [
          ["status", "live"],
          ["current_participants", "42"],
          ["streaming", "https://stream.example/live.m3u8"],
        ],
        now - 60,
      ),
    );
    expect(s.facts).toEqual(["Live", "42 watching"]);
  });

  it('a "live" untouched for a week is over: a replay with a recording, else Ended', () => {
    const stale = now - 30 * 86_400;
    expect(summarizeResult(stream([["status", "live"]], stale)).facts).toEqual(["Ended"]);
    expect(
      summarizeResult(
        stream(
          [
            ["status", "live"],
            ["recording", "https://cdn.example/r.mp4"],
          ],
          stale,
        ),
      ).facts,
    ).toEqual(["Replay"]);
  });

  it("a planned stream still ahead is Upcoming", () => {
    expect(
      summarizeResult(
        stream(
          [
            ["status", "planned"],
            ["starts", String(now + 3600)],
          ],
          now - 60,
        ),
      ).facts,
    ).toEqual(["Upcoming"]);
  });
});

// A patch has no `subject` tag (none of forty on the relay did): the All row had no
// title and quoted git's mail headers and the diff as the patch's words.
describe("summarizeResult — NIP-34 patches, pull requests and issues", () => {
  const patch = [
    `From ${"3f2a".repeat(10)} Mon Sep 17 00:00:00 2001`,
    "From: Dev <dev@example.com>",
    "Date: Mon, 1 Sep 2026 10:00:00 +0000",
    "Subject: [PATCH] Fix the relay pool",
    "",
    "Reconnects after a drop.",
    "---",
    "diff --git a/pool.kt b/pool.kt",
    "--- a/pool.kt",
    "+++ b/pool.kt",
    "@@ -1 +1,2 @@",
    "-old",
    "+new",
    "+newer",
  ].join("\n");

  it("a patch is its subject and its message, and the size of its diff", () => {
    const s = summarizeResult(ev(1617, [["t", "root"]], patch));
    expect(s.title).toBe("Fix the relay pool");
    expect(s.body).toBe("Reconnects after a drop.");
    expect(s.facts).toEqual(["1 file · +2 −1"]);
  });

  it("an issue is its subject, its words and its labels", () => {
    const s = summarizeResult(
      ev(
        1621,
        [
          ["subject", "Crash on empty relay list"],
          ["t", "bug"],
        ],
        "It crashes when the list is empty.",
      ),
    );
    expect(s.title).toBe("Crash on empty relay list");
    expect(s.body).toBe("It crashes when the list is empty.");
    expect(s.facts).toEqual(["bug"]);
  });
});

describe("summarizeResult — lists of things say their name and what they hold, as their cards do", () => {
  it("a pin list or bookmarks with no title is named as its card names it", () => {
    expect(summarizeResult(ev(10001, [["e", "1".repeat(64)]])).title).toBe("Pinned notes");
    expect(summarizeResult(ev(10003, [["e", "1".repeat(64)]])).title).toBe("Bookmarks");
  });

  it("a badge set counts its badges, never the awards beside them as notes", () => {
    const s = summarizeResult(
      ev(30008, [
        ["d", "profile_badges"],
        ["a", `30009:${PK}:bravery`],
        ["e", "1".repeat(64)],
      ]),
    );
    expect(s.title).toBe("Profile badges");
    expect(s.facts).toEqual(["1 badge"]);
  });

  it("a video curation set counts videos", () => {
    expect(
      summarizeResult(
        ev(30005, [
          ["d", "talks"],
          ["title", "Talks"],
          ["e", "1".repeat(64)],
        ]),
      ).facts,
    ).toEqual(["1 video"]);
  });
});
