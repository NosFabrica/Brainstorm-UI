// @vitest-environment node
/**
 * The kinds with no card of their own, read the way staging publishes them
 * (probed 2026-09-29) — including the junk that shares their kind numbers.
 */
import { describe, expect, it } from "vitest";
import {
  kind38000Format,
  marketStatus,
  decodeEntities,
  describeThing,
  hostOfUrl,
  licenseLabel,
  oneCardPerChannel,
  starsOf,
  THING_KINDS,
} from "./thing";

const ev = (kind: number, tags: string[][], content = "") => ({ kind, tags, content, created_at: 1_790_000_000 });

describe("describeThing — communities", () => {
  it("reads a NIP-28 channel's name and about from its JSON content", () => {
    const t = describeThing(
      ev(
        40,
        [],
        '{"name":"TWENTY ONE esports · Chess","about":"The global chat of Chess.","picture":"https://x.test/c.png"}',
      ),
    );
    expect(t).toMatchObject({
      title: "TWENTY ONE esports · Chess",
      description: "The global chat of Chess.",
      image: "https://x.test/c.png",
    });
  });

  it("refuses a channel with no name, or with content that is not JSON", () => {
    expect(describeThing(ev(41, [["e", "abc"]], '{"about":"x"}'))).toBeNull();
    expect(describeThing(ev(40, [], "hello"))).toBeNull();
  });

  it("reads a NIP-72 community and counts its moderators", () => {
    const t = describeThing(
      ev(34550, [
        ["d", "kiteh"],
        ["name", "Kiteh Kawasaki"],
        ["description", "Hi fans"],
        ["p", "a".repeat(64), ""],
        ["p", "b".repeat(64), "", "moderator"],
      ]),
    );
    expect(t).toMatchObject({ title: "Kiteh Kawasaki", description: "Hi fans", facts: ["2 moderators"] });
  });

  it("reads a NIP-29 group and whether anyone may join", () => {
    const t = describeThing(ev(39000, [["d", "x"], ["name", "nutshell"], ["about", "cashu"], ["public"], ["closed"]]));
    expect(t).toMatchObject({ title: "nutshell", facts: ["Public", "Closed"] });
  });
});

describe("describeThing — shops, apps and sites", () => {
  it("reads a NIP-15 stall and leaves out the typing game that shares its kind", () => {
    expect(
      describeThing(
        ev(30017, [["d", "B2Ho"]], '{"id":"B2Ho","name":"BKBoom Paper Art","description":"art","currency":"sat"}'),
      ),
    ).toMatchObject({ title: "BKBoom Paper Art", facts: ["Shop", "Prices in SAT"] });
    expect(describeThing(ev(30017, [["t", "typing-test"]], '{"wpm":63,"accuracy":99}'))).toBeNull();
  });

  it("reads a NIP-15 marketplace and refuses an unnamed one", () => {
    expect(
      describeThing(
        ev(30019, [], '{"name":"ZoneUK","about":"","ui":{"picture":"https://x.test/p.png"},"merchants":["a","b"]}'),
      ),
    ).toMatchObject({ title: "ZoneUK", image: "https://x.test/p.png", facts: ["Marketplace", "2 merchants"] });
    expect(describeThing(ev(30019, [], '{"name":"","merchants":[]}'))).toBeNull();
  });

  it("reads a NIP-89 handler's profile JSON and the kinds it opens", () => {
    const t = describeThing(
      ev(
        31990,
        [
          ["d", "blindoracle-v1"],
          ["k", "5300"],
          ["k", "30078"],
        ],
        '{"name":"BlindOracle","display_name":"BlindOracle - Privacy-First","about":"Financial services","website":"https://blind.test"}',
      ),
    );
    expect(t).toMatchObject({
      title: "BlindOracle - Privacy-First",
      description: "Financial services",
      link: "https://blind.test",
      facts: ["Opens 2 kinds"],
    });
  });

  it("names a Nostr site by its d when it has no title", () => {
    const t = describeThing(
      ev(35128, [
        ["d", "gitworkshop"],
        ["path", "/index.html", "x"],
        ["path", "/404.html", "y"],
      ]),
    );
    expect(t).toMatchObject({ title: "gitworkshop", facts: ["Nostr site", "2 files"] });
    expect(describeThing(ev(15128, [["path", "/index.html", "x"]]))?.title).toBe("Website");
    expect(
      describeThing(
        ev(35129, [
          ["d", "sh-viewer"],
          ["title", "SeedHammer viewer"],
        ]),
      )?.facts,
    ).toEqual(["Mini app"]);
  });
});

