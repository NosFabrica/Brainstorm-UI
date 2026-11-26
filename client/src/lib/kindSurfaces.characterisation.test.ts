/**
 * Every kind fixture the repo holds, and what each surface decides for it today:
 * the page's hero and the gates around it (EventScreen), the shape a quote of
 * it is drawn as (lib/embedShape), its reading (lib/resultReaders), its All-tab
 * row (lib/resultSummary) and its name (lib/kindLabel, lib/kindFamily).
 *
 * Recorded once, in kindSurfaces.decisions.jsonl beside this file, before the
 * surfaces' rules moved into one registry (lib/kindSurfaces): the file is the
 * contract the move kept. A change to it is a change to what some kind looks
 * like somewhere: review the diff, then update it on purpose with `-u`.
 */
import { describe, expect, it, vi } from "vitest";

// The readings say how long ago or until ("closes in 3d"): a fixed clock, set
// before the fixtures' modules read it.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
});

import type { MinimalEvent } from "@/lib/noteRefs";
import { KIND_FIXTURES } from "@/test/kindFixtures";
import { CONTENT_KIND_FIXTURES } from "@/test/contentKindFixtures";
import { THING_KIND_FIXTURES } from "@/test/thingKindFixtures";
import { embedShapeOf, namesItsKind } from "@/lib/embedShape";
import { readKind } from "@/lib/resultReaders";
import { summaryOf } from "@/lib/resultSummary";
import { kindLabel } from "@/lib/kindLabel";
import { kindFamily } from "@/lib/kindFamily";
import { readsAsArticle } from "@/lib/shareId";
import { mediaItemsOf } from "@/lib/mediaKind";
import { contentShape } from "@/lib/contentShape";
import { NOTE_KINDS, heroFor } from "@/components/share/heroFor";
import { dlistOfEvent, DLIST_REGISTRY } from "@/lib/dlists";

// ---- the per-surface tests' own cases (kindSurfaces.test, kindSurfaces.gaps.test), as events ----

const PK = "4".repeat(64);
const ALICE = "a".repeat(64);
const HOST = "5".repeat(64);
const NOTE = "1".repeat(64);
const POLL = "2".repeat(64);
const NOW = Math.floor(Date.now() / 1000);
let n = 0x9000;
const ev = (kind: number, tags: string[][], content = "", pubkey = PK): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey,
  created_at: NOW - 600,
  tags,
  content,
});

const zapRequest = JSON.stringify({
  kind: 9734,
  pubkey: "c".repeat(64),
  content: "great post",
  tags: [
    ["p", ALICE],
    ["amount", "21000"],
  ],
});

