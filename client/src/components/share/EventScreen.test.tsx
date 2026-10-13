// @vitest-environment jsdom
/**
 * The event page, for the two things it decides before the video hero draws:
 * a video whose NIP-40 `expiration` has passed is gone, said the way a deleted
 * post is; and a video is dated by when it was published, since a restored
 * Vine's `created_at` is the day it was imported.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountManager } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata } from "@/accounts/metadata";
import type { MinimalEvent } from "@/lib/noteRefs";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
// Author scores are batched on a timer (services/trustSignals): answered here, so a late
// flush after a test has ended finds an API to ask.
vi.mock("@/services/api", () => ({
  apiClient: { getHouseInfluence: async () => null, getTrustSignals: async () => new Map() },
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useShareMeta", () => ({ useShareMeta: () => {} }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));
vi.mock("@/hooks/useBackupNeed", () => ({ useBackupNeed: () => null }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({ useDictionaryConcepts: () => ({ rendered: [], known: true }) }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/share/EventThread", () => ({ EventThread: () => null }));
vi.mock("@/components/share/ThreadAncestors", () => ({ ThreadAncestors: () => null }));
vi.mock("@/components/share/NoteTagChips", () => ({ NoteTagChips: () => null }));
vi.mock("@/components/share/MoreFromAuthor", () => ({ MoreFromAuthor: () => null }));
vi.mock("@/components/share/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/share/EntityMenu", () => ({ EntityMenu: () => null }));

import { EventScreen } from "./EventScreen";

const NOW = Math.floor(Date.now() / 1000);
// Noon UTC on 13 May 2014: the same day in every time zone a test runs in.
const VINE_DAY = 1_399_982_400;
const dateOf = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const vine = (tags: string[][] = []): MinimalEvent => ({
  id: "1".repeat(64),
  kind: 34236,
  pubkey: "9".repeat(64),
  created_at: NOW - 3600,
  content: "",
  tags: [
    ["d", "iq3bXYa5duP"],
    ["imeta", "url https://media.divine.video/vine1", "m video/mp4", "dim 480x480"],
    ["title", "So cute"],
    ["published_at", String(VINE_DAY)],
    ...tags,
  ],
});

const open = (event: MinimalEvent) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <EventStoreProvider eventStore={eventStore}>
        <AccountsProvider manager={new AccountManager<AccountMetadata>()}>
          <EventScreen event={event} />
        </AccountsProvider>
      </EventStoreProvider>
    </QueryClientProvider>,
  );

describe("the event page — an expired video", () => {
  it("says the post has expired, in place of the event", () => {
    open(vine([["expiration", String(NOW - 60)]]));
    expect(screen.getByTestId("event-expired")).toHaveTextContent("This post has expired.");
    expect(screen.queryByTestId("video-hero")).toBeNull();
    expect(screen.queryByTestId("event-note")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
  });

  // Only video kinds for now: expiration on every other kind is its own change.
  it("leaves a note with a past expiration as it was", () => {
    open({ ...vine(), kind: 1, content: "Flash sale until noon", tags: [["expiration", String(NOW - 60)]] });
    expect(screen.queryByTestId("event-expired")).toBeNull();
    expect(screen.getByTestId("event-note")).toHaveTextContent("Flash sale until noon");
  });

  it("covers every video kind", () => {
    for (const kind of [21, 22, 34235]) {
      const { unmount } = open({ ...vine([["expiration", String(NOW - 60)]]), kind });
      expect(screen.getByTestId("event-expired")).toBeInTheDocument();
      unmount();
    }
  });

  it("shows an event whose expiration is still ahead, or is not a time", () => {
    const { unmount } = open(vine([["expiration", String(NOW + 3600)]]));
    expect(screen.queryByTestId("event-expired")).toBeNull();
    expect(screen.getByTestId("video-hero")).toBeInTheDocument();
    unmount();
    open(vine([["expiration", "soon"]]));
    expect(screen.queryByTestId("event-expired")).toBeNull();
    expect(screen.getByTestId("video-hero")).toBeInTheDocument();
  });
});

describe("the event page — a video's date", () => {
  it("is when it was published: a Vine imported today still reads 2014", () => {
    open(vine());
    const byline = screen.getByTestId("event-date");
    expect(byline).toHaveTextContent(dateOf(VINE_DAY));
    expect(byline).toHaveTextContent("2014");
  });

  it("is created_at for every other kind, whatever its published_at says", () => {
    open({ ...vine(), kind: 1, content: "hello", tags: [["published_at", String(VINE_DAY)]] });
    expect(screen.getByTestId("event-date")).toHaveTextContent(dateOf(NOW - 3600));
  });
});

const MP3 = "https://cdn.example/episode.mp3";
const eventOf = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: "2".repeat(64),
  kind,
  pubkey: "9".repeat(64),
  created_at: NOW - 3600,
  content,
  tags,
});

// A sound on a page with no hero of its own was drawn as an <img>: a broken picture.
describe("the event page — a file that is a sound", () => {
  it("plays an audio file in the player, never as a picture", () => {
    open(eventOf(1111, [["imeta", `url ${MP3}`, "m audio/mpeg"]], "Listen to this"));
    expect(screen.getByTestId("event-media-audio")).toBeInTheDocument();
    expect(screen.getByTestId("embedded-track")).toBeInTheDocument();
    expect(document.querySelector(`img[src="${MP3}"]`)).toBeNull();
  });

  it("a media file (1063) is drawn as what it is, with its mime, size and hash under it", () => {
    const hash = "cbb49d834143aa9047325603dacd4f8142093567973566de3b1e20a89557b728";
    open(
      eventOf(1063, [
        ["url", MP3],
        ["m", "audio/mpeg"],
        ["size", "2048"],
        ["x", hash],
      ]),
    );
    const hero = screen.getByTestId("file-hero");
    expect(screen.getByTestId("embedded-track")).toBeInTheDocument();
    expect(hero.querySelector(`img[src="${MP3}"]`)).toBeNull();
    expect(screen.getByTestId("file-hero-facts")).toHaveTextContent("Audio · audio/mpeg · 2 KB");
    expect(screen.getByTestId("file-hero-hash")).toHaveTextContent("SHA-256 cbb49d834143…57b728");
  });
});

describe("the event page — an audio hero for every sound", () => {
  it("a 36787 music track: cover, title, artist, album, track number, explicit", () => {
    open(
      eventOf(
        36787,
        [
          ["d", "t1"],
          ["title", "Night Drive"],
          ["artist", "The Relays"],
          ["url", MP3],
          ["image", "https://cdn.example/cover.jpg"],
          ["album", "Signals"],
          ["track_number", "3"],
          ["explicit", "true"],
          ["duration", "214"],
        ],
        "Recorded live.",
      ),
    );
    const hero = screen.getByTestId("audio-hero");
    expect(hero).toHaveTextContent("Night Drive");
    expect(screen.getByTestId("audio-hero-artist")).toHaveTextContent("The Relays");
    expect(screen.getByTestId("audio-hero-facts")).toHaveTextContent("Signals · Track 3");
    expect(screen.getByTestId("audio-hero-explicit")).toBeInTheDocument();
    expect(screen.getByTestId("audio-hero-duration")).toHaveTextContent("3:34");
    expect(hero).toHaveTextContent("Recorded live.");
    expect(hero.querySelector('img[src="https://cdn.example/cover.jpg"]')).not.toBeNull();
    expect(screen.queryByTestId("event-media")).toBeNull();
  });

  it("a 54 podcast episode, and a 30054 with its season and episode", () => {
    const { unmount } = open(
      eventOf(54, [
        ["title", "Ep 12: Relays"],
        ["audio", MP3, "audio/mpeg"],
        ["description", "On running relays."],
      ]),
    );
    expect(screen.getByTestId("audio-hero")).toHaveTextContent("Episode");
    expect(screen.getByTestId("audio-hero")).toHaveTextContent("On running relays.");
    unmount();
    open(
      eventOf(30054, [
        ["d", "pilot"],
        ["title", "Pilot"],
        ["audio", MP3],
        ["season", "2"],
        ["episode", "1"],
      ]),
    );
    expect(screen.getByTestId("audio-hero-facts")).toHaveTextContent("Season 2 · Episode 1");
  });

  it("a voice message: its words beside the file are the caption", () => {
    const voice = "https://cdn.example/voice.webm";
    open(eventOf(1222, [["imeta", `url ${voice}`, "m audio/webm"]], `${voice} on my way`));
    const hero = screen.getByTestId("audio-hero");
    expect(hero).toHaveTextContent("Voice message");
    expect(hero).toHaveTextContent("on my way");
    expect(document.querySelector(`img[src="${voice}"]`)).toBeNull();
  });

  // Another app's reading progress rides 30054 too, with nothing to play.
  it("a 30054 with nothing to play is not a sound", () => {
    open(eventOf(30054, [["d", "book"]], "Chapter 3"));
    expect(screen.queryByTestId("audio-hero")).toBeNull();
  });
});

describe("the event page — a picture post (kind 20)", () => {
  const picture = (tags: string[][] = []) =>
    eventOf(
      20,
      [
        ["title", "Harbour at dawn"],
        ["imeta", "url https://cdn.example/a.jpg", "m image/jpeg", "alt Boats in fog", "dim 1200x800"],
        ["imeta", "url https://cdn.example/b.jpg", "m image/jpeg"],
        ...tags,
      ],
      "Early start today.",
    );

  it("shows its title, each picture in its own shape, and the alt under it", () => {
    open(picture());
    expect(screen.getByTestId("event-media-title")).toHaveTextContent("Harbour at dawn");
    const first = document.querySelector<HTMLImageElement>('img[src="https://cdn.example/a.jpg"]')!;
    expect(first.alt).toBe("Boats in fog");
    expect(first.style.aspectRatio).toBe("1200 / 800");
    expect(screen.getByTestId("event-media-alt")).toHaveTextContent("Boats in fog");
    expect(document.querySelector('img[src="https://cdn.example/b.jpg"]')).not.toBeNull();
  });

  it("marked sensitive, shows a cover in place of its pictures until asked", () => {
    open(picture([["content-warning", "nudity"]]));
    expect(screen.getByTestId("sensitive-cover")).toHaveTextContent(
      "The creator marked these photos as sensitive: nudity",
    );
    expect(document.querySelector('img[src^="https://cdn.example/"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show photos" }));
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
    expect(document.querySelectorAll('img[src^="https://cdn.example/"]')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByTestId("event-media-items"));
  });
});

describe("the event page — a note marked sensitive", () => {
  it("covers the picture in its words until asked", () => {
    open(eventOf(1, [["content-warning", "spoilers"]], "Look at this https://cdn.example/scene.jpg"));
    expect(screen.getByTestId("sensitive-cover")).toHaveTextContent(
      "The creator marked this photo as sensitive: spoilers",
    );
    expect(document.querySelector('img[src*="scene.jpg"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show photo" }));
    expect(document.querySelector('img[src*="scene.jpg"]')).not.toBeNull();
  });
});