describe("describeThing — lists and collections", () => {
  it("reads a NIP-58 badge", () => {
    expect(
      describeThing(
        ev(30009, [
          ["d", "ice"],
          ["name", "Ice Cool Builder"],
          ["image", "https://x.test/b.png", "1024x1024"],
        ]),
      ),
    ).toMatchObject({ title: "Ice Cool Builder", image: "https://x.test/b.png" });
  });

  it("shows an emoji pack's emoji, and refuses a pack with none", () => {
    const t = describeThing(
      ev(30030, [
        ["d", "p"],
        ["title", "Legends"],
        ["emoji", "a", "https://x.test/a.png"],
        ["emoji", "b", "https://x.test/b.png"],
      ]),
    );
    expect(t).toMatchObject({
      title: "Legends",
      facts: ["2 emoji"],
      previews: ["https://x.test/a.png", "https://x.test/b.png"],
    });
    expect(
      describeThing(
        ev(30030, [
          ["d", "p"],
          ["title", "Empty"],
        ]),
      ),
    ).toBeNull();
  });

  it("reads a music playlist as an album with its track count", () => {
    const t = describeThing(
      ev(34139, [
        ["d", "ep"],
        ["title", "The EP (Amnesia)"],
        ["type", "album"],
        ["a", "36787:x:1"],
        ["a", "36787:x:2"],
      ]),
    );
    expect(t).toMatchObject({ title: "The EP (Amnesia)", facts: ["Album", "2 tracks"] });
  });

  it("reads a NIP-52 calendar and counts its events", () => {
    const t = describeThing(
      ev(31924, [
        ["d", "meetup-370"],
        ["title", "Jednadvacet"],
        ["location", "České Budějovice"],
        ["a", "31923:x:1"],
      ]),
    );
    expect(t).toMatchObject({ title: "Jednadvacet", facts: ["Calendar", "1 event", "České Budějovice"] });
  });
});

describe("describeThing — fundraisers", () => {
  it("reads a NIP-75 zap goal: the content is the goal, the amount is millisats", () => {
    const t = describeThing(
      ev(
        9041,
        [
          ["amount", "1400000000"],
          ["summary", "Help me fund the equipment"],
        ],
        "Help me Start my Podcast",
      ),
    );
    expect(t).toMatchObject({
      title: "Help me Start my Podcast",
      description: "Help me fund the equipment",
      facts: ["Goal 1,400,000 sats"],
    });
  });

  it("reads an Agora fundraiser with its banner and goal in sats", () => {
    const t = describeThing(
      ev(
        33863,
        [
          ["d", "bitmoot"],
          ["title", "BitMoot"],
          ["imeta", "url https://x.test/banner.jpg"],
          ["goal", "20000"],
        ],
        "BitMoot is an open-source platform",
      ),
    );
    expect(t).toMatchObject({
      title: "BitMoot",
      description: "BitMoot is an open-source platform",
      image: "https://x.test/banner.jpg",
      facts: ["Goal 20,000 sats"],
    });
  });
});