const SURFACE_CASES: [string, MinimalEvent][] = [
  [
    "7 reaction",
    ev(
      7,
      [
        ["e", NOTE],
        ["p", ALICE],
        ["k", "1"],
      ],
      "+",
    ),
  ],
  [
    "17 external reaction",
    ev(
      17,
      [
        ["k", "web"],
        ["i", "https://example.com/post"],
      ],
      "⭐",
    ),
  ],
  [
    "5 deletion",
    ev(
      5,
      [
        ["e", NOTE],
        ["k", "1"],
      ],
      "posted by accident",
    ),
  ],
  [
    "1984 report",
    ev(
      1984,
      [
        ["e", NOTE, "spam"],
        ["p", ALICE],
      ],
      "selling pills",
    ),
  ],
  [
    "1985 label",
    ev(1985, [
      ["L", "license"],
      ["l", "MIT", "license"],
      ["e", NOTE],
    ]),
  ],
  [
    "8 badge award",
    ev(8, [
      ["a", `30009:${PK}:bravery`],
      ["p", ALICE],
    ]),
  ],
  [
    "1018 poll vote",
    ev(1018, [
      ["e", POLL],
      ["response", "yay"],
    ]),
  ],
  [
    "4550 approval",
    ev(4550, [
      ["a", `34550:${PK}:cooking`],
      ["e", NOTE],
      ["p", ALICE],
      ["k", "1"],
    ]),
  ],
  [
    "3 follow list",
    ev(3, [
      ["p", ALICE],
      ["p", "b".repeat(64)],
      ["t", "bitcoin"],
    ]),
  ],
  [
    "31925 RSVP",
    ev(31925, [
      ["a", `31923:${ALICE}:meetup`],
      ["d", "x"],
      ["status", "accepted"],
      ["fb", "busy"],
    ]),
  ],
  [
    "9734 zap request",
    ev(
      9734,
      [
        ["p", ALICE],
        ["amount", "21000"],
        ["relays", "wss://r.example"],
        ["e", NOTE],
      ],
      "Zap!",
    ),
  ],
  [
    "9735 zap receipt",
    ev(
      9735,
      [
        ["p", ALICE],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", zapRequest],
      ],
      "",
      "d".repeat(64),
    ),
  ],
  [
    "9321 nutzap",
    ev(
      9321,
      [
        ["proof", JSON.stringify({ amount: 5, C: "02", id: "00", secret: "s" })],
        ["unit", "sat"],
        ["u", "https://mint.example"],
        ["p", ALICE],
      ],
      "thanks",
    ),
  ],
  [
    "1068 poll",
    ev(
      1068,
      [
        ["option", "y1", "Yay"],
        ["option", "n1", "Nay"],
        ["polltype", "singlechoice"],
        ["endsAt", String(NOW + 86_400 * 3)],
      ],
      "Pineapple on pizza?",
    ),
  ],
  [
    "6969 zap poll",
    ev(
      6969,
      [
        ["poll_option", "0", "Yes"],
        ["poll_option", "1", "No"],
      ],
      "Ship it?",
    ),
  ],
  [
    "9802 highlight",
    ev(
      9802,
      [
        ["r", "https://source.example/essay", "source"],
        ["r", "https://other.example", "mention"],
        ["p", ALICE, "", "author"],
        ["comment", "So true"],
      ],
      "the words they marked",
    ),
  ],
  [
    "30382 trust score",
    ev(30382, [
      ["d", ALICE],
      ["rank", "63"],
      ["followers", "188"],
    ]),
  ],
  [
    "30383 event score",
    ev(30383, [
      ["d", NOTE],
      ["rank", "40"],
    ]),
  ],
  [
    "30384 address score",
    ev(30384, [
      ["d", `30023:${ALICE}:essay`],
      ["rank", "50"],
    ]),
  ],
  [
    "30385 identifier score",
    ev(30385, [
      ["d", "isbn:9780140449334"],
      ["k", "isbn"],
      ["rank", "71"],
    ]),
  ],
  ["10040 designation", ev(10040, [["30382:rank", "e".repeat(64), "wss://nip85.brainstorm.world"]])],
  // kindSurfaces.gaps.test
  [
    "30024 draft",
    ev(
      30024,
      [
        ["d", "my-draft"],
        ["title", "Half an essay"],
        ["summary", "Not done yet."],
      ],
      "The first paragraph of a draft.",
    ),
  ],
  [
    "30312 meeting space",
    ev(30312, [
      ["d", "main-conference-room"],
      ["room", "Main Conference Hall"],
      ["summary", "Our primary conference space"],
      ["status", "open"],
      ["service", "https://meet.example.com/room"],
      ["endpoint", "https://api.example.com/room"],
      ["p", HOST, "wss://nostr.example.com/", "Host"],
    ]),
  ],
  [
    "30313 meeting",
    ev(30313, [
      ["d", "annual-meeting-2025"],
      ["a", `30312:${PK}:main-conference-room`, "wss://nostr.example.com"],
      ["title", "Annual Company Meeting"],
      ["summary", "Yearly company-wide meeting"],
      ["starts", String(NOW + 3600)],
      ["status", "planned"],
      ["p", HOST, "wss://provider1.com/", "Speaker"],
    ]),
  ],
  [
    "39092 media starter pack",
    ev(39092, [
      ["d", "photographers"],
      ["title", "Photographers"],
      ["p", HOST],
      ["p", "6".repeat(64)],
    ]),
  ],
  [
    "30267 app curation set",
    ev(
      30267,
      [
        ["d", "nostr"],
        ["title", "My nostr apps"],
        ["a", `32267:${HOST}:com.example.app1`],
        ["a", `32267:${HOST}:net.example.app2`],
      ],
      "My nostr app selection",
    ),
  ],
  [
    "1808 audio header",
    ev(
      1808,
      [
        ["url", "https://audio.nostr.build/df02fe32fae1d1"],
        ["blossom", "df02fe32fae1d123c1d4bdf54ea9638d78062c46", "audio/mp4"],
        ["duration", "33.3"],
        ["subject", "Audio Note"],
      ],
      "Don't choose to just exist.",
    ),
  ],
  [
    "39701 web bookmark",
    ev(
      39701,
      [
        ["d", "alice.blog/post"],
        ["published_at", "1738863000"],
        ["title", "Blog insights by Alice"],
        ["t", "insight"],
      ],
      "A marvelous insight by Alice.",
    ),
  ],
  [
    "10002 relay list",
    ev(10002, [
      ["r", "wss://alicerelay.example.com"],
      ["r", "wss://expensive-relay.example2.com", "write"],
      ["r", "wss://nostr-relay.example.com", "read"],
    ]),
  ],
  [
    "30315 status",
    ev(
      30315,
      [
        ["d", "music"],
        ["r", "spotify:search:Intergalatic%20-%20Beastie%20Boys"],
        ["expiration", String(NOW + 120)],
      ],
      "Intergalatic - Beastie Boys",
    ),
  ],
  ["42 channel message", ev(42, [["e", "c".repeat(64), "wss://relay.example.com", "root"]], "Hello channel")],
  [
    "1311 live chat",
    ev(1311, [["a", `30311:${HOST}:demo-cf-stream`, "", "root"]], "Zaps to live streams is beautiful."),
  ],
  ["9 group chat", ev(9, [["h", "pizza-lovers"]], "GM")],
];

