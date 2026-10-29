// @vitest-environment jsdom
/**
 * The event pages for the kinds lib/thing reads — each hero says what the
 * thing is, each section asks the network for what surrounds it. Shapes as
 * staging holds them (probed 2026-09-29).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));
const profileMapMock = vi.fn((_pks: string[]) => Promise.resolve(new Map<string, Record<string, unknown>>()));
// Open Markets: what a review, a collection or a listing names by address, and a seller's listings filed under a collection.
const addressedMock = vi.fn((_coords: { kind: number; pubkey: string; identifier: string }[]) =>
  Promise.resolve(new Map<string, NostrEvent>()),
);
const collectionProductsMock = vi.fn((_pubkey: string, _address: string) => Promise.resolve([] as NostrEvent[]));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: (c: { kind: number; pubkey: string; identifier: string }[]) => addressedMock(c),
  fetchCollectionProducts: (pk: string, a: string) => collectionProductsMock(pk, a),
  fetchProfileMap: (pks: string[]) => profileMapMock(pks),
  refreshProfileEvent: async (pk: string) => {
    const content = (await profileMapMock([pk])).get(pk);
    return content
      ? { id: "f".repeat(64), kind: 0, pubkey: pk, created_at: 1, tags: [], content: JSON.stringify(content), sig: "" }
      : null;
  },
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: {
    ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
    getReplaceable: () => undefined,
    getEvent: () => undefined,
    add: (e: NostrEvent) => e,
  },
}));
const fromSearchMock = vi.fn((_filters: Record<string, unknown>[], _opts?: unknown) =>
  Promise.resolve([] as NostrEvent[]),
);
const byAddressMock = vi.fn((_coords: string[]) => Promise.resolve(new Map<string, NostrEvent>()));
vi.mock("@/services/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/search")>();
  return {
    ...actual,
    fetchFromSearch: (f: Record<string, unknown>[], o?: unknown) => fromSearchMock(f, o),
    fetchByAddress: (c: string[]) => byAddressMock(c),
  };
});
// The event card's RSVP button signs as the Active Account — not what these pages test.
vi.mock("@/components/share/RsvpButton", () => ({ RsvpButton: () => null }));
vi.mock("@/components/ZapModal", () => ({
  ZapModal: (p: { open: boolean; onOpenChange: (o: boolean) => void; target?: { eventId?: string } }) =>
    p.open ? (
      <div data-testid="zap-modal">
        zapping {p.target?.eventId}
        <button type="button" onClick={() => p.onOpenChange(false)}>
          close
        </button>
      </div>
    ) : null,
}));

import { ThingHero, ThingSections, hasThingPage } from "./index";
import { __resetThingPageCache, fetchOnce, readablePost } from "./shared";

const who = "7".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][], content = "", pubkey = who): NostrEvent =>
  ({
    id: `${"0".repeat(60)}${String(++n).padStart(4, "0")}`,
    kind,
    pubkey,
    tags,
    content,
    created_at: 1_790_000_000,
    sig: "s",
  }) as NostrEvent;
const page = (event: NostrEvent) =>
  render(
    <>
      <ThingHero event={event} />
      <ThingSections event={event} />
    </>,
  );

beforeEach(() => {
  __resetThingPageCache();
  vi.clearAllMocks();
  fromSearchMock.mockResolvedValue([]);
  byAddressMock.mockResolvedValue(new Map());
  profileMapMock.mockResolvedValue(new Map());
  addressedMock.mockResolvedValue(new Map());
  collectionProductsMock.mockResolvedValue([]);
});

describe("hasThingPage", () => {
  it("is every kind lib/thing can name, and nothing else", () => {
    expect(
      hasThingPage(
        ev(30009, [
          ["d", "b"],
          ["name", "Badge"],
        ]),
      ),
    ).toBe(true);
    expect(hasThingPage(ev(30017, [], '{"wpm":63}'))).toBe(false);
    expect(hasThingPage(ev(1, [], "hello"))).toBe(false);
  });
});

describe("Community pages", () => {
  it("a relay group lists its members and its messages (by the group id in `h`)", async () => {
    const group = ev(39000, [["d", "g1"], ["name", "nutshell"], ["closed"]]);
    const member = "a".repeat(64);
    fromSearchMock.mockImplementation((filters) =>
      Promise.resolve(
        filters.some((f) => (f.kinds as number[]).includes(39002))
          ? [
              ev(39002, [
                ["d", "g1"],
                ["p", member],
              ]),
            ]
          : [ev(9, [["h", "g1"]], "hello https://x.test/a.png world")],
      ),
    );
    page(group);
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("nutshell");
    expect(screen.getByTestId("thing-page-community")).toHaveTextContent("Closed");
    expect(await screen.findByTestId("thing-page-members")).toBeInTheDocument();
    const posts = await screen.findByTestId("thing-page-posts");
    await waitFor(() => expect(posts).toHaveTextContent("hello world"));
    expect(posts).not.toHaveTextContent("https://");
    expect(fromSearchMock).toHaveBeenCalledWith([{ kinds: [9, 11, 1111], "#h": ["g1"] }], expect.anything());
    // The roster is the group relay's own list, never a stranger's 39002 with the same id.
    expect(fromSearchMock).toHaveBeenCalledWith([{ kinds: [39002], authors: [who], "#d": ["g1"] }], expect.anything());
  });

  it("a NIP-72 community leaves its posts to the page's comment thread", async () => {
    page(
      ev(34550, [
        ["d", "k"],
        ["name", "Kiteh"],
        ["p", "b".repeat(64)],
      ]),
    );
    expect(await screen.findByTestId("thing-page-moderators")).toBeInTheDocument();
    expect(screen.queryByTestId("thing-page-posts")).toBeNull();
  });
});

describe("Fundraiser page", () => {
  const receipt = (sats: number, zapper: string, memo = "") =>
    ev(
      9735,
      [
        ["P", zapper],
        ["bolt11", `lnbc${sats * 10}n1pjx`],
      ],
      memo,
      "e".repeat(64),
    );

  it("counts what the goal's zaps raised, lists them, and zaps the goal itself", async () => {
    const goal = ev(9041, [["amount", "10000000"]], "Fiatjaf Protection Fees");
    fromSearchMock.mockResolvedValue([receipt(1000, "a".repeat(64), "GM"), receipt(56, "b".repeat(64))]);
    profileMapMock.mockResolvedValue(new Map([[who, { name: "Slayer", lud16: "slayer@x.test" }]]));
    page(goal);
    const g = screen.getByTestId("thing-page-goal");
    await waitFor(() => expect(g).toHaveTextContent("1,056"));
    expect(g).toHaveTextContent("sats raised of 10,000");
    expect(g).toHaveTextContent("2 supporters");
    expect(await screen.findByTestId("thing-page-supporters")).toHaveTextContent("GM");
    fireEvent.click(await screen.findByTestId("thing-page-zap"));
    expect(screen.getByTestId("zap-modal")).toHaveTextContent(goal.id);
    expect(fromSearchMock).toHaveBeenCalledWith([{ kinds: [9735], "#e": [goal.id] }], expect.anything());
  });

  it("leaves out zaps after the goal closed, and offers no zap button once it has", async () => {
    const goal = ev(
      9041,
      [
        ["amount", "10000000"],
        ["closed_at", "1790000000"],
      ],
      "Closed goal",
    );
    const late = { ...receipt(500, "c".repeat(64)), created_at: 1_790_000_001 };
    fromSearchMock.mockResolvedValue([receipt(21, "a".repeat(64)), late]);
    profileMapMock.mockResolvedValue(new Map([[who, { name: "Slayer", lud16: "slayer@x.test" }]]));
    page(goal);
    const g = screen.getByTestId("thing-page-goal");
    await waitFor(() => expect(g).toHaveTextContent(/21\s*sats raised/));
    expect(g).toHaveTextContent("1 supporter");
    expect(screen.getByTestId("thing-page-closed")).toBeInTheDocument();
    expect(screen.queryByTestId("thing-page-zap")).toBeNull();
  });

  it("counts again once the zap dialog closes, one ask for hero and list", async () => {
    const goal = ev(9041, [["amount", "10000000"]], "Open goal");
    fromSearchMock.mockResolvedValue([receipt(21, "a".repeat(64))]);
    profileMapMock.mockResolvedValue(new Map([[who, { name: "Slayer", lud16: "slayer@x.test" }]]));
    page(goal);
    await waitFor(() => expect(screen.getByTestId("thing-page-goal")).toHaveTextContent(/21\s*sats raised/));
    const asked = fromSearchMock.mock.calls.length;
    fireEvent.click(await screen.findByTestId("thing-page-zap"));
    fireEvent.click(screen.getByText("close"));
    await waitFor(() => expect(fromSearchMock.mock.calls.length).toBe(asked + 1));
  });

  it("an Agora campaign offers its bitcoin address instead of a bar", () => {
    page(
      ev(
        33863,
        [
          ["d", "bitmoot"],
          ["title", "BitMoot"],
          ["goal", "20000"],
          ["w", "bc1qexample"],
        ],
        "Story",
      ),
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByTestId("thing-page-pay")).toHaveAttribute("href", "bitcoin:bc1qexample");
    expect(screen.getByTestId("thing-page-address")).toHaveTextContent("bc1qexample");
  });
});

describe("Review page", () => {
  it("titles a relay review by its relay, and averages every review of that relay", async () => {
    const mine = ev(
      31987,
      [
        ["d", "wss://nos.lol/"],
        ["rating", "0.8"],
      ],
      "good relay",
    );
    const theirs = ev(
      31987,
      [
        ["d", "wss://nos.lol"],
        ["rating", "0.4"],
      ],
      "slow at night",
      "c".repeat(64),
    );
    fromSearchMock.mockResolvedValue([mine, theirs]);
    page(mine);
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("Review of nos.lol");
    expect(screen.getByTestId("thing-page-stars")).toHaveAttribute("aria-label", "4 out of 5 stars");
    const avg = await screen.findByTestId("thing-page-average");
    expect(avg).toHaveTextContent("3.0");
    expect(avg).toHaveTextContent("2 ratings");
    expect(screen.getByTestId("thing-page-reviews")).toHaveTextContent("slow at night");
    // Both spellings of the relay are the same relay.
    expect(fromSearchMock).toHaveBeenCalledWith(
      [{ kinds: [31987], "#d": ["wss://nos.lol", "wss://nos.lol/"] }],
      expect.anything(),
    );
  });
});

describe("Review page, own review", () => {
  it("counts the page's own review when the search relay doesn't return it", async () => {
    const mine = ev(
      31987,
      [
        ["d", "wss://relay.test"],
        ["rating", "1"],
      ],
      "fast",
    );
    fromSearchMock.mockResolvedValue([
      ev(
        31987,
        [
          ["d", "wss://relay.test"],
          ["rating", "0.6"],
        ],
        "ok",
        "c".repeat(64),
      ),
    ]);
    page(mine);
    const avg = await screen.findByTestId("thing-page-average");
    expect(avg).toHaveTextContent("4.0");
    expect(avg).toHaveTextContent("2 ratings");
  });
});

describe("Kind-38000 pages: prediction market, ballot", () => {
  const market = () =>
    ev(38000, [
      ["d", "59a3"],
      ["market", "59a3"],
      ["c", "bitcoin"],
      ["category", "bitcoin"],
      ["status", "resolved"],
      ["network", "demo"],
      ["end", "1778716800"],
      ["outcome", "YES"],
      ["outcome", "NO"],
      ["resolution", "NO"],
      ["resolution_source", "https://mempool.space/api/v1/blocks"],
      ["min_bet", "100"],
      ["max_bet", "100000"],
      ["fee_percent", "4.21"],
      ["data", JSON.stringify({ title: "Fewer than 140 blocks today?", description: "Target is 144 blocks per day." })],
    ]);

  it("a market states its question, its winner, that it is play money, and its terms", async () => {
    page(market());
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("Fewer than 140 blocks today?");
    expect(screen.getByTestId("thing-page-market")).toHaveTextContent("Resolved");
    expect(screen.getByTestId("thing-page-market")).toHaveTextContent("Demo network — play money");
    expect(within(screen.getByTestId("thing-page-outcomes")).getByText("NO")).toBeInTheDocument();
    const terms = screen.getByTestId("thing-page-terms");
    expect(terms).toHaveTextContent("Resolved asNO");
    expect(terms).toHaveTextContent("100 sats – 100,000 sats");
    expect(terms).toHaveTextContent("4.21%");
    expect(within(terms).getByRole("link")).toHaveAttribute("href", "https://mempool.space/api/v1/blocks");
    await screen.findByText("No other markets in this category.");
    // Its page on BAO Markets, and who can take part there.
    expect(screen.getByTestId("thing-page-bao-link")).toHaveAttribute("href", "https://bao.markets/demo/market/59a3");
    expect(screen.getByTestId("thing-page-bao-link")).toHaveTextContent("View on BAO Markets");
    expect(screen.getByTestId("thing-page-bao-note")).toHaveTextContent("free play sats");
  });

  it("an open market invites a bet", () => {
    page(
      ev(38000, [
        ["d", "op1"],
        ["market", "op1"],
        ["network", "demo"],
        ["status", "active"],
        ["end", "4102444800"],
        ["outcome", "YES"],
        ["outcome", "NO"],
        ["title", "Open question?"],
      ]),
    );
    expect(screen.getAllByTestId("thing-page-bao-link")[0]).toHaveTextContent("Bet on BAO Markets");
  });

  it("lists the creator's other markets in the same category, never the mint reviews on the same kind", async () => {
    const other = ev(38000, [
      ["market", "b"],
      ["c", "bitcoin"],
      ["status", "active"],
      ["outcome", "YES"],
      ["outcome", "NO"],
      ["title", "Will fees spike?"],
    ]);
    const review = ev(
      38000,
      [
        ["u", "https://mint.example"],
        ["c", "bitcoin"],
      ],
      "Good mint",
    );
    fromSearchMock.mockResolvedValue([other, review]);
    const m = market();
    page(m);
    const list = await screen.findByTestId("thing-page-more-markets");
    await waitFor(() => expect(list).toHaveTextContent("Will fees spike?"));
    expect(list).not.toHaveTextContent("Good mint");
    expect(fromSearchMock).toHaveBeenCalledWith([{ kinds: [38000], authors: [m.pubkey], "#c": ["bitcoin"] }], {
      limit: 30,
    });
  });

  it("a ballot shows its election and each answer", () => {
    page(
      ev(
        38000,
        [["election", "sec06-feedback"]],
        JSON.stringify({
          responses: [
            { question_id: "q1", value: "Yes" },
            { question_id: "q2", value: "Sauna talks" },
          ],
        }),
      ),
    );
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("Ballot in sec06-feedback");
    const answers = screen.getByTestId("thing-page-answers");
    expect(answers).toHaveTextContent("q1Yes");
    expect(answers).toHaveTextContent("q2Sauna talks");
  });
});

describe("Calendar page", () => {
  it("lists its events under the day they fall on, upcoming first, past behind a door", async () => {
    const soon = Math.floor(Date.now() / 1000) + 86_400 * 3;
    const upcoming = ev(
      31923,
      [
        ["d", "u"],
        ["title", "Bitcoin Beer"],
        ["start", String(soon)],
      ],
      "",
      "d".repeat(64),
    );
    const past = ev(
      31923,
      [
        ["d", "p"],
        ["title", "Old meetup"],
        ["start", "1700000000"],
        ["end", "1700003600"],
      ],
      "",
      "d".repeat(64),
    );
    byAddressMock.mockResolvedValue(
      new Map([
        [`31923:${"d".repeat(64)}:u`, upcoming],
        [`31923:${"d".repeat(64)}:p`, past],
      ]),
    );
    const cal = ev(31924, [
      ["d", "brno"],
      ["title", "Jednadvacet Brno"],
      ["a", `31923:${"d".repeat(64)}:u`],
      ["a", `31923:${"d".repeat(64)}:p`],
    ]);
    page(cal);
    const up = await screen.findByTestId("thing-page-upcoming");
    await waitFor(() => expect(up).toHaveTextContent("Bitcoin Beer"));
    const day = new Date(soon * 1000).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    expect(up).toHaveTextContent(day);
    const pastSection = screen.getByTestId("thing-page-past");
    expect(pastSection).not.toHaveTextContent("Old meetup");
    fireEvent.click(within(pastSection).getByText("Show"));
    expect(pastSection).toHaveTextContent("Old meetup");
  });
});

describe("Badge, emoji, playlist pages", () => {
  it("a badge lists who has been awarded it", async () => {
    const badge = ev(30009, [
      ["d", "ice"],
      ["name", "Ice Cool Builder"],
    ]);
    fromSearchMock.mockResolvedValue([
      ev(8, [
        ["a", `30009:${who}:ice`],
        ["p", "a".repeat(64)],
        ["p", "b".repeat(64)],
      ]),
    ]);
    page(badge);
    expect(await screen.findByTestId("thing-page-awardees")).toHaveTextContent("2");
    // Only the issuer's awards count: anyone else's is a forgery.
    expect(fromSearchMock).toHaveBeenCalledWith(
      [{ kinds: [8], authors: [who], "#a": [`30009:${who}:ice`] }],
      expect.anything(),
    );
  });

  it("an emoji pack shows every emoji with its shortcode", () => {
    page(
      ev(30030, [
        ["d", "p"],
        ["title", "Legends"],
        ["emoji", "gm", "https://x.test/gm.png"],
        ["emoji", "gn", "https://x.test/gn.png"],
      ]),
    );
    const grid = screen.getByTestId("thing-page-emoji-grid");
    expect(grid).toHaveTextContent("gm");
    expect(grid).toHaveTextContent("gn");
  });

  it("a playlist plays its tracks in its own order", async () => {
    const t = (d: string, title: string) =>
      ev(
        36787,
        [
          ["d", d],
          ["title", title],
          ["url", `https://x.test/${d}.mp3`],
        ],
        "",
        "a".repeat(64),
      );
    const one = t("1", "First");
    const two = t("2", "Second");
    byAddressMock.mockResolvedValue(
      new Map([
        [`36787:${"a".repeat(64)}:2`, two],
        [`36787:${"a".repeat(64)}:1`, one],
      ]),
    );
    page(
      ev(34139, [
        ["d", "ep"],
        ["title", "FAKE LOVE"],
        ["a", `36787:${"a".repeat(64)}:1`],
        ["a", `36787:${"a".repeat(64)}:2`],
      ]),
    );
    const tracks = await screen.findByTestId("thing-page-tracks");
    await waitFor(() => expect(tracks).toHaveTextContent("First"));
    expect(tracks.textContent!.indexOf("First")).toBeLessThan(tracks.textContent!.indexOf("Second"));
  });

  it("a track listed twice plays twice; none found says so", async () => {
    const pk = "a".repeat(64);
    const one = ev(
      36787,
      [
        ["d", "1"],
        ["title", "Loop"],
        ["url", "https://x.test/1.mp3"],
      ],
      "",
      pk,
    );
    byAddressMock.mockResolvedValue(new Map([[`36787:${pk}:1`, one]]));
    page(
      ev(34139, [
        ["d", "rep"],
        ["title", "Repeat"],
        ["a", `36787:${pk}:1`],
        ["a", `36787:${pk.toUpperCase()}:1`],
      ]),
    );
    const tracks = await screen.findByTestId("thing-page-tracks");
    await waitFor(() => expect(tracks.textContent!.split("Loop").length - 1).toBe(2));

    byAddressMock.mockResolvedValue(new Map());
    page(
      ev(34139, [
        ["d", "gone"],
        ["title", "Gone"],
        ["a", `36787:${pk}:9`],
      ]),
    );
    expect(await screen.findByText("None of these tracks are on the search relay yet.")).toBeInTheDocument();
  });
});

describe("fetchOnce", () => {
  it("asks once while fresh, and forgets a failed ask", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(7);
    await expect(fetchOnce("k", load)).rejects.toThrow("down");
    await Promise.resolve();
    expect(await fetchOnce("k", load)).toBe(7);
    expect(await fetchOnce("k", load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("App, learning and torrent pages", () => {
  it("a handler lists every kind it opens, DVM jobs by name, each a search for that kind", () => {
    page(
      ev(
        31990,
        [
          ["d", "x"],
          ["k", "5300"],
          ["k", "30023"],
        ],
        JSON.stringify({ name: "BlindOracle", website: "https://blind.test" }),
      ),
    );
    const kinds = screen.getByTestId("thing-page-kinds");
    expect(kinds).toHaveTextContent("DVM job · 5300");
    expect(kinds).toHaveTextContent("Article · 30023");
    expect(within(kinds).getAllByRole("link")[0]).toHaveAttribute("href", "/?q=kind%3A5300");
    expect(screen.getByTestId("thing-page-open")).toHaveAttribute("href", "https://blind.test");
  });

  it("a learning resource opens the resource and states its facts", () => {
    page(
      ev(30142, [
        ["d", "https://edu.test/lesson"],
        ["name", "Schatzsuche"],
        ["inLanguage", "en"],
        ["license:id", "https://creativecommons.org/licenses/by-sa/4.0/"],
        ["isAccessibleForFree", "true"],
      ]),
    );
    expect(screen.getByTestId("thing-page-open")).toHaveAttribute("href", "https://edu.test/lesson");
    const facts = screen.getByTestId("thing-page-facts");
    expect(facts).toHaveTextContent("CC BY-SA 4.0");
    expect(facts).toHaveTextContent("Free to use");
  });

  it("a torrent opens by magnet and folds a long file list", () => {
    const files = Array.from({ length: 60 }, (_, i) => ["file", `track${i}.flac`, "1000"]);
    page(ev(2003, [["title", "Album"], ["x", "f".repeat(40)], ...files]));
    expect(screen.getByTestId("thing-page-magnet").getAttribute("href")).toMatch(/^magnet:\?xt=urn:btih:f{40}/);
    const list = screen.getByTestId("thing-page-files");
    expect(list.querySelectorAll("li")).toHaveLength(50);
    fireEvent.click(within(list).getByText("Show all 60 files"));
    expect(list.querySelectorAll("li")).toHaveLength(60);
  });
});

describe("readablePost", () => {
  it("keeps the words, drops the links, and keeps the first picture", () => {
    expect(readablePost("look https://x.test/a.png and https://x.test/page")).toEqual({
      text: "look and",
      image: "https://x.test/a.png",
    });
  });
});

describe("Open Markets pages", () => {
  const seller = "c".repeat(64);
  const product = (d: string, title: string, extra: string[][] = []) =>
    ev(30402, [["d", d], ["title", title], ["price", "30", "USD"], ...extra], "", seller);
  const keyed = (...events: NostrEvent[]) =>
    new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

  it("a product review shows the product it reviews, the thumb, the score, each category, and every review of it", async () => {
    const plate = product("om-plate-1", "Seed plate");
    addressedMock.mockResolvedValue(keyed(plate));
    const review = ev(
      31555,
      [
        ["d", `a:30402:${seller}:om-plate-1`],
        ["rating", "1", "thumb"],
        ["rating", "0.8", "value"],
        ["rating", "0.6", "delivery"],
      ],
      "Arrived early, well packed.",
    );
    page(review);
    expect(await screen.findByTestId(`listing-card-${plate.id}`)).toBeInTheDocument();
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("Review of Seed plate");
    expect(screen.getByTestId("thing-page-thumb")).toHaveTextContent("Recommends");
    // (1 × 0.5 + 0.5 × 0.7) × 5
    expect(screen.getByTestId("thing-page-score")).toHaveTextContent("4.3");
    expect(screen.getByTestId("thing-page-aspects")).toHaveTextContent("Value");
    expect(screen.getByTestId("thing-page-aspects")).toHaveTextContent("Delivery");
    expect(screen.getByTestId("thing-page-description")).toHaveTextContent("Arrived early");
    await waitFor(() =>
      // Both spellings of the product, so a review written bare (`30402:…`) is found too.
      expect(fromSearchMock).toHaveBeenCalledWith(
        [{ kinds: [31555], "#d": [`a:30402:${seller}:om-plate-1`, `30402:${seller}:om-plate-1`] }],
        {
          limit: 200,
        },
      ),
    );
  });

  it("a thumbs-down review says so, and a product not found says that instead of a raw address", async () => {
    const review = ev(31555, [
      ["d", `a:30402:${seller}:om-gone-1`],
      ["rating", "0", "thumb"],
    ]);
    page(review);
    expect(screen.getByTestId("thing-page-thumb")).toHaveTextContent("Doesn't recommend");
    expect(await screen.findByText(/isn't on the relays we asked/)).toBeInTheDocument();
    expect(screen.getByTestId("thing-page-product")).not.toHaveTextContent(seller);
  });

  it("a collection lists what is for sale in it: the products it names and the ones filed under it", async () => {
    const named = product("om-krux-1", "Krux Amigo");
    const filed = product("om-tzt-1", "TZT Krux", [["a", `30405:${seller}:om-wallets-1`]]);
    const sold = product("om-old-1", "Old wallet", [
      ["a", `30405:${seller}:om-wallets-1`],
      ["status", "sold"],
    ]);
    // Unlisted is not off sale: Conduit sells its event-only products, every
    // one `visibility: hidden`, through the event's collection.
    const unlisted = product("om-event-1", "Event-only wallet", [
      ["a", `30405:${seller}:om-wallets-1`],
      ["visibility", "hidden"],
    ]);
    addressedMock.mockResolvedValue(keyed(named));
    collectionProductsMock.mockResolvedValue([filed, sold, unlisted]);
    const collection = ev(
      30405,
      [
        ["d", "om-wallets-1"],
        ["title", "Krux DIY Wallets"],
        ["summary", "Ready to use"],
        ["a", `30402:${seller}:om-krux-1`],
      ],
      "Open-source firmware on off-the-shelf hardware.",
      seller,
    );
    page(collection);
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("Krux DIY Wallets");
    expect(screen.getByTestId("thing-page-summary")).toHaveTextContent("Ready to use");
    expect(screen.getByTestId("thing-page-description")).toHaveTextContent("Open-source firmware");
    const products = screen.getByTestId("thing-page-products");
    expect(await within(products).findByTestId(`listing-card-${named.id}`)).toBeInTheDocument();
    expect(await within(products).findByTestId(`listing-card-${filed.id}`)).toBeInTheDocument();
    expect(await within(products).findByTestId(`listing-card-${unlisted.id}`)).toBeInTheDocument();
    expect(within(products).queryByTestId(`listing-card-${sold.id}`)).toBeNull();
    expect(collectionProductsMock).toHaveBeenCalledWith(seller, `30405:${seller}:om-wallets-1`);
  });

  it("a listing the seller has since sold stays sold, though a lagging relay still serves it on sale", async () => {
    const inIt = ["a", `30405:${seller}:om-wallets-1`];
    const kept = product("om-tzt-1", "TZT Krux", [inIt]);
    const onSale = { ...product("om-jade-1", "Jade", [inIt]), created_at: 1_790_000_000 };
    const hiddenSince = {
      ...product("om-jade-1", "Jade", [inIt, ["status", "sold"]]),
      created_at: 1_790_000_100,
    };
    collectionProductsMock.mockResolvedValue([onSale, hiddenSince, kept]);
    page(
      ev(
        30405,
        [
          ["d", "om-wallets-1"],
          ["title", "Krux DIY Wallets"],
        ],
        "",
        seller,
      ),
    );
    const products = screen.getByTestId("thing-page-products");
    expect(await within(products).findByTestId(`listing-card-${kept.id}`)).toBeInTheDocument();
    expect(within(products).queryByTestId(`listing-card-${onSale.id}`)).toBeNull();
    expect(within(products).queryByTestId(`listing-card-${hiddenSince.id}`)).toBeNull();
  });

  it("a collection shows another seller's product only when the product files itself under it", async () => {
    // An event market: the collection names vendors' products, and each vendor's
    // product names the market back. A collection cannot claim a stranger's listing.
    const vendor = "e".repeat(64);
    const market = `30405:${seller}:om-market-1`;
    const consenting = ev(
      30402,
      [
        ["d", "jar"],
        ["title", "Body butter"],
        ["price", "17", "USD"],
        ["a", market],
      ],
      "",
      vendor,
    );
    const claimed = ev(
      30402,
      [
        ["d", "mug"],
        ["title", "Someone else's mug"],
        ["price", "9", "USD"],
      ],
      "",
      vendor,
    );
    addressedMock.mockResolvedValue(keyed(consenting, claimed));
    collectionProductsMock.mockResolvedValue([]);
    page(
      ev(
        30405,
        [
          ["d", "om-market-1"],
          ["title", "Summit market"],
          ["a", `30402:${vendor}:jar`],
          ["a", `30402:${vendor}:mug`],
        ],
        "",
        seller,
      ),
    );
    const products = screen.getByTestId("thing-page-products");
    const card = await within(products).findByTestId(`listing-card-${consenting.id}`);
    expect(card).toBeInTheDocument();
    expect(within(products).queryByTestId(`listing-card-${claimed.id}`)).toBeNull();
  });

  it("a collection's own shipping options are priced without a product's extra cost", async () => {
    addressedMock.mockResolvedValue(
      keyed(
        ev(
          30406,
          [
            ["d", "std"],
            ["title", "Standard"],
            ["price", "10", "USD"],
            ["service", "standard"],
          ],
          "",
          seller,
        ),
      ),
    );
    collectionProductsMock.mockResolvedValue([]);
    page(
      ev(
        30405,
        [
          ["d", "om-wallets-2"],
          ["title", "Wallets"],
          ["shipping_option", `30406:${seller}:std`, "5"],
        ],
        "",
        seller,
      ),
    );
    expect(await screen.findByText("$10")).toBeInTheDocument();
    expect(screen.queryByText("$15")).toBeNull();
  });

  it("a big collection's lookups go out two chunks at a time, and stop at 200 products", async () => {
    let inflight = 0;
    let peak = 0;
    addressedMock.mockImplementation(async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return new Map();
    });
    collectionProductsMock.mockResolvedValue([]);
    page(
      ev(
        30405,
        [
          ["d", "om-huge-1"],
          ["title", "Everything"],
          ...Array.from({ length: 1000 }, (_, i) => ["a", `30402:${seller}:p${i}`]),
        ],
        "",
        seller,
      ),
    );
    await waitFor(() => expect(addressedMock).toHaveBeenCalledTimes(2));
    const asked = addressedMock.mock.calls.flatMap(([coords]) => coords);
    expect(asked).toHaveLength(200);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("a shipping option states its price and delivery facts", () => {
    page(
      ev(30406, [
        ["d", "om-pickup-1"],
        ["title", "Downtown Store Pickup"],
        ["price", "0", "USD"],
        ["country", "US"],
        ["region", "US-FL"],
        ["service", "pickup"],
        ["location", "123 Main St, Downtown, FL"],
      ]),
    );
    expect(screen.getByTestId("thing-page-title")).toHaveTextContent("Downtown Store Pickup");
    expect(screen.getByTestId("thing-page-price")).toHaveTextContent("Free");
    const facts = screen.getByTestId("thing-page-shipping-facts");
    expect(facts).toHaveTextContent("Pickup");
    expect(facts).toHaveTextContent("US-FL");
    expect(facts).toHaveTextContent("123 Main St");
  });
});