describe("describeThing — reviews", () => {
  it("reads a relay review: the relay's host, the stars, the words", () => {
    const t = describeThing(
      ev(
        31987,
        [
          ["d", "wss://relay.nostrcheck.me/"],
          ["rating", "0.8"],
        ],
        "maybe a bit slow",
      ),
    );
    expect(t).toMatchObject({ title: "relay.nostrcheck.me", stars: 4, description: "maybe a bit slow" });
  });

  it("reads a NIP-87 mint review on the raw five-star scale, linking to the mint", () => {
    const t = describeThing(
      ev(
        38000,
        [
          ["d", "https://mint.lnpay.cz"],
          ["u", "https://mint.lnpay.cz"],
          ["rating", "5"],
        ],
        "Stable and reliable",
      ),
    );
    expect(t).toMatchObject({ title: "mint.lnpay.cz", stars: 5, link: "https://mint.lnpay.cz" });
  });

  it("reads a NIP-87 Fedimint recommendation named by its `k`, even with no `u`", () => {
    const t = describeThing(
      ev(
        38000,
        [
          ["k", "38173"],
          ["d", "fedmint.example"],
        ],
        "Solid guardians",
      ),
    );
    expect(t).toMatchObject({ title: "fedmint.example", description: "Solid guardians", facts: ["Ecash mint"] });
  });

  it("leaves out the kind-38000s with no format of their own: a test vote, an unknown `k`", () => {
    expect(describeThing(ev(38000, [["d", "b21068c8"]], "[1/5] sybil test vote, safe to delete"))).toBeNull();
    expect(
      describeThing(
        ev(38000, [
          ["k", "38177"],
          ["d", "8404582ef72b077c9e1926d3a6d86563959e5f7505b56a3ebdebaefb99887f5d"],
        ]),
      ),
    ).toBeNull();
  });

  it("says an unknown mark as written", () => {
    expect(
      describeThing(
        ev(34259, [
          ["d", "x"],
          ["m", "recipes"],
          ["rating", "0.6"],
        ]),
      )?.title,
    ).toBe("Rating of recipes");
  });

  it("reads a rating of a book", () => {
    const t = describeThing(
      ev(
        34259,
        [
          ["d", "30040:x:y"],
          ["m", "book"],
          ["rating", "1.000"],
          ["s", "5"],
        ],
        "Great",
      ),
    );
    expect(t).toMatchObject({ title: "Rating of a book", stars: 5, description: "Great" });
  });
});

describe("starsOf — the two rating scales", () => {
  it("prefers the author's own star count", () => {
    expect(
      starsOf(
        ev(34259, [
          ["rating", "1"],
          ["s", "2"],
        ]),
      ),
    ).toBe(2);
  });
  it("reads 0..1 as a fraction, including a full 1", () => {
    expect(starsOf(ev(34259, [["rating", "0.5"]]))).toBe(2.5);
    expect(starsOf(ev(34259, [["rating", "1.000"]]))).toBe(5);
  });
  it("reads 1..5 as raw stars, and anything else as no score", () => {
    expect(starsOf(ev(38000, [["rating", "3"]]))).toBe(3);
    expect(starsOf(ev(38000, [["rating", "9"]]))).toBeNull();
    expect(starsOf(ev(38000, []))).toBeNull();
  });
  it("scores the overall rating, not an aspect", () => {
    expect(
      starsOf(
        ev(31987, [
          ["rating", "0.2", "speed"],
          ["rating", "1"],
        ]),
      ),
    ).toBe(5);
  });
});

describe("describeThing — the rest", () => {
  it("reads a torrent with its files' size", () => {
    const t = describeThing(
      ev(
        2003,
        [
          ["title", "Album 1998"],
          ["file", "a.flac", "1048576"],
          ["file", "b.flac", "1048576"],
        ],
        "Best album ever",
      ),
    );
    expect(t).toMatchObject({ title: "Album 1998", facts: ["Torrent", "2 files", "2 MB"] });
  });

  it("reads a learning resource", () => {
    const t = describeThing(
      ev(30142, [
        ["name", "Schulgottesdienst"],
        ["description", "Für Klassen 3 und 4"],
        ["inLanguage", "de"],
      ]),
    );
    expect(t).toMatchObject({ title: "Schulgottesdienst", facts: ["Learning resource", "DE"] });
  });

  it("knows nothing of kinds outside its set", () => {
    expect(describeThing(ev(1, [["title", "x"]], "hello"))).toBeNull();
    expect(THING_KINDS.has(1)).toBe(false);
  });

  it("names a host from a URL, and leaves a non-URL as written", () => {
    expect(hostOfUrl("wss://relay.damus.io/")).toBe("relay.damus.io");
    expect(hostOfUrl("not a url")).toBe("not a url");
  });
});

