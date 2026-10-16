// @vitest-environment jsdom
/**
 * The cards for the kinds lib/thing reads — each drawn for what it is, from
 * shapes as staging holds them (probed 2026-09-29).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { nip19, type NostrEvent } from "nostr-tools";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));
const addressedMock = vi.fn((_coords: unknown[]) => Promise.resolve(new Map<string, NostrEvent>()));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
  fetchAddressableEvents: (coords: unknown[]) => addressedMock(coords),
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: {
    ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
    getReplaceable: () => undefined,
    getEvent: () => undefined,
    add: (e: NostrEvent) => e,
  },
}));

import { ThingCard, magnetOf } from "./thingCards";
import { EmbeddedKindCard } from "@/components/share/EmbeddedKindCard";
import { __resetAddressedBatch } from "@/hooks/useAddressedEvents";
import { describeThing } from "@/lib/thing";

const who = "7".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][], content = ""): NostrEvent =>
  ({ id: `e${++n}`, kind, pubkey: who, tags, content, created_at: 1_790_000_000, sig: "s" }) as NostrEvent;
const card = (event: NostrEvent, progress?: { sats: number; zappers: string[] }) =>
  render(<ThingCard event={event} author={null} score={null} progress={progress} />);

describe("FundraiserCard", () => {
  const goal = () =>
    ev(
      9041,
      [
        ["amount", "10000000"],
        ["summary", "Keep the lights on"],
        ["link", "https://fund.test/about"],
      ],
      "Fiatjaf Protection Fees",
    );

  it("a zap goal shows what its zaps raised, as a bar and in sats", () => {
    const e = goal();
    card(e, { sats: 1056, zappers: ["a".repeat(64), "b".repeat(64)] });
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "11");
    expect(screen.getByTestId(`thing-goal-${e.id}`)).toHaveTextContent("1,056 sats of 10k");
    expect(screen.getByTestId(`thing-goal-${e.id}`)).toHaveTextContent("10%");
    expect(screen.getByTestId(`thing-zappers-${e.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`thing-link-${e.id}`)).toHaveAttribute("href", "https://fund.test/about");
  });

  it("a zap goal nobody has zapped yet says so; one past its goal says how far past", () => {
    const e = goal();
    const { unmount } = card(e, { sats: 0, zappers: [] });
    expect(screen.getByTestId(`thing-goal-${e.id}`)).toHaveTextContent("0 sats of 10k");
    // Nothing raised draws no sliver of progress.
    expect((screen.getByRole("progressbar").firstElementChild as HTMLElement).style.width).toBe("0%");
    unmount();
    const over = ev(9041, [["amount", "69000"]], "Chinese Girlfriend");
    card(over, { sats: 210, zappers: [] });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByTestId(`thing-goal-${over.id}`)).toHaveTextContent("304%");
  });

  it("an Agora campaign states its goal and claims no progress it cannot see", () => {
    const e = ev(
      33863,
      [
        ["d", "bitmoot"],
        ["title", "BitMoot"],
        ["goal", "20000"],
      ],
      "An open-source platform",
    );
    card(e);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByTestId(`thing-goal-${e.id}`)).toHaveTextContent("Goal 20,000 sats");
    expect(screen.getByTestId(`thing-goal-${e.id}`)).toHaveTextContent("Raised on-chain");
  });

  it("a goal of one sat is one sat", () => {
    const e = ev(9041, [["amount", "1000"]], "test another goal");
    card(e);
    expect(screen.getByTestId(`thing-goal-${e.id}`)).toHaveTextContent("Goal 1 sat");
  });
});

describe("CommunityCard", () => {
  it("a NIP-72 community shows its moderators as faces, and rules that say something new", () => {
    const e = ev(34550, [
      ["d", "k"],
      ["name", "Kiteh Kawasaki"],
      ["description", "Hi fans"],
      ["guidelines", "Be Kind, Rewind"],
      ["p", "a".repeat(64), ""],
    ]);
    card(e);
    expect(screen.getByTestId(`thing-card-${e.id}`)).toHaveTextContent("Be Kind, Rewind");
    expect(screen.getByTestId(`thing-moderators-${e.id}`)).toBeInTheDocument();
  });

  it("rules that only repeat the description are not said twice", () => {
    const e = ev(34550, [
      ["d", "k"],
      ["name", "Conservador"],
      ["description", "Em teste"],
      ["rules", "Em teste"],
    ]);
    card(e);
    expect(screen.getAllByText("Em teste")).toHaveLength(1);
  });

  it("a NIP-29 group says whether anyone may join", () => {
    const e = ev(39000, [["d", "x"], ["name", "nutshell"], ["closed"], ["private"]]);
    card(e);
    const c = screen.getByTestId(`thing-card-${e.id}`);
    expect(c).toHaveTextContent("Relay group");
    expect(c).toHaveTextContent("Closed");
    expect(c).toHaveTextContent("Private");
  });
});

describe("ReviewCard", () => {
  it("a relay review: the host, the score, the words, and each aspect scored", () => {
    const e = ev(
      31987,
      [
        ["d", "wss://relay.nostrcheck.me/"],
        ["rating", "0.8"],
        ["rating", "0.4", "speed"],
      ],
      "maybe a bit slow",
    );
    card(e);
    expect(screen.getByTestId(`thing-title-${e.id}`)).toHaveTextContent("relay.nostrcheck.me");
    expect(screen.getByTestId(`thing-stars-${e.id}`)).toHaveAttribute("aria-label", "4 out of 5 stars");
    const c = screen.getByTestId(`thing-card-${e.id}`);
    expect(c).toHaveTextContent("4.0");
    expect(c).toHaveTextContent("Speed 2/5");
    expect(c).toHaveTextContent("Reviewed by");
  });
});

describe("ShopPlaceCard", () => {
  it("a stall says its currency and where it ships, as a buyer reads it", () => {
    const online = ev(
      30017,
      [["d", "s"]],
      JSON.stringify({ name: "BKBoom", currency: "sat", shipping: [{ id: "online", name: "Online", cost: 0 }] }),
    );
    const { unmount } = card(online);
    expect(screen.getByTestId(`thing-card-${online.id}`)).toHaveTextContent("Prices in SAT · Digital delivery");
    unmount();
    const world = ev(
      30017,
      [["d", "w"]],
      JSON.stringify({ name: "Mugs", shipping: [{ id: "w", regions: ["Worldwide"] }] }),
    );
    card(world);
    expect(screen.getByTestId(`thing-card-${world.id}`)).toHaveTextContent("Ships worldwide");
  });
});

describe("AppThingCard", () => {
  it("a handler's kinds read as words, every DVM job as one", () => {
    const e = ev(
      31990,
      [
        ["d", "x"],
        ["k", "5300"],
        ["k", "5301"],
        ["k", "30078"],
      ],
      JSON.stringify({ name: "BlindOracle", about: "Agent services" }),
    );
    card(e);
    const chips = screen.getByTestId(`thing-chips-${e.id}`);
    expect(chips).toHaveTextContent("DVM jobs");
    expect(chips).toHaveTextContent("App data");
    expect(within(chips).getAllByText("DVM jobs")).toHaveLength(1);
  });

  it("a root Nostr site opens at its author's npub; a named site is not guessed at", () => {
    const root = ev(15128, [["path", "/index.html", "x"]]);
    const { unmount } = card(root);
    expect(screen.getByTestId(`thing-link-${root.id}`)).toHaveAttribute(
      "href",
      `https://${nip19.npubEncode(who)}.nsite.lol`,
    );
    unmount();
    const named = ev(35128, [
      ["d", "gitworkshop"],
      ["path", "/index.html", "x"],
    ]);
    card(named);
    expect(screen.queryByTestId(`thing-link-${named.id}`)).toBeNull();
  });
});

describe("BadgeCard", () => {
  it("shows the artwork alone — the stand-in icon is only for a missing or broken picture", () => {
    const e = ev(30009, [
      ["d", "ice"],
      ["name", "Ice Cool Builder"],
      ["image", "https://x.test/badge.png"],
    ]);
    card(e);
    const img = screen.getByTestId(`thing-image-${e.id}`);
    const tile = img.parentElement as HTMLElement;
    expect(tile.querySelector("svg")).toBeNull();
    fireEvent.error(img);
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.querySelector("svg")).not.toBeNull();
  });
});

describe("EmojiPackCard", () => {
  it("an emoji that will not load says its shortcode instead of leaving a hole", () => {
    const e = ev(30030, [
      ["d", "p"],
      ["title", "Memes br"],
      ["emoji", "kkk", "https://x.test/kkk.png"],
    ]);
    card(e);
    const tray = screen.getByTestId(`thing-previews-${e.id}`);
    fireEvent.error(within(tray).getByAltText(":kkk:"));
    expect(tray).toHaveTextContent(":kkk:");
  });
});

describe("PlaylistCard", () => {
  it("lists the first tracks from its 'artist - title' lines, never a stray URL", () => {
    const e = ev(
      34139,
      [
        ["d", "p"],
        ["title", "FAKE LOVE"],
        ["type", "ep"],
        ["artist", "PASKEVICH"],
        ["a", "36787:x:1"],
      ],
      "# FAKE LOVE\n\nPASKEVICH - жизнь закрутила\nhttps://x.test - link\nPASKEVICH - огонь-вода\n\n3 tracks",
    );
    card(e);
    const tracks = screen.getByTestId(`thing-tracks-${e.id}`);
    expect(tracks.querySelectorAll("li")).toHaveLength(2);
    expect(tracks).not.toHaveTextContent("https://");
    expect(screen.getByTestId(`thing-card-${e.id}`)).toHaveTextContent("EP · 1 track");
  });
});

describe("LearningCard", () => {
  it("shows what a teacher filters by, and opens the resource itself", () => {
    const e = ev(30142, [
      ["d", "https://edu.test/lesson"],
      ["name", "Test Konfi"],
      ["inLanguage", "de"],
      ["isAccessibleForFree", "true"],
      ["license:id", "https://creativecommons.org/licenses/by/4.0/"],
      ["ext:org.x:zielgruppen:prefLabel:de", "11–12 Jahre"],
      ["ext:org.x:stufe:prefLabel:de", "3"],
    ]);
    card(e);
    const c = screen.getByTestId(`thing-card-${e.id}`);
    expect(c).toHaveTextContent("Free");
    expect(c).toHaveTextContent("CC BY 4.0");
    expect(c).toHaveTextContent("11–12 Jahre");
    expect(within(c).queryByText("3")).toBeNull();
    expect(screen.getByTestId(`thing-link-${e.id}`)).toHaveAttribute("href", "https://edu.test/lesson");
  });
});

describe("TorrentCard", () => {
  const torrent = () =>
    ev(2003, [
      ["title", "Frozen [BluRay]"],
      ["x", "F07FDE9021D0B62FD05DC7401927730F8B80ABE3"],
      ["file", "a.url", "124"],
      ["file", "Frozen.avi", "1978173418"],
      ["file", "b.url", "128"],
      ["file", "c.txt", "10"],
      ["tracker", "udp://tracker.test:80/announce"],
    ]);

  it("lists its first files and opens by magnet", () => {
    const e = torrent();
    card(e);
    const files = screen.getByTestId(`thing-files-${e.id}`);
    expect(files).toHaveTextContent("Frozen.avi");
    expect(files).toHaveTextContent("+1 more file");
    expect(screen.getByTestId(`thing-link-${e.id}`).getAttribute("href")).toMatch(
      /^magnet:\?xt=urn:btih:f07fde9021d0b62fd05dc7401927730f8b80abe3&dn=Frozen%20%5BBluRay%5D&tr=udp/,
    );
  });

  it("has no magnet without a v1 info hash", () => {
    const e = ev(2003, [
      ["title", "x"],
      ["x", "not-a-hash"],
    ]);
    const t = describeThing(e)!;
    expect(t.detail.type === "torrent" && magnetOf(t.title, t.detail)).toBeNull();
  });
});

describe("Open Markets cards", () => {
  const seller = "c".repeat(64);

  it("a product review leads with the thumb, scores the product, quotes the words — and names the product", async () => {
    const plate = ev(30402, [
      ["d", "card-plate-1"],
      ["title", "Seed plate"],
      ["price", "30", "USD"],
      ["image", "https://img/plate.jpg"],
    ]);
    addressedMock.mockResolvedValueOnce(new Map([[`30402:${who}:card-plate-1`, plate]]));
    const e = ev(
      31555,
      [
        ["d", `a:30402:${who}:card-plate-1`],
        ["rating", "1", "thumb"],
        ["rating", "0.5", "value"],
      ],
      "Good, a bit pricey.",
    );
    card(e);
    expect(screen.getByTestId(`thing-thumb-${e.id}`)).toHaveTextContent("Recommends");
    // (1 × 0.5 + 0.5 × 0.5) × 5 = 3.75
    expect(screen.getByTestId(`thing-stars-${e.id}`)).toHaveAttribute("aria-label", "4 out of 5 stars");
    expect(screen.getByTestId(`thing-description-${e.id}`)).toHaveTextContent("Good, a bit pricey.");
    expect(screen.getByTestId(`thing-aspects-${e.id}`)).toHaveTextContent("Value 2.5/5");
    expect(await screen.findByText("Seed plate")).toBeInTheDocument();
    expect(screen.getByTestId(`thing-product-${e.id}`)).toHaveTextContent("$30");
  });

  const productReview = (d: string, author = "d".repeat(64)) =>
    ({
      ...ev(31555, [
        ["d", `a:30402:${seller}:${d}`],
        ["rating", "1", "thumb"],
      ]),
      pubkey: author,
    }) as NostrEvent;

  it("a tab of product reviews asks for all their products in one request, not one per card", async () => {
    __resetAddressedBatch();
    addressedMock.mockClear();
    const plates = Array.from({ length: 30 }, (_, i) =>
      ev(30402, [
        ["d", `plate-${i}`],
        ["title", `Plate ${i}`],
        ["price", "30", "USD"],
      ]),
    ).map((p) => ({ ...p, pubkey: seller }) as NostrEvent);
    addressedMock.mockResolvedValueOnce(new Map(plates.map((p, i) => [`30402:${seller}:plate-${i}`, p])));
    const reviews = plates.map((_, i) => productReview(`plate-${i}`));
    render(
      <>
        {reviews.map((r) => (
          <ThingCard key={r.id} event={r} author={null} score={null} />
        ))}
      </>,
    );
    expect(await screen.findByText("Plate 29")).toBeInTheDocument();
    expect(screen.getByText("Plate 0")).toBeInTheDocument();
    expect(addressedMock).toHaveBeenCalledTimes(1);
    const asked = (addressedMock.mock.calls[0][0] as { identifier: string }[]).map((c) => c.identifier);
    expect(asked.sort()).toEqual(plates.map((_, i) => `plate-${i}`).sort());
  });

  it("a product review inside a quote asks no relay for its product", async () => {
    __resetAddressedBatch();
    addressedMock.mockClear();
    const e = productReview("quoted-plate");
    render(<EmbeddedKindCard event={e} shape="thing" trustScore01={0.5} author={{ name: "Reviewer" }} />);
    expect(screen.getByTestId(`thing-thumb-${e.id}`)).toHaveTextContent("Recommends");
    await new Promise((r) => setTimeout(r, 100));
    expect(addressedMock).not.toHaveBeenCalled();
  });

  it("a collection is shaped like a listing: picture, name, how many products", () => {
    const e = ev(30405, [
      ["d", "w"],
      ["title", "Hardware Wallets"],
      ["summary", "Various Hardware Wallets"],
      ["a", `30402:${seller}:a`],
      ["a", `30402:${seller}:b`],
    ]);
    card(e);
    const c = screen.getByTestId(`thing-card-${e.id}`);
    expect(c).toHaveTextContent("Collection");
    expect(c).toHaveTextContent("Hardware Wallets");
    expect(c).toHaveTextContent("2 products");
    expect(screen.getByTestId(`thing-description-${e.id}`)).toHaveTextContent("Various Hardware Wallets");
  });

  it("a shipping option says its price, service, speed and where it goes", () => {
    const e = ev(30406, [
      ["d", "s"],
      ["title", "Standard Shipping"],
      ["price", "5.99", "USD"],
      ["country", "US", "CA"],
      ["service", "standard"],
      ["duration", "1", "3", "D"],
    ]);
    card(e);
    const c = screen.getByTestId(`thing-card-${e.id}`);
    expect(screen.getByTestId(`thing-price-${e.id}`)).toHaveTextContent("$5.99");
    expect(c).toHaveTextContent("Standard");
    expect(c).toHaveTextContent("1–3 days");
    expect(c).toHaveTextContent("Ships to US, CA");
  });

  it("Shopstr's carts and escrow records on the same kinds draw nothing", () => {
    const cart = ev(30405, [["d", "cart"]], "AgB3…");
    const escrow = ev(30406, [["d", "escrow"]], "{}");
    const { container } = render(
      <>
        <ThingCard event={cart} author={null} />
        <ThingCard event={escrow} author={null} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
