// @vitest-environment jsdom
/**
 * The compact SERP row, news-grade: a news-shaped note renders as a real
 * news card (clickable headline out to the article, source line, summary,
 * thumbnail); bare URLs in ordinary posts become clickable chips; the row
 * itself still opens the in-app event page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { SerpRow } from "./SerpRow";

vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
}));
// The real store verifies signatures (and jsdom's TextEncoder trips @noble),
// so known-profile lookups are faked per test.
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (_kind: number, pubkey: string) => knownProfiles.get(pubkey),
    getEvent: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));
import { nip19 } from "nostr-tools";
// Link metadata comes from the server's unfurl proxy — faked so the row can
// prove it turns a plain link into a card when the answer exists.
const unfurlMock = vi.fn<(url: string) => Promise<{ title: string | null; description: string | null; image: string | null; siteName: string | null } | null>>(() =>
  Promise.resolve(null),
);
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: (url: string) => unfurlMock(url) }));
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({ useLightbox: () => openLightboxMock }));

function note(content: string, tags: string[][] = []): NostrEvent {
  return {
    id: "e".repeat(64),
    kind: 1,
    pubkey: "a".repeat(64),
    tags,
    content,
    created_at: Math.floor(Date.now() / 1000) - 3600,
    sig: "s",
  } as NostrEvent;
}

const author = {
  pubkey: "a".repeat(64),
  npub: "npub1echo",
  name: "Liverpool Echo Sport",
  wotRank: null,
  wotFollowers: null,
};

const NEWS =
  "Everton fan group 'standing down' after transfer window\n" +
  "https://www.liverpoolecho.co.uk/sport/story-34554156\n" +
  "The 1878s have issued a statement. https://cdn.example/photo.jpg";

beforeEach(() => {
  window.history.replaceState({}, "", "/?q=liverpool");
});

describe("SerpRow — link metadata", () => {
  // Google shows a link's title and description, not its bare domain. Ours
  // can too, once the server's unfurl proxy answers — the row renders the
  // card for its first plain link, and stays a chip when there is no answer.
  it("turns a plain link into a metadata card when the proxy knows it", async () => {
    unfurlMock.mockResolvedValue({ title: "Liverpool F.C.", description: "Professional football club based in Liverpool.", image: "https://img/lfc.jpg", siteName: "Wikipedia" });
    // A short lead — a long one plus a link IS the news shape, which has its own card.
    render(<SerpRow event={note("Worth a read https://en.wikipedia.org/wiki/Liverpool_F.C.")} author={author} score={0.7} query="liverpool" />);
    const card = await screen.findByTestId("link-card");
    expect(card).toHaveTextContent("Liverpool F.C.");
    expect(card).toHaveTextContent("Professional football club");
    expect(card).toHaveTextContent("en.wikipedia.org");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://img/lfc.jpg");
    expect(card.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Liverpool_F.C.");
    expect(unfurlMock).toHaveBeenCalledWith("https://en.wikipedia.org/wiki/Liverpool_F.C.");
  });

  it("no answer, no card — the domain chip stands alone", async () => {
    unfurlMock.mockResolvedValue(null);
    render(<SerpRow event={note("Great read https://example.org/post")} author={author} score={0.7} query="liverpool" />);
    await screen.findByTestId("link-chip");
    await Promise.resolve();
    expect(screen.queryByTestId("link-card")).toBeNull();
  });
});

describe("SerpRow — media taps", () => {
  // A row's thumbnail is the media, not a handle on the post: tapping it
  // opens the picture (or plays the video) in full view; the rest of the row
  // still opens the post.
  it("tapping the thumbnail opens the media in the lightbox, not the post", () => {
    const photo = { ...note("Anfield tonight", [["imeta", "url https://cdn.example/anfield.jpg", "m image/jpeg"]]), kind: 20 };
    render(<SerpRow event={photo} author={author} score={0.7} query="anfield" />);
    fireEvent.click(screen.getByTestId("serp-thumb"));
    expect(openLightboxMock).toHaveBeenLastCalledWith([{ url: "https://cdn.example/anfield.jpg", kind: "image" }], 0);
    expect(window.location.pathname).toBe("/");
  });

  it("a video thumbnail plays the video in the lightbox", () => {
    const clip = { ...note("Goal!", [["imeta", "url https://cdn.example/goal.mp4", "m video/mp4"]]), kind: 21 };
    render(<SerpRow event={clip} author={author} score={0.7} query="goal" />);
    fireEvent.click(screen.getByTestId("serp-video-thumb"));
    expect(openLightboxMock).toHaveBeenLastCalledWith([{ url: "https://cdn.example/goal.mp4", kind: "video", poster: null }], 0);
    expect(window.location.pathname).toBe("/");
  });
});

describe("SerpRow", () => {
  it("renders a news-shaped note as a news card with a clickable headline", () => {
    render(<SerpRow event={note(NEWS)} author={author} score={0.7} query="liverpool" />);

    const headline = screen.getByTestId("news-headline");
    expect(headline).toHaveTextContent("Everton fan group 'standing down'");
    expect(headline.getAttribute("href")).toContain("liverpoolecho.co.uk/sport/story-34554156");
    expect(headline.getAttribute("target")).toBe("_blank");

    // Source line: the outlet's domain, Google-News style.
    expect(screen.getByTestId("news-source")).toHaveTextContent("liverpoolecho.co.uk");
    // Description without the raw URLs.
    expect(screen.getByText(/The 1878s have issued a statement/)).toBeInTheDocument();
    expect(screen.queryByText(/photo\.jpg/)).toBeNull();
    // The embedded image is the thumbnail.
    const thumb = screen.getByTestId("news-thumb") as HTMLImageElement;
    expect(thumb.src).toContain("cdn.example/photo.jpg");
  });

  it("turns bare URLs in an ordinary post into clickable chips", () => {
    render(
      <SerpRow
        event={note("check this out https://example.com/thing and also some words")}
        author={author}
        score={0.7}
        query="liverpool"
      />,
    );
    const chip = screen.getByTestId("link-chip");
    expect(chip.getAttribute("href")).toBe("https://example.com/thing");
    expect(chip).toHaveTextContent("example.com");
    // The raw URL text is gone from the snippet.
    expect(screen.queryByText(/https:\/\/example\.com\/thing/)).toBeNull();
  });

  it("labels each row with what kind of thing it is", () => {
    render(<SerpRow event={note("plain words about liverpool")} author={author} score={0.7} query="liverpool" />);
    expect(screen.getByTestId("serp-type")).toHaveTextContent("Note");
  });

  it("labels a news-shaped note as News", () => {
    render(<SerpRow event={note(NEWS)} author={author} score={0.7} query="liverpool" />);
    expect(screen.getByTestId("serp-type")).toHaveTextContent("News");
  });

  it("renders a nostr: mention as the person — name, not a raw URI", () => {
    const carol = "c".repeat(64);
    knownProfiles.set(carol, {
      id: "f".repeat(64),
      kind: 0,
      pubkey: carol,
      tags: [],
      content: JSON.stringify({ name: "carol", picture: "https://img.example/carol.jpg" }),
      created_at: 1,
      sig: "s",
    } as NostrEvent);
    const npub = nip19.npubEncode(carol);

    render(
      <SerpRow event={note(`great point by nostr:${npub} tonight`)} author={author} score={0.7} query="liverpool" />,
    );
    const chip = screen.getByTestId("mention-chip");
    expect(chip).toHaveTextContent("@carol");
    expect(chip.getAttribute("href")).toBe(`/p/${npub}`);
    expect(screen.queryByText(/nostr:npub/)).toBeNull();
  });

it("a video-only result gets a first-frame thumb, not a blank", () => {
    const vid = {
      ...note("match highlights", [["imeta", "url https://cdn.example/highlights.mp4", "m video/mp4"]]),
      kind: 21,
    } as NostrEvent;
    render(<SerpRow event={vid} author={author} score={0.7} query="liverpool" />);
    const video = screen.getByTestId("serp-video-thumb") as HTMLVideoElement;
    expect(video.getAttribute("src")).toContain("highlights.mp4");
    expect(video.getAttribute("preload")).toBe("metadata");
  });

  it("a thumbnail that fails to load disappears instead of showing broken", () => {
    const withImage = note("stream tonight", [["image", "https://dvr.example/expired-thumb.jpg"]]);
    render(<SerpRow event={withImage} author={author} score={0.7} query="liverpool" />);
    const img = screen.getByTestId("serp-thumb") as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.queryByTestId("serp-thumb")).toBeNull();
  });

  it("clicking the row body opens the in-app event page", () => {

    render(<SerpRow event={note("plain words about liverpool")} author={author} score={0.7} query="liverpool" />);
    fireEvent.click(screen.getByTestId(`serp-row-${"e".repeat(64)}`));
    expect(window.location.pathname).toMatch(/^\/e\//);
  });
});
