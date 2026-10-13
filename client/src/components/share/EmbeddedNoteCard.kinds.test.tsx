// @vitest-environment jsdom
/**
 * A quoted event is drawn as what it is. Before, the quote card showed only
 * the event's `content`: a stream quoted in a note was an empty card, a
 * listing its description, a video its caption with no video, a zap a line of
 * nothing. Each family now gets the card the app already draws it with
 * (lib/embedShape), whether it is quoted by id, linked by address in a note,
 * or named in an article.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

const byAddress = new Map<string, MinimalEvent>();
const byId = new Map<string, MinimalEvent>();
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
    new Map(
      refs.flatMap((r) => {
        const key = `${r.kind}:${r.pubkey}:${r.identifier}`;
        const ev = byAddress.get(key);
        return ev ? [[key, ev]] : [];
      }),
    ),
  fetchEventsByIds: async (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
}));
const repoCounts = vi.hoisted(() =>
  vi.fn(async (_address: string) => ({ issues: 0, patches: 0, contributors: [], lastAt: null })),
);
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchRepoCounts: repoCounts,
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: async () => null }));

import { EmbeddedNoteCard } from "./EmbeddedNoteCard";
import { EmbeddedArticleCard } from "./EmbeddedArticleCard";
import { NostrRef } from "./NostrRef";
import { NoteContent } from "./NoteContent";

const PK = "4".repeat(64);
const MEMBER = "5".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][] = [], content = ""): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey: PK,
  created_at: 1_790_000_000,
  tags,
  content,
});
const quote = (event: MinimalEvent) =>
  renderWithProviders(<EmbeddedNoteCard event={event} author={{ name: "Maker" }} href="/e/x" />);
const naddrOf = (event: MinimalEvent) =>
  nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: event.tags.find((t) => t[0] === "d")?.[1] ?? "",
  });
const held = (event: MinimalEvent) => {
  byAddress.set(`${event.kind}:${event.pubkey}:${event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, event);
  return event;
};

beforeEach(() => {
  byAddress.clear();
  byId.clear();
});

describe("EmbeddedNoteCard — media", () => {
  const video = (tags: string[][] = []) =>
    ev(34235, [
      ["d", "clip"],
      ["title", "Sunset over the bay"],
      ["imeta", "url https://cdn.example/sunset.mp4", "m video/mp4", "image https://cdn.example/sunset.jpg"],
      ...tags,
    ]);

  it("a quoted video plays in place, with its poster, under the quoting card's author line", () => {
    quote(video());
    const card = screen.getByTestId("embedded-note");
    expect(within(card).getByTestId("embedded-video")).toHaveTextContent("Sunset over the bay");
    const player = screen.getByTestId("feed-video-el");
    expect(player.getAttribute("src")).toBe("https://cdn.example/sunset.mp4");
    expect(player.getAttribute("poster")).toBe("https://cdn.example/sunset.jpg");
    expect(card).toHaveTextContent("Maker");
  });

  it("a quoted video its creator marked sensitive is covered — no poster, no file — until asked", () => {
    quote(video([["content-warning", "gore"]]));
    expect(screen.getByTestId("sensitive-cover")).toHaveTextContent("gore");
    expect(screen.queryByTestId("feed-video-el")).toBeNull();
    expect(document.querySelector("img[src*='sunset']")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show video" }));
    expect(screen.getByTestId("feed-video-el").getAttribute("src")).toBe("https://cdn.example/sunset.mp4");
  });

  const pictures = (count: number, tags: string[][] = []) =>
    ev(
      20,
      [
        ...Array.from({ length: count }, (_, i) => ["imeta", `url https://img.example/${i}.jpg`, "m image/jpeg"]),
        ...tags,
      ],
      "Morning walk",
    );

  it("a quoted picture post shows its pictures, four at most, the rest counted", () => {
    quote(pictures(5));
    expect(screen.getByTestId("embedded-pictures")).toHaveTextContent("Morning walk");
    expect(screen.getAllByTestId("embedded-picture")).toHaveLength(4);
    expect(screen.getByTestId("embedded-pictures")).toHaveTextContent("+1");
  });

  it("a picture post marked sensitive loads none of its pictures until one is asked for", () => {
    quote(pictures(2, [["content-warning", "nudity"]]));
    expect(screen.getAllByTestId("embedded-picture-sensitive")).toHaveLength(2);
    expect(screen.queryByTestId("embedded-picture")).toBeNull();
    fireEvent.click(screen.getAllByTestId("embedded-picture-sensitive")[0]);
    expect(screen.getAllByTestId("embedded-picture")).toHaveLength(2);
  });

  it("a quoted voice message is a player, named as what it is", () => {
    quote(ev(1222, [], "https://blossom.example/voice.m4a"));
    expect(screen.getByTestId("embedded-audio")).toBeInTheDocument();
    expect(screen.getByTestId("embedded-kind")).toHaveTextContent("Audio");
    expect(screen.getByTestId("embedded-note")).not.toHaveTextContent("blossom.example");
  });

  it("a quoted track is its track row", () => {
    const track = ev(31337, [
      ["d", "song"],
      ["title", "Blue Hour"],
      ["media", "https://audio.example/blue.mp3"],
    ]);
    quote(track);
    expect(screen.getByTestId("embedded-card")).toHaveAttribute("data-shape", "track");
    expect(screen.getByTestId(`track-card-${track.id}`)).toHaveTextContent("Blue Hour");
    expect(screen.queryByTestId("embedded-note")).toBeNull();
  });
});

describe("EmbeddedNoteCard — things, lists and the rest", () => {
  it("a quoted community is its thing card", () => {
    const community = ev(34550, [
      ["d", "kiteh"],
      ["name", "Kiteh Kawasaki"],
      ["description", "Hi fans"],
    ]);
    quote(community);
    expect(screen.getByTestId("embedded-card")).toHaveAttribute("data-shape", "thing");
    expect(screen.getByTestId(`thing-title-${community.id}`)).toHaveTextContent("Kiteh Kawasaki");
  });

  it("a quoted mint review is a thing card too — every kind-38000 format, not only markets", () => {
    const review = ev(
      38000,
      [
        ["d", "mint"],
        ["k", "38172"],
        ["u", "https://mint.example"],
        ["rating", "5"],
      ],
      "Fast and reliable",
    );
    quote(review);
    expect(screen.getByTestId("embedded-card")).toHaveAttribute("data-shape", "thing");
  });

  it("a quoted follow set is its faces and member count", () => {
    const set = ev(30000, [
      ["d", "devs"],
      ["title", "Nostr devs"],
      ["p", MEMBER],
      ["p", "6".repeat(64)],
    ]);
    quote(set);
    const card = screen.getByTestId(`list-card-${set.id}`);
    expect(card).toHaveTextContent("Nostr devs");
    expect(screen.getByTestId(`list-count-${set.id}`)).toHaveTextContent("2 members");
    expect(screen.getByTestId(`list-members-${set.id}`)).toBeInTheDocument();
  });

  it("a quoted stream is the compact live card", () => {
    const live = ev(30311, [
      ["d", "show"],
      ["title", "Friday night show"],
      ["status", "live"],
    ]);
    quote(live);
    expect(screen.getByTestId(`live-card-${live.id}`)).toHaveTextContent("Friday night show");
  });

  it("a quoted calendar event leads with its date tile, then its title and place", () => {
    const meetup = ev(31923, [
      ["d", "meetup"],
      ["title", "Bitcoin meetup"],
      ["start", "1790000000"],
      ["location", "Lisbon"],
    ]);
    quote(meetup);
    const card = screen.getByTestId(`event-card-${meetup.id}`);
    expect(within(card).getByTestId(`event-date-tile-${meetup.id}`)).toBeInTheDocument();
    expect(card).toHaveTextContent("Bitcoin meetup");
    expect(card).toHaveTextContent("Lisbon");
  });

  // Audit: a quote mounted the RSVP pill (CSS-hidden on phones), which asks the relay for the reader's answer.
  it("a quoted upcoming event has no RSVP pill", () => {
    const soon = ev(31923, [
      ["d", "soon"],
      ["title", "Next meetup"],
      ["start", String(Math.floor(Date.now() / 1000) + 30 * 86400)],
    ]);
    quote(soon);
    const card = screen.getByTestId(`event-card-${soon.id}`);
    expect(card).toHaveTextContent("Next meetup");
    expect(within(card).queryByTestId("card-corner")).toBeNull();
  });

  it("a quoted listing is its shop tile, and a click on it does not also open the quoting note", () => {
    const listing = ev(
      30402,
      [
        ["d", "bike"],
        ["title", "Road bike"],
        ["price", "350", "EUR"],
      ],
      "A long description nobody needs in a quote.",
    );
    const outer = vi.fn();
    renderWithProviders(
      <div onClick={outer}>
        <EmbeddedNoteCard event={listing} author={{ name: "Seller" }} />
      </div>,
    );
    const card = screen.getByTestId(`listing-card-${listing.id}`);
    expect(card).toHaveTextContent("Road bike");
    expect(card).not.toHaveTextContent("A long description");
    fireEvent.click(card);
    expect(outer).not.toHaveBeenCalled();
  });

  it("a quoted app is its app card; a quoted repo its repo card", () => {
    const app = ev(32267, [
      ["d", "com.example"],
      ["name", "Example App"],
    ]);
    const { unmount } = quote(app);
    expect(screen.getByTestId(`app-card-${app.id}`)).toHaveTextContent("Example App");
    unmount();
    const repo = ev(30617, [
      ["d", "amethyst"],
      ["name", "amethyst"],
      ["description", "Nostr client"],
    ]);
    repoCounts.mockClear();
    quote(repo);
    expect(screen.getByTestId(`repo-card-${repo.id}`)).toHaveTextContent("amethyst");
    // Audit: each quoted repo sent two COUNTs and a REQ; its page says how busy it is.
    expect(repoCounts).not.toHaveBeenCalled();
  });

  it("a quoted publication goes through the article card, named as what it is", () => {
    quote(
      ev(
        30040,
        [
          ["d", "book"],
          ["title", "The Book"],
        ],
        "",
      ),
    );
    expect(screen.getByTestId("embedded-article")).toHaveTextContent("The Book");
  });

  it("anything else keeps its words and says its kind — a zap is no mystery; a note says nothing", () => {
    const { unmount } = quote(ev(9735, [["bolt11", "lnbc1"]], "Great post!"));
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("Great post!");
    expect(screen.getByTestId("embedded-kind")).toHaveTextContent("Zap receipt");
    unmount();
    quote(ev(1, [], "gm"));
    expect(screen.queryByTestId("embedded-kind")).toBeNull();
  });
});

describe("EmbeddedNoteCard — what a quoted card may show and link", () => {
  const imgs = () => Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src") ?? "");
  const flag = ["content-warning", "nsfw"];

  it("a listing, a stream, a track or a thing is one cover until asked, then the card, focused", () => {
    const cases = [
      ev(30402, [
        ["d", "x"],
        ["title", "Thing"],
        ["price", "10", "USD"],
        ["image", "https://img.example/nsfw1.jpg"],
        flag,
      ]),
      ev(30311, [["d", "x"], ["title", "S"], ["image", "https://img.example/nsfw2.jpg"], flag]),
      ev(31337, [
        ["d", "x"],
        ["title", "Song"],
        ["media", "https://a.example/s.mp3"],
        ["image", "https://img.example/nsfw3.jpg"],
        flag,
      ]),
      ev(34550, [["d", "x"], ["name", "Club"], ["image", "https://img.example/nsfw4.jpg"], flag]),
      ev(32267, [["d", "x"], ["name", "App"], ["icon", "https://img.example/nsfw5.jpg"], flag]),
    ];
    for (const quoted of cases) {
      const { unmount } = quote(quoted);
      const card = screen.getByTestId("embedded-card");
      expect(within(card).getByTestId("sensitive-cover")).toHaveTextContent("nsfw");
      expect(imgs().filter((s) => s.includes("nsfw"))).toEqual([]);
      fireEvent.click(within(card).getByRole("button", { name: "Show media" }));
      expect(within(card).queryByTestId("sensitive-cover")).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId("embedded-card-revealed"));
      unmount();
    }
  });

  // Audit: an app's `url` and a past event's `recording` reached a card's link out unchecked.
  it("a card's link out is only ever a web address", () => {
    const hrefs = () => Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    // With no `d`, the app has no Zap Store page: its own `url` would be the link.
    const { unmount } = quote(
      ev(32267, [
        ["name", "App"],
        ["url", "javascript:alert(1)"],
      ]),
    );
    expect(screen.getByTestId("embedded-card")).toHaveTextContent("App");
    expect(hrefs().filter((h) => /^\s*javascript:/i.test(h))).toEqual([]);
    unmount();
    quote(
      ev(31923, [
        ["d", "x"],
        ["title", "T"],
        ["start", "1600000000"],
        ["end", "1600003600"],
        ["recording", "javascript:alert(2)"],
      ]),
    );
    expect(screen.getByTestId("embedded-card")).toHaveTextContent("T");
    expect(hrefs().filter((h) => /^\s*javascript:/i.test(h))).toEqual([]);
  });

  it("an article shows no cover picture", () => {
    quote(ev(30023, [["d", "x"], ["title", "A"], ["image", "https://img.example/nsfw6.jpg"], flag], "body"));
    expect(screen.getByTestId("embedded-article")).toHaveTextContent("A");
    expect(imgs().filter((s) => s.includes("nsfw"))).toEqual([]);
    expect(screen.getByTestId("sensitive-tile")).toBeInTheDocument();
  });

  it("a voice message plays without its art", () => {
    quote(ev(1222, [["image", "https://img.example/nsfw7.jpg"], flag], "https://a.example/v.m4a"));
    expect(screen.getByTestId("embedded-audio")).toBeInTheDocument();
    expect(imgs().filter((s) => s.includes("nsfw"))).toEqual([]);
  });
});

describe("references by address and from an article", () => {
  it("the article card asked to draw a stream draws the stream, never an article with the default cover", () => {
    const live = ev(30311, [
      ["d", "show"],
      ["title", "Friday night show"],
    ]);
    renderWithProviders(<EmbeddedArticleCard event={live} />);
    expect(screen.getByTestId(`live-card-${live.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId("embedded-article")).toBeNull();
  });

  // Audit: a video, picture or sound handed to the article card drew without a way to its page.
  it("the article card asked to draw a video draws it as a card that opens the video's page", () => {
    window.history.replaceState({}, "", "/");
    const video = ev(34235, [
      ["d", "clip"],
      ["title", "V"],
      ["imeta", "url https://v.example/a.mp4", "m video/mp4"],
    ]);
    renderWithProviders(<EmbeddedArticleCard event={video} author={{ name: "M" }} />);
    const card = screen.getByTestId("embedded-note");
    expect(within(card).getByTestId("embedded-video")).toBeInTheDocument();
    fireEvent.click(within(card).getByTestId("embedded-caption"));
    expect(window.location.pathname).toBe(`/e/${naddrOf(video)}`);
  });

  // Audit: junk on a card kind, an untitled listing, a video with no file — each said "Untitled article".
  it("an event the article card cannot read as an article keeps its words and its link", () => {
    for (const odd of [
      ev(31337, [["d", "save"]], "level 3"),
      ev(30402, [["d", "x"]], "A thing for sale"),
      ev(34235, [["d", "x"]], "A clip, somewhere"),
    ]) {
      const { unmount } = renderWithProviders(<EmbeddedArticleCard event={odd} author={{ name: "M" }} />);
      expect(screen.queryByTestId("embedded-article")).toBeNull();
      expect(document.body).not.toHaveTextContent("Untitled article");
      expect(screen.getByTestId("embedded-note").className).toContain("cursor-pointer");
      unmount();
    }
  });

  it("a web bookmark is its link, with its title and site", () => {
    const bookmark = ev(
      39701,
      [
        ["d", "alice.blog/post"],
        ["title", "Alice on relays"],
      ],
      "Worth keeping",
    );
    renderWithProviders(<EmbeddedArticleCard event={bookmark} author={{ name: "M" }} />);
    expect(screen.queryByTestId("embedded-article")).toBeNull();
    const link = screen.getByTestId("embedded-web-bookmark");
    expect(link).toHaveAttribute("href", "https://alice.blog/post");
    expect(link).toHaveTextContent("Alice on relays");
    expect(link).toHaveTextContent("alice.blog");
    expect(screen.getByTestId("embedded-note")).toHaveTextContent("Worth keeping");
  });

  it("a private follow set says it is sealed, not its ciphertext or 0 items", () => {
    quote(ev(30000, [["d", "secret"]], "AbCdEfGh==?iv=XyZ12345"));
    const card = screen.getByTestId("embedded-note");
    expect(card).not.toHaveTextContent("AbCdEf");
    expect(card).toHaveTextContent("Encrypted");
    expect(card).not.toHaveTextContent("0 items");
  });

  it("an article's naddr to a listing is the listing's card; to a publication, the article card", async () => {
    const listing = held(
      ev(30402, [
        ["d", "bike"],
        ["title", "Road bike"],
        ["price", "350", "EUR"],
      ]),
    );
    const { unmount } = renderWithProviders(<NostrRef bech32={naddrOf(listing)} />);
    expect(await screen.findByTestId(`listing-card-${listing.id}`)).toHaveTextContent("Road bike");
    unmount();
    const book = held(
      ev(30041, [
        ["d", "ch1"],
        ["title", "Chapter one"],
      ]),
    );
    renderWithProviders(<NostrRef bech32={naddrOf(book)} />);
    expect(await screen.findByTestId("embedded-article")).toHaveTextContent("Chapter one");
  });

  // Audit: a draft, publication or section the lookup did not find lost the author's own link.
  it("an unfound draft or publication keeps the author's link around it", async () => {
    for (const kind of [30024, 30040, 30041]) {
      const bech32 = nip19.naddrEncode({ kind, pubkey: PK, identifier: "gone" });
      const { unmount } = renderWithProviders(<NostrRef bech32={bech32} url="https://site.example/read/gone" />);
      await new Promise((r) => setTimeout(r, 0));
      expect(document.querySelector('a[href="https://site.example/read/gone"]')).not.toBeNull();
      unmount();
    }
  });

  it("an article's nevent to a dated event is its card", async () => {
    const meetup = ev(31922, [
      ["d", "day"],
      ["title", "Hack day"],
      ["start", "2026-11-01"],
    ]);
    byId.set(meetup.id, meetup);
    renderWithProviders(<NostrRef bech32={nip19.neventEncode({ id: meetup.id, author: PK })} />);
    expect(await screen.findByTestId(`event-card-${meetup.id}`)).toHaveTextContent("Hack day");
  });

  it("an address that holds junk on a card kind stays a link", async () => {
    const junk = held(ev(31337, [["d", "save"]], '{"level":3}'));
    renderWithProviders(<NostrRef bech32={naddrOf(junk)} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("embedded-card")).toBeNull();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("a note's naddr to a mint review is its card at the top level", async () => {
    const review = held(
      ev(
        38000,
        [
          ["d", "mint"],
          ["k", "38172"],
          ["u", "https://mint.example"],
        ],
        "Fast",
      ),
    );
    renderWithProviders(<NoteContent content={`Try this mint nostr:${naddrOf(review)}`} embedThings />);
    expect(await screen.findByTestId("embedded-card")).toHaveAttribute("data-shape", "thing");
  });
});