// ---- the rows the fixtures above leave out: each hero's fall-through, and the generic page ----

const LIST = DLIST_REGISTRY[0];
const [, LIST_AUTHOR, LIST_D] = LIST.coordinate.split(":");
const EDGE_CASES: [string, MinimalEvent][] = [
  [
    "39998 registry list header",
    ev(
      39998,
      [
        ["d", LIST_D],
        ["names", "Song", "Songs"],
      ],
      "",
      LIST_AUTHOR,
    ),
  ],
  [
    "39998 other list header",
    ev(39998, [
      ["d", "places"],
      ["names", "Place", "Places"],
    ]),
  ],
  [
    "9998 list header",
    ev(9998, [
      ["d", "things"],
      ["names", "Thing", "Things"],
    ]),
  ],
  [
    "9999 registry list item",
    ev(9999, [
      ["z", LIST.coordinate],
      ["name", "A song"],
    ]),
  ],
  [
    "39999 list item",
    ev(39999, [
      ["d", "x"],
      ["z", `39998:${PK}:places`],
      ["name", "A place"],
    ]),
  ],
  [
    "1617 patch",
    ev(
      1617,
      [
        ["a", `30617:${PK}:ngit`],
        ["subject", "[PATCH] fix the thing"],
      ],
      "From abc Mon Sep 17 00:00:00 2001\nSubject: [PATCH] fix the thing\n",
    ),
  ],
  [
    "1621 issue",
    ev(
      1621,
      [
        ["a", `30617:${PK}:ngit`],
        ["subject", "It breaks"],
      ],
      "Steps to reproduce",
    ),
  ],
  ["1621 untitled issue", ev(1621, [["a", `30617:${PK}:ngit`]], "")],
  [
    "30617 repo",
    ev(30617, [
      ["d", "ngit"],
      ["name", "ngit"],
      ["clone", "https://git.example/ngit.git"],
    ]),
  ],
  ["30617 unnamed repo", ev(30617, [["d", "x"]])],
  [
    "30311 stream",
    ev(30311, [
      ["d", "s"],
      ["title", "Live coding"],
      ["status", "live"],
      ["streaming", "https://v.example/s.m3u8"],
    ]),
  ],
  ["30311 untitled stream", ev(30311, [["d", "s2"]])],
  ["30312 unnamed space", ev(30312, [["d", "room-slug"]])],
  [
    "30054 episode without audio",
    ev(30054, [
      ["d", "ep"],
      ["title", "An episode"],
    ]),
  ],
  [
    "30402 listing without a title",
    ev(30402, [
      ["d", "x"],
      ["price", "1", "USD"],
    ]),
  ],
  ["30000 private follow set", ev(30000, [["d", "friends"]], "?iv=abc")],
  [
    "30000 follow set",
    ev(30000, [
      ["d", "friends"],
      ["title", "Friends"],
      ["p", ALICE],
    ]),
  ],
  ["32267 unnamed app", ev(32267, [["d", "com.x"]])],
  ["30618 repo state without d", ev(30618, [["refs/heads/main", "a".repeat(40)]])],
  ["30063 release without assets", ev(30063, [["d", "app@1.0"]])],
  ["1630 status, no root", ev(1630, [], "")],
  ["9802 empty highlight", ev(9802, [["r", "https://x.example", "source"]], "")],
  ["7 bare reaction", ev(7, [], "+")],
  ["10040 empty designation", ev(10040, [])],
  ["1 note", ev(1, [], "Hello world")],
  ["1 note with a picture", ev(1, [], "Look https://img.example/a.jpg")],
  [
    "1 reply",
    ev(
      1,
      [
        ["e", NOTE, "", "root"],
        ["p", ALICE],
      ],
      "Agreed",
    ),
  ],
  [
    "1111 comment",
    ev(
      1111,
      [
        ["E", NOTE],
        ["K", "1"],
        ["e", NOTE],
        ["k", "1"],
      ],
      "Nice",
    ),
  ],
  [
    "6 repost, no content",
    ev(
      6,
      [
        ["e", NOTE],
        ["p", ALICE],
      ],
      "",
    ),
  ],
  [
    "16 generic repost",
    ev(
      16,
      [
        ["e", NOTE],
        ["k", "20"],
      ],
      "",
    ),
  ],
  [
    "20 picture post",
    ev(
      20,
      [
        ["title", "Sunrise"],
        ["imeta", "url https://img.example/s.jpg", "m image/jpeg"],
      ],
      "Morning",
    ),
  ],
  ["20 picture post without pictures", ev(20, [["title", "Nothing"]], "")],
  [
    "21 video",
    ev(
      21,
      [
        ["title", "Clip"],
        ["imeta", "url https://v.example/c.mp4", "m video/mp4"],
      ],
      "A clip",
    ),
  ],
  ["21 video without a file", ev(21, [["title", "Clip"]], "watch https://v.example/c.mp4")],
  [
    "1063 image file",
    ev(
      1063,
      [
        ["url", "https://img.example/f.png"],
        ["m", "image/png"],
      ],
      "A file",
    ),
  ],
  [
    "1063 video file",
    ev(
      1063,
      [
        ["url", "https://v.example/f.mp4"],
        ["m", "video/mp4"],
      ],
      "",
    ),
  ],
  [
    "1063 audio file",
    ev(
      1063,
      [
        ["url", "https://a.example/f.mp3"],
        ["m", "audio/mpeg"],
      ],
      "",
    ),
  ],
  [
    "1063 installer",
    ev(
      1063,
      [
        ["url", "https://dl.example/app.apk"],
        ["m", "application/vnd.android.package-archive"],
      ],
      "",
    ),
  ],
  [
    "1222 voice message",
    ev(1222, [["imeta", "url https://a.example/v.m4a", "m audio/mp4"]], "https://a.example/v.m4a"),
  ],
  [
    "1622 legacy git reply",
    ev(
      1622,
      [
        ["e", NOTE, "", "root"],
        ["a", `30617:${PK}:ngit`],
      ],
      "LGTM",
    ),
  ],
  [
    "30023 article",
    ev(
      30023,
      [
        ["d", "essay"],
        ["title", "An essay"],
      ],
      "# An essay\n\nWords.",
    ),
  ],
  [
    "30818 wiki",
    ev(
      30818,
      [
        ["d", "nostr"],
        ["title", "Nostr"],
      ],
      "Nostr is a protocol.",
    ),
  ],
  ["0 profile", ev(0, [], JSON.stringify({ name: "alice" }))],
  ["4242 unknown, words", ev(4242, [], "Some words")],
  ["4242 unknown, empty", ev(4242, [["x", "y"]], "")],
  ["4242 unknown, json", ev(4242, [], JSON.stringify({ a: 1 }))],
  ["4242 unknown, ciphertext", ev(4242, [], "AgVZ8yJ1V2xZb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldA==".repeat(3))],
  ["4242 unknown, a picture", ev(4242, [["imeta", "url https://img.example/u.jpg", "m image/jpeg"]], "")],
  ["30078 app data", ev(30078, [["d", "settings"]], JSON.stringify({ theme: "dark" }))],
  [
    "10000 mute list",
    ev(10000, [
      ["p", ALICE],
      ["t", "spam"],
    ]),
  ],
  ["10003 bookmarks", ev(10003, [["e", NOTE]])],
  ["31922 calendar event without a title", ev(31922, [["d", "x"]])],
  [
    "31924 calendar",
    ev(31924, [
      ["d", "cal"],
      ["title", "Meetups"],
    ]),
  ],
];

