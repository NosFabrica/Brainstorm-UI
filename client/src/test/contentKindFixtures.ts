/**
 * One spec-shaped event per content and media kind, for the tests that walk
 * each kind through every surface that draws it (lib/contentKindSurfaces.test,
 * components/search/contentKindSurfaces.test). Each fixture carries the fields
 * its spec names, so a surface that reads a tag by the wrong name, index or
 * marker shows up as a missing field, and one that gives up shows up as the
 * generic reading.
 *
 * Specs: NIP-01/24 (0), NIP-10 (1), NIP-7D (11), NIP-22 (1111), NIP-18 (6, 16),
 * NIP-68 (20), NIP-71 (21, 22, 34235, 34236), NIP-94 (1063), NIP-A0 (1222,
 * 1244), NIP-35 (2003), NIP-23 (30023, 30024), NKBIP-01 (30040, 30041),
 * NIP-54 (30818); the rest as the code that reads them cites its source.
 */
import type { MinimalEvent } from "@/lib/noteRefs";

export const AUTHOR = "a".repeat(64);
export const OTHER = "b".repeat(64);
const ROOT_ID = "c".repeat(64);
const PARENT_ID = "d".repeat(64);
const AT = 1_790_000_000;
/** 2026-01-01: a `published_at` before every fixture's `created_at`. */
export const PUBLISHED_AT = 1_767_225_600;

let n = 0;
const ev = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "e"),
  kind,
  pubkey: AUTHOR,
  created_at: AT,
  tags,
  content,
});

const note = ev(1, [["t", "nostr"]], "Good morning from the mountains");

export interface ContentKindFixture {
  name: string;
  event: MinimalEvent;
  /** Words the spec's own fields put on any card that reads them (a title, a caption, a name). */
  shows: string;
}

