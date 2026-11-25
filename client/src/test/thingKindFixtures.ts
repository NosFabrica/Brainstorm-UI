/**
 * One spec-shaped event per kind of "thing" — commerce, apps, communities,
 * fundraisers, reviews, collections and lists — for the tests that walk every
 * card surface (the event page, the quoted card, the search grid, the Top row,
 * the All row, the kind's label) and check each one draws the kind as itself,
 * never as the generic fallback.
 *
 * Each fixture is shaped by its spec (NIP-15, 28, 29, 34, 51, 52, 53, 58, 72,
 * 75, 87, 89, 99, 5A/5D, Open Markets), with the fields its surfaces should
 * show listed in `shows`: the title, and the spec'd facts a reader looks for.
 */
import type { MinimalEvent } from "@/lib/noteRefs";

export const AUTHOR = "a1".repeat(32);
const OTHER = "b2".repeat(32);
const THIRD = "c3".repeat(32);
/** Now, to the second: a deadline a month out is still ahead whenever the suite runs. */
export const FIXTURE_NOW = Math.floor(Date.now() / 1000);

let n = 0;
export function fixture(kind: number, tags: string[][], content = "", created_at = FIXTURE_NOW - 3600): MinimalEvent {
  n += 1;
  return {
    id: n.toString(16).padStart(64, "0"),
    kind,
    pubkey: AUTHOR,
    created_at,
    tags,
    content,
  };
}

export interface KindFixture {
  /** What the case is, for the test's name. */
  name: string;
  event: MinimalEvent;
  /**
   * What the kind's surfaces show: its title first (every surface), then the spec'd
   * facts a reader looks for — a price, a goal in sats, a count — on its page and row.
   */
  shows: string[];
  /** The kind's label, as every surface names it. */
  label: string;
}

const future = FIXTURE_NOW + 30 * 86_400;

