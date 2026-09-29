// @vitest-environment jsdom
/**
 * The cards for the kinds lib/thing reads — each drawn for what it is, from
 * shapes as staging holds them (probed 2026-09-29).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { nip19, type NostrEvent } from "nostr-tools";

vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));
vi.mock("@/services/nostr", () => ({ fetchProfileMap: vi.fn(() => Promise.resolve(new Map())) }));
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: () => undefined, getEvent: () => undefined, add: (e: NostrEvent) => e },
}));

import { ThingCard, magnetOf } from "./thingCards";
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