describe("starsOf — a kind whose scale is known reads only that scale", () => {
  it("a mint review's rating 1 is one star, not five", () => {
    expect(starsOf(ev(38000, [["rating", "1"]]), "stars")).toBe(1);
    expect(
      describeThing(
        ev(38000, [
          ["u", "https://mint.test"],
          ["rating", "1"],
        ]),
      )?.stars,
    ).toBe(1);
    expect(starsOf(ev(38000, [["rating", "0.5"]]), "stars")).toBeNull();
  });

  it("a relay review above 1 is malformed, not a raw star count", () => {
    expect(starsOf(ev(31987, [["rating", "4"]]), "fraction")).toBeNull();
    expect(
      describeThing(
        ev(31987, [
          ["d", "wss://r.test"],
          ["rating", "4"],
        ]),
      )?.stars,
    ).toBeNull();
  });
});

describe("describeThing — one read per event", () => {
  it("answers the same object for the same event", () => {
    const e = ev(40, [], '{"name":"Chess chat"}');
    expect(describeThing(e)).toBe(describeThing(e));
  });
});

describe("oneCardPerChannel — NIP-28 channels, once each", () => {
  const creator = "c".repeat(64);
  const stranger = "5".repeat(64);
  const at = (
    id: string,
    kind: number,
    pubkey: string,
    created_at: number,
    content: string,
    tags: string[][] = [],
  ) => ({
    event: { id, kind, pubkey, created_at, content, tags },
  });

  it("the newest named event is the channel's card, where the channel first appeared", () => {
    const hits = [
      at("ch40", 40, creator, 1, '{"name":"Chess chat"}'),
      at("other", 34550, creator, 1, "", [["name", "x"]]),
      at("ch41", 41, creator, 5, '{"name":"Chess chat","about":"new"}', [["e", "ch40"]]),
    ];
    expect(oneCardPerChannel(hits).map((h) => h.event.id)).toEqual(["ch41", "other"]);
  });

  it("an unnamed newer update never takes the named card down with it", () => {
    const hits = [
      at("ch40", 40, creator, 1, '{"name":"Chess chat"}'),
      at("ch41", 41, creator, 9, '{"about":"no name"}', [["e", "ch40"]]),
    ];
    expect(oneCardPerChannel(hits).map((h) => h.event.id)).toEqual(["ch40"]);
  });

  it("a stranger's update to someone else's channel is dropped", () => {
    const hits = [
      at("ch40", 40, creator, 1, '{"name":"Chess chat"}'),
      at("scam", 41, stranger, 9, '{"name":"Scam giveaway"}', [["e", "ch40"]]),
    ];
    expect(oneCardPerChannel(hits).map((h) => h.event.id)).toEqual(["ch40"]);
  });

  it("with the 40 off the page, each author's updates stand apart", () => {
    const hits = [
      at("a1", 41, creator, 1, '{"name":"Chess chat"}', [["e", "ch40"]]),
      at("a2", 41, creator, 4, '{"name":"Chess chat 2"}', [["e", "ch40"]]),
      at("s1", 41, stranger, 9, '{"name":"Scam giveaway"}', [["e", "ch40"]]),
    ];
    expect(oneCardPerChannel(hits).map((h) => h.event.id)).toEqual(["a2", "s1"]);
  });
});

describe("decodeEntities — HTML entities publishers leave in plain text", () => {
  it("decodes the named and numeric ones, leaves the rest", () => {
    expect(decodeEntities("Kettle &amp; Pine")).toBe("Kettle & Pine");
    expect(decodeEntities("&lt;b&gt; &#39;x&#39; &#x2764;")).toBe("<b> 'x' ❤");
    expect(decodeEntities("&unknown; & alone")).toBe("&unknown; & alone");
  });

  it("is applied to every thing's title and description", () => {
    expect(
      describeThing(
        ev(35128, [
          ["d", "k"],
          ["title", "Kettle &amp; Pine"],
        ]),
      )?.title,
    ).toBe("Kettle & Pine");
  });
});