export const THING_KIND_FIXTURES: KindFixture[] = [
  // ——— Commerce ———
  {
    name: "NIP-99 classified listing (30402)",
    label: "Listing",
    event: fixture(
      30402,
      [
        ["d", "bike-rental"],
        ["title", "City bike rental"],
        ["summary", "A sturdy bike for the month"],
        ["price", "15", "EUR", "month"],
        ["location", "Lisbon"],
        ["g", "eycs0p"],
        ["status", "active"],
        ["image", "https://img.example/bike.jpg", "800x600"],
        ["t", "bikes"],
      ],
      "Pick it up near the river.",
    ),
    shows: ["City bike rental", "€15 / month"],
  },
  {
    name: "NIP-99 draft listing (30403)",
    label: "Draft listing",
    event: fixture(
      30403,
      [
        ["d", "chair-draft"],
        ["title", "Oak chair"],
        ["summary", "Not for sale yet"],
        ["price", "120", "USD"],
        ["location", "Porto"],
        ["image", "https://img.example/chair.jpg"],
      ],
      "Still varnishing it.",
    ),
    shows: ["Oak chair"],
  },
  {
    name: "NIP-15 product (30018)",
    label: "Product",
    event: fixture(
      30018,
      [
        ["d", "prod-7f3a"],
        ["t", "coffee"],
      ],
      JSON.stringify({
        id: "prod-7f3a",
        stall_id: "stall-1",
        name: "Single-origin beans",
        description: "Roasted this week.",
        images: ["https://img.example/beans.jpg"],
        currency: "sat",
        price: 21000,
        quantity: 4,
        specs: [
          ["origin", "Ethiopia"],
          ["roast", "Light"],
        ],
      }),
    ),
    shows: ["Single-origin beans", "21,000 sats"],
  },
  {
    name: "NIP-15 auction (30020)",
    label: "Auction",
    event: fixture(
      30020,
      [["d", "auction-91"]],
      JSON.stringify({
        id: "auction-91",
        stall_id: "stall-1",
        name: "First-edition print",
        description: "Signed by the artist.",
        images: ["https://img.example/print.jpg"],
        starting_bid: 50000,
        start_date: FIXTURE_NOW - 3600,
        duration: 7 * 86_400,
      }),
    ),
    shows: ["First-edition print"],
  },
  {
    name: "NIP-15 stall (30017)",
    label: "Stall",
    event: fixture(
      30017,
      [["d", "stall-1"]],
      JSON.stringify({
        id: "stall-1",
        name: "Bean & Leaf",
        description: "Coffee and tea, roasted to order.",
        currency: "sat",
        shipping: [{ id: "z1", name: "Europe", cost: 3000, regions: ["Portugal", "Spain"] }],
      }),
    ),
    shows: ["Bean & Leaf"],
  },
  {
    name: "NIP-15 marketplace (30019)",
    label: "Marketplace",
    event: fixture(
      30019,
      [["d", "market-1"]],
      JSON.stringify({
        name: "Lisbon makers",
        about: "Things made in Lisbon.",
        ui: { picture: "https://img.example/market.png", darkMode: false },
        merchants: [OTHER, THIRD],
      }),
    ),
    shows: ["Lisbon makers", "2 merchants"],
  },
  {
    name: "Open Markets collection (30405)",
    label: "Collection",
    event: fixture(
      30405,
      [
        ["d", "winter"],
        ["title", "Winter range"],
        ["summary", "Warm things"],
        ["image", "https://img.example/winter.jpg"],
        ["a", `30402:${AUTHOR}:scarf`],
        ["a", `30402:${AUTHOR}:hat`],
      ],
      "Knitted by hand.",
    ),
    shows: ["Winter range"],
  },
  {
    name: "Open Markets shipping option (30406)",
    label: "Shipping option",
    event: fixture(30406, [
      ["d", "eu-standard"],
      ["title", "EU standard"],
      ["price", "5", "EUR"],
      ["country", "PT"],
      ["service", "standard"],
    ]),
    shows: ["EU standard"],
  },
  {
    name: "Open Markets product review (31555)",
    label: "Product review",
    event: fixture(
      31555,
      [
        ["d", `a:30402:${OTHER}:scarf`],
        ["rating", "1", "thumb"],
        ["rating", "0.8", "value"],
      ],
      "Warm and well made.",
    ),
    shows: ["Warm and well made."],
  },
  // ——— Live ———
  {
    name: "NIP-53 live stream (30311)",
    label: "Stream",
    event: fixture(
      30311,
      [
        ["d", "stream-1"],
        ["title", "Building a relay"],
        ["summary", "Live coding"],
        ["image", "https://img.example/stream.jpg"],
        ["streaming", "https://stream.example/live.m3u8"],
        ["starts", String(FIXTURE_NOW - 1800)],
        ["status", "live"],
        ["current_participants", "42"],
        ["p", OTHER, "wss://relay.example", "Host", ""],
        ["t", "coding"],
      ],
      "",
      FIXTURE_NOW - 60,
    ),
    shows: ["Building a relay"],
  },
  // ——— Apps ———
  {
    name: "Zap Store app (32267)",
    label: "App",
    event: fixture(32267, [
      ["d", "com.example.notes"],
      ["name", "Example Notes"],
      ["summary", "Notes that sync over Nostr"],
      ["icon", "https://img.example/icon.png"],
      ["f", "android-arm64-v8a"],
      ["url", "https://notes.example"],
      ["repository", "https://github.com/example/notes"],
    ]),
    shows: ["Example Notes", "Android"],
  },
  {
    name: "NIP-89 handler (31990)",
    label: "App handler",
    event: fixture(
      31990,
      [
        ["d", "1700000000123"],
        ["k", "30023"],
        ["k", "30024"],
        ["web", "https://reader.example/a/<bech32>", "naddr"],
      ],
      JSON.stringify({ name: "Long Reader", about: "Reads articles well.", picture: "https://img.example/lr.png" }),
    ),
    shows: ["Long Reader"],
  },
  {
    name: "NIP-5A root site (15128)",
    label: "Website",
    event: fixture(15128, [
      ["path", "/index.html", "a".repeat(64)],
      ["path", "/style.css", "b".repeat(64)],
      ["title", "My homepage"],
    ]),
    shows: ["My homepage"],
  },
  {
    name: "NIP-5A named site (35128)",
    label: "Website",
    event: fixture(35128, [
      ["d", "blog"],
      ["path", "/index.html", "a".repeat(64)],
      ["title", "Field notes"],
      ["description", "A small blog"],
    ]),
    shows: ["Field notes"],
  },
  {
    name: "NIP-5D root napplet (15129)",
    label: "Mini app",
    event: fixture(15129, [
      ["path", "/index.html", "a".repeat(64)],
      ["title", "Dice roller"],
      ["requires", "nostr"],
    ]),
    shows: ["Dice roller"],
  },
  {
    name: "NIP-5D named napplet (35129)",
    label: "Mini app",
    event: fixture(35129, [
      ["d", "timer"],
      ["path", "/index.html", "a".repeat(64)],
      ["title", "Pomodoro"],
    ]),
    shows: ["Pomodoro"],
  },
  // ——— Git ———
  {
    name: "NIP-34 repository (30617)",
    label: "Repo",
    event: fixture(30617, [
      ["d", "quartz"],
      ["name", "quartz"],
      ["description", "Nostr protocol library"],
      ["web", "https://github.com/example/quartz"],
      ["clone", "https://github.com/example/quartz.git"],
    ]),
    shows: ["quartz"],
  },
  {
    name: "NIP-34 patch (1617)",
    label: "Patch",
    event: fixture(
      1617,
      [
        ["a", `30617:${AUTHOR}:quartz`],
        ["t", "root"],
      ],
      [
        `From ${"3f2a".repeat(10)} Mon Sep 17 00:00:00 2001`,
        "From: Dev <dev@example.com>",
        "Date: Mon, 1 Sep 2026 10:00:00 +0000",
        "Subject: [PATCH] Fix the relay pool",
        "",
        "---",
        " pool.kt | 2 +-",
        "diff --git a/pool.kt b/pool.kt",
        "--- a/pool.kt",
        "+++ b/pool.kt",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n"),
    ),
    shows: ["Fix the relay pool"],
  },
  {
    name: "NIP-34 pull request (1618)",
    label: "Pull request",
    event: fixture(
      1618,
      [
        ["a", `30617:${AUTHOR}:quartz`],
        ["subject", "Add NIP-77 sync"],
        ["c", "d".repeat(40)],
        ["clone", "https://github.com/dev/quartz.git"],
      ],
      "Adds negentropy sync.",
    ),
    shows: ["Add NIP-77 sync"],
  },
  {
    name: "NIP-34 issue (1621)",
    label: "Issue",
    event: fixture(
      1621,
      [
        ["a", `30617:${AUTHOR}:quartz`],
        ["subject", "Crash on empty relay list"],
        ["t", "bug"],
      ],
      "It crashes when the list is empty.",
    ),
    shows: ["Crash on empty relay list"],
  },
  // ——— Communities ———
  {
    name: "NIP-28 channel (40)",
    label: "Channel",
    event: fixture(
      40,
      [],
      JSON.stringify({ name: "Nostr devs", about: "Talk about building", picture: "https://img.example/ch.png" }),
    ),
    shows: ["Nostr devs"],
  },
  {
    name: "NIP-28 channel update (41)",
    label: "Channel",
    event: fixture(
      41,
      [["e", "e".repeat(64), "wss://relay.example", "root"]],
      JSON.stringify({ name: "Nostr builders", about: "Renamed" }),
    ),
    shows: ["Nostr builders"],
  },
  {
    name: "NIP-72 community (34550)",
    label: "Community",
    event: fixture(34550, [
      ["d", "nostr-dev"],
      ["name", "Nostr Development"],
      ["description", "Building on Nostr"],
      ["image", "https://img.example/com.png", "256x256"],
      ["p", OTHER, "", "moderator"],
    ]),
    shows: ["Nostr Development", "1 moderator"],
  },
  {
    name: "NIP-29 group (39000)",
    label: "Group",
    event: fixture(39000, [
      ["d", "pizza"],
      ["name", "Pizza Lovers"],
      ["picture", "https://img.example/pizza.png"],
      ["about", "a group for people who love pizza"],
      ["private"],
      ["closed"],
    ]),
    shows: ["Pizza Lovers", "Private"],
  },
  // ——— Fundraisers ———
  {
    name: "NIP-75 zap goal (9041)",
    label: "Zap goal",
    event: fixture(
      9041,
      [
        ["relays", "wss://alice.example", "wss://bob.example"],
        ["amount", "210000000"],
        ["closed_at", String(future)],
        ["image", "https://img.example/goal.png"],
        ["summary", "Flights and a hotel"],
        ["r", "https://nostrasia.example"],
      ],
      "Nostrasia travel expenses",
    ),
    // 210,000,000 msats is 210,000 sats.
    shows: ["Nostrasia travel expenses", "210,000"],
  },
  {
    name: "Agora fundraiser (33863)",
    label: "Fundraiser",
    event: fixture(
      33863,
      [
        ["d", "well"],
        ["title", "A well for the village"],
        ["banner", "https://img.example/well.jpg"],
        ["goal", "5000000"],
        ["deadline", String(future)],
      ],
      "Clean water for 200 families.",
    ),
    shows: ["A well for the village", "5,000,000"],
  },
  // ——— Reviews, markets, ballots ———
  {
    name: "rating of anything (34259)",
    label: "Rating",
    event: fixture(
      34259,
      [
        ["d", "isbn:9780441013593"],
        ["m", "book"],
        ["rating", "0.8"],
      ],
      "A classic.",
    ),
    shows: ["Rating of a book"],
  },
  {
    name: "relay review (31987)",
    label: "Relay review",
    event: fixture(
      31987,
      [
        ["d", "wss://relay.example/"],
        ["rating", "0.8"],
      ],
      "Fast and reliable.",
    ),
    shows: ["relay.example"],
  },
  {
    name: "NIP-87 Cashu mint recommendation (38000)",
    label: "Mint review",
    event: fixture(
      38000,
      [
        ["k", "38172"],
        ["d", "f".repeat(66)],
        ["u", "https://mint.example.com"],
        ["a", `38172:${OTHER}:${"f".repeat(66)}`, "wss://relay.example"],
      ],
      "Reliable and fast.",
    ),
    shows: ["mint.example.com"],
  },
  {
    name: "NIP-87 Fedimint recommendation (38000)",
    label: "Mint review",
    event: fixture(
      38000,
      [
        ["k", "38173"],
        ["d", "9".repeat(64)],
        [
          "u",
          `fed11qgqrgvnhwden5te0v9k8q6rp9ekh2arfdeukuet595cr2ttpd3jhq6rzve6zuer9wchxvetyd938gcewvdhk6tcqqysptkuvknc7erjgf4em3zfh90kffqf9srujn6q53d6r056e4apze5cw27h75`,
        ],
      ],
      "My family's federation.",
    ),
    shows: ["Fedimint 99999999…"],
  },
  {
    name: "BAO prediction market (38000)",
    label: "Prediction market",
    event: fixture(
      38000,
      [
        ["d", "m-1"],
        ["market", "m-1"],
        ["title", "Will it rain tomorrow?"],
        ["outcome", "YES"],
        ["outcome", "NO"],
        ["status", "active"],
        ["end", String(future)],
      ],
      "",
    ),
    shows: ["Will it rain tomorrow?"],
  },
  // ——— Badges, emoji, calendars ———
  {
    name: "NIP-58 badge definition (30009)",
    label: "Badge",
    event: fixture(30009, [
      ["d", "bravery"],
      ["name", "Medal of Bravery"],
      ["description", "Awarded to users demonstrating bravery"],
      ["image", "https://img.example/bravery.png", "1024x1024"],
      ["thumb", "https://img.example/bravery_256.png", "256x256"],
    ]),
    shows: ["Medal of Bravery"],
  },
  {
    name: "NIP-58 badge set (30008)",
    label: "Badge set",
    event: fixture(30008, [
      ["d", "conferences"],
      ["title", "Conference badges"],
      ["a", `30009:${OTHER}:nostrasia`],
      ["e", "1".repeat(64), "wss://relay.example"],
      ["a", `30009:${OTHER}:nostriga`],
      ["e", "2".repeat(64), "wss://relay.example"],
    ]),
    shows: ["Conference badges", "2 badges"],
  },
  {
    name: "NIP-58 profile badges, deprecated 30008 form",
    label: "Profile badges",
    event: fixture(30008, [
      ["d", "profile_badges"],
      ["a", `30009:${OTHER}:bravery`],
      ["e", "3".repeat(64), "wss://relay.example"],
    ]),
    shows: ["Profile badges", "1 badge"],
  },
  {
    name: "NIP-51 emoji set (30030)",
    label: "Emoji pack",
    event: fixture(30030, [
      ["d", "cats"],
      ["title", "Cats"],
      ["emoji", "cat_wave", "https://img.example/cat_wave.png"],
      ["emoji", "cat_nod", "https://img.example/cat_nod.png"],
    ]),
    shows: ["Cats"],
  },
  {
    name: "NIP-52 calendar (31924)",
    label: "Calendar",
    event: fixture(
      31924,
      [
        ["d", "meetups"],
        ["title", "Lisbon meetups"],
        ["a", `31922:${OTHER}:meetup-1`],
        ["a", `31923:${OTHER}:meetup-2`],
      ],
      "Every Nostr meetup in Lisbon.",
    ),
    shows: ["Lisbon meetups"],
  },
  // ——— People lists ———
  {
    name: "NIP-51 follow set (30000)",
    label: "Follow set",
    event: fixture(30000, [
      ["d", "devs"],
      ["title", "Nostr devs"],
      ["p", OTHER],
      ["p", THIRD],
    ]),
    shows: ["Nostr devs"],
  },
  {
    name: "NIP-51 starter pack (39089)",
    label: "Starter pack",
    event: fixture(39089, [
      ["d", "artists"],
      ["title", "Artists to follow"],
      ["p", OTHER],
      ["p", THIRD],
    ]),
    shows: ["Artists to follow"],
  },
  {
    name: "Trusted people (30392)",
    label: "Trusted people",
    event: fixture(30392, [
      ["d", "dev-tag"],
      ["title", "Trusted developers"],
      ["p", OTHER, "", "92"],
      ["p", THIRD, "", "71"],
    ]),
    shows: ["Trusted developers"],
  },
  // ——— Item lists (NIP-51) ———
  {
    name: "NIP-51 pinned notes (10001)",
    label: "Pins",
    event: fixture(10001, [
      ["e", "4".repeat(64)],
      ["e", "5".repeat(64)],
    ]),
    shows: ["Pinned notes", "2 notes"],
  },
  {
    name: "NIP-51 bookmarks (10003)",
    label: "List",
    event: fixture(10003, [
      ["e", "6".repeat(64)],
      ["a", `30023:${OTHER}:essay`],
    ]),
    shows: ["Bookmarks"],
  },
  {
    name: "NIP-51 communities (10004)",
    label: "Communities",
    event: fixture(10004, [
      ["a", `34550:${OTHER}:nostr-dev`],
      ["a", `34550:${THIRD}:bitcoin`],
    ]),
    shows: ["Communities", "2 communities"],
  },
  {
    name: "NIP-51 interests (10015)",
    label: "List",
    event: fixture(10015, [
      ["t", "bitcoin"],
      ["t", "nostr"],
      ["a", `30015:${OTHER}:tech`],
    ]),
    shows: ["Interests"],
  },
  {
    name: "NIP-51 generic list (30001)",
    label: "List",
    event: fixture(30001, [
      ["d", "reading"],
      ["title", "Reading list"],
      ["e", "7".repeat(64)],
    ]),
    shows: ["Reading list"],
  },
  {
    name: "NIP-51 bookmark set (30003)",
    label: "List",
    event: fixture(30003, [
      ["d", "recipes"],
      ["title", "Recipes"],
      ["a", `30023:${OTHER}:bread`],
      ["e", "8".repeat(64)],
    ]),
    shows: ["Recipes"],
  },
  {
    name: "NIP-51 article curation set (30004)",
    label: "Collection",
    event: fixture(30004, [
      ["d", "yaks"],
      ["title", "Yaks"],
      ["description", "All about yaks"],
      ["a", `30023:${OTHER}:yak-1`],
      ["a", `30023:${OTHER}:yak-2`],
    ]),
    shows: ["Yaks"],
  },
  {
    name: "NIP-51 video curation set (30005)",
    label: "Collection",
    event: fixture(30005, [
      ["d", "talks"],
      ["title", "Conference talks"],
      ["e", "9".repeat(64)],
    ]),
    shows: ["Conference talks"],
  },
  {
    name: "NIP-51 picture curation set (30006)",
    label: "Collection",
    event: fixture(30006, [
      ["d", "sunsets"],
      ["title", "Sunsets"],
      ["e", "a".repeat(64)],
    ]),
    shows: ["Sunsets"],
  },
  {
    name: "NIP-51 interest set (30015)",
    label: "List",
    event: fixture(30015, [
      ["d", "tech"],
      ["title", "Tech"],
      ["t", "rust"],
      ["t", "kotlin"],
    ]),
    shows: ["Tech"],
  },
];

/** The fixture for a kind (the first, where a kind has several). */
export function fixtureOf(kind: number): KindFixture {
  const f = THING_KIND_FIXTURES.find((x) => x.event.kind === kind);
  if (!f) throw new Error(`no fixture for kind ${kind}`);
  return f;
}