const FIXTURES: [string, MinimalEvent][] = [
  ...KIND_FIXTURES.map((f): [string, MinimalEvent] => [`kind: ${f.name}`, f.event as MinimalEvent]),
  ...CONTENT_KIND_FIXTURES.map((f): [string, MinimalEvent] => [`content: ${f.name}`, f.event]),
  ...THING_KIND_FIXTURES.map((f): [string, MinimalEvent] => [`thing: ${f.name}`, f.event]),
  ...SURFACE_CASES.map(([name, e]): [string, MinimalEvent] => [`surface: ${name}`, e]),
  ...EDGE_CASES.map(([name, e]): [string, MinimalEvent] => [`edge: ${name}`, e]),
];

// ---- what each surface decides ----

/** The page (EventScreen): which layout, which hero, and every gate that reads the hero. */
function pageOf(note: MinimalEvent, asDictionaryItem: boolean) {
  // A profile redirects to its person, long-form reads on the article layout; the event
  // layout below is what either falls back to (an address that won't encode).
  const route = note.kind === 0 ? "profile" : readsAsArticle(note) ? "article" : "event";
  const hero = heroFor(note, asDictionaryItem);
  const mediaItems = note.kind !== 6 && note.kind !== 16 ? mediaItemsOf(note) : [];
  const structural =
    hero === null && mediaItems.length === 0 && (!note.content?.trim() || contentShape(note.content).kind !== "text");
  const dlist = dlistOfEvent(note);
  return {
    route,
    hero: hero ?? (structural ? "(structural)" : "(media/text)"),
    dedicated: hero !== null,
    collectsRefs: hero === "note" || (hero === null && !structural),
    threads: hero !== "activity" && hero !== "git-status" && hero !== "git-reply",
    conversation: hero !== "activity",
    quietAuthor: !!dlist || asDictionaryItem || note.kind === 39998 || note.kind === 9998,
    roomy: NOTE_KINDS.has(note.kind) || note.kind === 9802,
    below: hero === "listing" ? "listing-related" : hero === "thing" ? "thing-sections" : null,
  };
}

function decisions(note: MinimalEvent) {
  const reading = readKind(note);
  const summary = summaryOf(note);
  return {
    page: pageOf(note, false),
    embed: embedShapeOf(note),
    namesKind: namesItsKind(note.kind),
    reader: reading ? { title: reading.title ?? null, facts: reading.facts ?? [] } : null,
    summary: { title: summary.title, facts: summary.facts },
    label: kindLabel(note),
    family: kindFamily(note.kind),
  };
}

describe("what every surface decides for every kind fixture", () => {
  it("is what it was when the registry took the rules over", async () => {
    const names = FIXTURES.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    // One JSON line per fixture (JSON Lines, which no formatter reflows): a diff names the kind that changed.
    const lines = FIXTURES.map(([name, note]) => JSON.stringify({ fixture: name, ...decisions(note) }));
    await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot("./kindSurfaces.decisions.jsonl");
  });

  it("reads a Dictionary item as one when the page says so", () => {
    const item = EDGE_CASES.find(([name]) => name === "39999 list item")![1];
    expect(pageOf(item, true)).toMatchObject({ hero: "dictionary-item", quietAuthor: true, dedicated: true });
  });
});