describe("licenseLabel", () => {
  it("names Creative Commons licences the way people write them", () => {
    expect(licenseLabel("https://creativecommons.org/licenses/by-nc-sa/4.0/")).toBe("CC BY-NC-SA 4.0");
    expect(licenseLabel("https://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0");
    expect(licenseLabel("MIT")).toBe("MIT");
    expect(licenseLabel(undefined)).toBeNull();
  });
});

// Kind 38000's formats, as the production relay holds them (2026-09-30).
const BAO_MARKET = [
  ["d", "59a3b0cda6c25472714327435b0e8190"],
  ["market", "59a3b0cda6c25472714327435b0e8190"],
  ["type", "binary"],
  ["category", "bitcoin"],
  ["c", "bitcoin"],
  ["status", "resolved"],
  ["end", "1778716800"],
  ["network", "demo"],
  ["client", "BAO Markets"],
  ["outcome", "YES"],
  ["outcome", "NO"],
  ["resolution", "NO"],
  [
    "data",
    JSON.stringify({
      title: "Will the Bitcoin network mine fewer than 140 blocks today?",
      description: "Target is 144 blocks per day.",
      outcomes: ["YES", "NO"],
    }),
  ],
];

describe("kind38000Format", () => {
  it("tells a mint review, a prediction market and a ballot apart by the tags each app writes", () => {
    expect(
      kind38000Format({
        tags: [
          ["k", "38172"],
          ["u", "https://mint.example"],
        ],
      }),
    ).toBe("mint-review");
    expect(kind38000Format({ tags: [["u", "https://mint.example"]] })).toBe("mint-review");
    expect(kind38000Format({ tags: BAO_MARKET })).toBe("market");
    expect(
      kind38000Format({
        tags: [
          ["d", "baofund-x"],
          ["title", "T"],
          ["outcome", "YES"],
          ["outcome", "NO"],
        ],
      }),
    ).toBe("market");
    expect(
      kind38000Format({
        tags: [
          ["d", "baoMarkets-mkt-1"],
          ["type", "binary"],
          ["end", "1769256240"],
        ],
      }),
    ).toBe("market");
    expect(kind38000Format({ tags: [["election", "spring-2026-council"]] })).toBe("ballot");
    expect(kind38000Format({ tags: [["d", "b21068c8"]] })).toBeNull();
    expect(kind38000Format({ tags: [["equitas_class", "PAT"]] })).toBeNull();
  });
});

describe("describeThing — prediction markets", () => {
  it("reads BAO's current shape: the words from `data`, the outcomes, the winner, the demo network", () => {
    const t = describeThing(ev(38000, BAO_MARKET, "₿ Will the Bitcoin network mine… #baomarkets"));
    expect(t).toMatchObject({
      title: "Will the Bitcoin network mine fewer than 140 blocks today?",
      description: "Target is 144 blocks per day.",
      stars: null,
      facts: ["Prediction market", "Demo"],
      detail: {
        type: "market",
        outcomes: ["YES", "NO"],
        status: "resolved",
        resolution: "NO",
        closes: 1778716800,
        category: "bitcoin",
        demo: true,
      },
    });
  });

  it("reads BAO Fund's shape (a `title` tag, JSON content) and the first shape (outcome objects, a `state`)", () => {
    const fund = describeThing(
      ev(
        38000,
        [
          ["d", "baofund-fr_980ed00afda2a574-0"],
          ["title", "Will the room deliver by the deadline?"],
          ["c", "bao-fund"],
          ["n", "demo"],
          ["outcome", "YES", "YES"],
          ["outcome", "NO", "NO"],
        ],
        JSON.stringify({ title: "Will the room deliver by the deadline?", description: "CRITERIA: a milestone" }),
      ),
    );
    expect(fund).toMatchObject({
      title: "Will the room deliver by the deadline?",
      description: "CRITERIA: a milestone",
      detail: { outcomes: ["YES", "NO"], category: "bao-fund", demo: true },
    });
    const first = describeThing(
      ev(
        38000,
        [
          ["d", "baoMarkets-mkt-1769205950092-0b985e090"],
          ["type", "binary"],
          ["category", "nostr"],
          ["end", "1769256240"],
          ["state", "funding"],
        ],
        JSON.stringify({
          title: "Will it happen?",
          outcomes: [
            { id: "YES", label: "Yes" },
            { id: "NO", label: "No" },
          ],
        }),
      ),
    );
    expect(first).toMatchObject({
      title: "Will it happen?",
      // "funding", but its betting closed in January: closed, as Amethyst reads it too.
      detail: { outcomes: ["Yes", "No"], status: "closed", closes: 1769256240, demo: false },
    });
  });

  it("calls voided markets cancelled, and a market with no question is nothing", () => {
    expect(
      describeThing(ev(38000, [...BAO_MARKET.filter((t) => t[0] !== "status"), ["status", "voided"]]))?.detail,
    ).toMatchObject({ status: "cancelled" });
    expect(
      describeThing(
        ev(38000, [
          ["market", "x"],
          ["outcome", "YES"],
          ["outcome", "NO"],
        ]),
      ),
    ).toBeNull();
  });
});

describe("describeThing — ballots", () => {
  it("reads each ballot shape's answers: `responses`, a `ballot` object, a lone `vote_choice`", () => {
    const responses = describeThing(
      ev(
        38000,
        [["election", "sec06-feedback"]],
        JSON.stringify({
          election_id: "sec06-feedback",
          responses: [
            { question_id: "q1", value: "Yes" },
            { question_id: "q3", value: 5 },
            { question_id: "q4", value: { nested: true } },
          ],
        }),
      ),
    );
    expect(responses).toMatchObject({
      title: "Ballot in sec06-feedback",
      facts: ["Ballot", "2 answers"],
      detail: {
        type: "ballot",
        election: "sec06-feedback",
        answers: [
          { question: "q1", answer: "Yes" },
          { question: "q3", answer: "5" },
        ],
        proofHash: null,
      },
    });
    const ballot = describeThing(
      ev(
        38000,
        [
          ["election", "spring-2026-council"],
          ["proof_hash", "bb64"],
          ["mint", "http://localhost:8787/mock-mint"],
        ],
        JSON.stringify({ election_id: "spring-2026-council", ballot: { funding_priority: "community-grants" } }),
      ),
    );
    expect(ballot?.detail).toMatchObject({
      answers: [{ question: "funding_priority", answer: "community-grants" }],
      proofHash: "bb64",
    });
    const choice = describeThing(ev(38000, [["election", "e1"]], JSON.stringify({ vote_choice: "B" })));
    expect(choice?.detail).toMatchObject({ answers: [{ question: "Vote", answer: "B" }] });
  });
});

describe("marketStatus — the rules Amethyst keeps too", () => {
  const now = 1_790_000_000_000;
  const none = { resolution: null, cancelled: false, closes: null };
  it("keeps a declared resolved or cancelled, whatever else the market says", () => {
    expect(marketStatus("resolved", { ...none, closes: 1 }, now)).toBe("resolved");
    expect(marketStatus("voided", { ...none, resolution: "YES" }, now)).toBe("cancelled");
  });
  it("lets a resolution settle an open or unmarked market, and a cancel reason cancel an unmarked one", () => {
    expect(marketStatus("active", { ...none, resolution: "NO" }, now)).toBe("resolved");
    expect(marketStatus(undefined, { ...none, resolution: "NO" }, now)).toBe("resolved");
    expect(marketStatus(undefined, { ...none, cancelled: true }, now)).toBe("cancelled");
    expect(marketStatus("active", { ...none, cancelled: true }, now)).toBe("open");
  });
  it("closes an 'active' market whose betting has ended — BAO leaves the word in place", () => {
    expect(marketStatus("active", { ...none, closes: 1_780_000_000 }, now)).toBe("closed");
    expect(marketStatus("active", { ...none, closes: 1_800_000_000 }, now)).toBe("open");
    expect(marketStatus(undefined, { ...none, closes: 1_800_000_000 }, now)).toBe("open");
    expect(marketStatus("resolving", { ...none, closes: 1_800_000_000 }, now)).toBe("closed");
    expect(marketStatus("active", none, now)).toBe("open");
    expect(marketStatus(undefined, none, now)).toBeNull();
  });
});