export const CONTENT_KIND_FIXTURES: ContentKindFixture[] = [
  {
    name: "0 profile",
    event: ev(
      0,
      [],
      JSON.stringify({
        name: "alice",
        display_name: "Alice Liddell",
        about: "Down the rabbit hole",
        picture: "https://img.test/alice.jpg",
        website: "https://alice.test",
        nip05: "alice@alice.test",
      }),
    ),
    shows: "Alice Liddell",
  },
  {
    name: "1 note (NIP-10 reply)",
    event: ev(
      1,
      [
        ["e", ROOT_ID, "wss://r.test", "root", OTHER],
        ["e", PARENT_ID, "wss://r.test", "reply", OTHER],
        ["p", OTHER],
      ],
      "Agreed, the mountains are lovely",
    ),
    shows: "Agreed, the mountains are lovely",
  },
  {
    name: "11 thread (NIP-7D)",
    event: ev(11, [["title", "Favourite trails"]], "Share the trails you love"),
    shows: "Favourite trails",
  },
  {
    name: "1111 comment (NIP-22)",
    event: ev(
      1111,
      [
        ["A", `30023:${OTHER}:trail-guide`, "wss://r.test"],
        ["K", "30023"],
        ["P", OTHER],
        ["e", PARENT_ID, "wss://r.test", OTHER],
        ["k", "1111"],
        ["p", OTHER],
      ],
      "The second trail is closed in winter",
    ),
    shows: "The second trail is closed in winter",
  },
  {
    name: "6 repost (NIP-18)",
    event: ev(
      6,
      [
        ["e", note.id, "wss://r.test"],
        ["p", AUTHOR],
      ],
      JSON.stringify(note),
    ),
    shows: "Good morning from the mountains",
  },
  {
    name: "16 generic repost (NIP-18)",
    event: ev(
      16,
      [
        ["e", "f".repeat(64), "wss://r.test"],
        ["k", "20"],
        ["p", OTHER],
      ],
      JSON.stringify({
        id: "f".repeat(64),
        pubkey: OTHER,
        kind: 20,
        created_at: AT - 10,
        content: "Sunrise",
        tags: [
          ["title", "Sunrise over the ridge"],
          ["imeta", "url https://img.test/ridge.jpg", "m image/jpeg", "dim 1200x800"],
        ],
        sig: "0".repeat(128),
      }),
    ),
    shows: "Sunrise over the ridge",
  },
  {
    name: "20 picture (NIP-68)",
    event: ev(
      20,
      [
        ["title", "Ridge at dawn"],
        ["imeta", "url https://img.test/dawn.jpg", "m image/jpeg", "dim 1200x800", "alt A ridge at dawn"],
        ["t", "photography"],
      ],
      "First light on the ridge",
    ),
    shows: "Ridge at dawn",
  },
  ...[21, 22, 34235, 34236].map((kind): ContentKindFixture => ({
    name: `${kind} video (NIP-71)`,
    event: ev(
      kind,
      [
        ...(kind > 30000 ? [["d", `clip-${kind}`]] : []),
        ["title", "Waterfall in spring"],
        ["published_at", String(PUBLISHED_AT)],
        [
          "imeta",
          "url https://vid.test/falls.mp4",
          "m video/mp4",
          "image https://vid.test/falls.jpg",
          "dim 1920x1080",
          "duration 29.2",
        ],
      ],
      "A short walk to the falls",
    ),
    shows: "Waterfall in spring",
  })),
  {
    name: "1063 file (NIP-94)",
    event: ev(
      1063,
      [
        ["url", "https://files.test/map.png"],
        ["m", "image/png"],
        ["x", "1".repeat(64)],
        ["dim", "800x600"],
        ["summary", "Trail map of the north ridge"],
        ["alt", "A hand-drawn trail map"],
      ],
      "The north ridge trail map",
    ),
    shows: "The north ridge trail map",
  },
  {
    name: "1222 voice (NIP-A0)",
    event: ev(
      1222,
      [["imeta", "url https://blossom.test/voice.mp4", "waveform 0 7 35 8 100", "duration 8"]],
      "https://blossom.test/voice.mp4",
    ),
    shows: "Voice message",
  },
  {
    name: "1222 voice, no imeta (NIP-A0)",
    event: ev(1222, [], "https://blossom.test/voice2.mp4"),
    shows: "Voice message",
  },
  {
    name: "1244 voice reply (NIP-A0)",
    event: ev(
      1244,
      [
        ["E", ROOT_ID, "wss://r.test", OTHER],
        ["K", "1222"],
        ["P", OTHER],
        ["e", ROOT_ID, "wss://r.test", OTHER],
        ["k", "1222"],
        ["p", OTHER],
        ["imeta", "url https://blossom.test/reply.m4a", "duration 5"],
      ],
      "https://blossom.test/reply.m4a",
    ),
    shows: "Voice",
  },
  {
    name: "31337 track",
    event: ev(31337, [
      ["d", "song-1"],
      ["title", "Mountain Song"],
      ["artist", "The Hikers"],
      ["media", "https://audio.test/song.mp3"],
      ["image", "https://audio.test/song.jpg"],
    ]),
    shows: "Mountain Song",
  },
  {
    name: "36787 track",
    event: ev(36787, [
      ["d", "song-2"],
      ["title", "Valley Song"],
      ["artist", "The Hikers"],
      ["url", "https://audio.test/valley.mp3"],
      ["image", "https://audio.test/valley.jpg"],
      ["duration", "215"],
    ]),
    shows: "Valley Song",
  },
  {
    name: "54 episode",
    event: ev(
      54,
      [
        ["title", "Episode 12: Ridges"],
        ["image", "https://pod.test/12.jpg"],
        ["audio", "https://pod.test/12.mp3", "audio/mpeg"],
      ],
      "We talk about ridges",
    ),
    shows: "Episode 12: Ridges",
  },
  {
    name: "30054 episode",
    event: ev(30054, [
      ["d", "ep-13"],
      ["title", "Episode 13: Valleys"],
      ["audio", "https://pod.test/13.mp3", "audio/mpeg"],
      ["duration", "1800"],
    ]),
    shows: "Episode 13: Valleys",
  },
  {
    name: "30055 trailer",
    event: ev(30055, [
      ["d", "trailer-1"],
      ["title", "Season 2 trailer"],
      ["url", "https://pod.test/trailer.mp3"],
      ["type", "audio/mpeg"],
    ]),
    shows: "Season 2 trailer",
  },
  {
    name: "2003 torrent (NIP-35)",
    event: ev(
      2003,
      [
        ["title", "Trail footage 4K"],
        ["x", "0123456789abcdef0123456789abcdef01234567"],
        ["file", "footage/part1.mkv", "1000000"],
        ["file", "footage/part2.mkv", "2000000"],
        ["tracker", "udp://tracker.test:1337"],
        ["i", "tcat:video,movie,4k"],
        ["i", "imdb:tt15239678"],
        ["t", "movie"],
      ],
      "Raw footage from the trail",
    ),
    shows: "Trail footage 4K",
  },
  {
    name: "30023 article (NIP-23)",
    event: ev(
      30023,
      [
        ["d", "trail-guide"],
        ["title", "A guide to the north ridge"],
        ["summary", "Everything you need before you go"],
        ["image", "https://img.test/guide.jpg"],
        ["published_at", String(PUBLISHED_AT)],
        ["t", "hiking"],
      ],
      "## Before you go\n\nPack water.",
    ),
    shows: "A guide to the north ridge",
  },
  {
    name: "30024 draft (NIP-23)",
    event: ev(
      30024,
      [
        ["d", "draft-guide"],
        ["title", "Draft: the south ridge"],
        ["summary", "Notes for a later guide"],
      ],
      "Work in progress",
    ),
    shows: "Draft: the south ridge",
  },
  {
    name: "30040 publication (NKBIP-01)",
    event: ev(30040, [
      ["d", "ridge-book"],
      ["title", "The Ridge Book"],
      ["author", "Alice"],
      ["summary", "A book of ridges"],
      ["a", `30041:${AUTHOR}:ridge-book-chapter-1`],
    ]),
    shows: "The Ridge Book",
  },
  {
    name: "30041 section (NKBIP-01)",
    event: ev(
      30041,
      [
        ["d", "ridge-book-chapter-1"],
        ["title", "Chapter 1"],
      ],
      "== Chapter 1\n\nIt began on a ridge.",
    ),
    shows: "Chapter 1",
  },
  {
    name: "30045 bookshelf",
    event: ev(30045, [
      ["d", "my-shelf"],
      ["title", "Mountain reading"],
      ["a", `30040:${AUTHOR}:ridge-book`],
    ]),
    shows: "Mountain reading",
  },
  {
    name: "30817 spec",
    event: ev(
      30817,
      [
        ["d", "trail-nip"],
        ["title", "Trail reports"],
        ["k", "1315"],
      ],
      "# Trail reports\n\nA kind for trail conditions.",
    ),
    shows: "Trail reports",
  },
  {
    name: "30818 wiki (NIP-54)",
    event: ev(
      30818,
      [
        ["d", "north-ridge"],
        ["title", "North Ridge"],
        ["summary", "A ridge in the north"],
      ],
      "The north ridge is a ridge.",
    ),
    shows: "North Ridge",
  },
  {
    name: "30142 learning resource",
    event: ev(30142, [
      ["d", "https://learn.test/ridges"],
      ["name", "Reading ridges"],
      ["description", "A lesson on ridges"],
      ["inLanguage", "en"],
    ]),
    shows: "Reading ridges",
  },
  {
    name: "34139 playlist",
    event: ev(34139, [
      ["d", "hiking-mix"],
      ["title", "Hiking mix"],
      ["a", `36787:${AUTHOR}:song-2`],
      ["a", `31337:${AUTHOR}:song-1`],
    ]),
    shows: "Hiking mix",
  },
];
