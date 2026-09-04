// @vitest-environment jsdom
/**
 * Favicons without a third-party service: a site's own /favicon.ico first,
 * then the places sites actually keep them, then the apex domain when the
 * link said www — and only after all of that, the globe.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Favicon, LinkPreviewCard } from "./LinkPreview";

// Fountain's page, answered or not — the card is the player, not a fetch test.
const fountainItemMock = vi.fn<(url: string) => { loading: boolean; item: import("@/lib/fountain").FountainItem | null }>(() => ({ loading: false, item: null }));
vi.mock("@/lib/fountain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fountain")>()),
  useFountainItem: (url: string) => fountainItemMock(url),
}));

// Wavlake's catalogue, answered: the card is the inline player, not a fetch test.
vi.mock("@/lib/wavlake", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/wavlake")>();
  return {
    ...real,
    useWavlakeTrack: (id: string | undefined) =>
      id
        ? { loading: false, error: false, track: { id, title: "Need You Whole", artist: "Handled", audioUrl: "https://audio.nostr.build/x.mp3", duration: 201 } }
        : { loading: false, error: false, track: null },
  };
});

function img() {
  return document.querySelector("img[data-testid='favicon']") as HTMLImageElement | null;
}

describe("Favicon", () => {
  it("walks the candidates before settling on the globe", () => {
    render(<Favicon host="www.relayop.xyz" className="h-3 w-3" />);
    expect(img()?.getAttribute("src")).toBe("https://www.relayop.xyz/favicon.ico");
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://www.relayop.xyz/favicon.png");
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://relayop.xyz/favicon.ico");
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://relayop.xyz/favicon.png");
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByTestId("favicon-globe")).toBeInTheDocument();
  });

  it("does not repeat the apex when the host already is one", () => {
    render(<Favicon host="example.org" className="h-3 w-3" />);
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe("https://example.org/favicon.png");
    fireEvent.error(img()!);
    expect(img()).toBeNull();
  });
});

describe("LinkPreviewCard — a YouTube link plays where it is", () => {
  it("shows a click-to-play player instead of a card that bounces to YouTube", () => {
    render(<LinkPreviewCard url="https://youtu.be/dQw4w9WgXcQ" />);

    // The facade: poster + play, nothing fetched from YouTube yet.
    const card = screen.getByTestId("link-card-youtube");
    expect(card.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("button", { name: /play youtube video/i })).toBeInTheDocument();
    expect(card.querySelector("img")?.getAttribute("src")).toContain("dQw4w9WgXcQ");

    fireEvent.click(screen.getByRole("button", { name: /play youtube video/i }));

    // Play swaps in the player, on the cookieless host, already running.
    const frame = card.querySelector("iframe");
    expect(frame?.getAttribute("src")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame?.getAttribute("src")).toContain("autoplay=1");
    // The source is still one click away for whoever wants the site itself.
    const source = screen.getByTestId("link-card-youtube-source");
    expect(source.getAttribute("href")).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source).toHaveTextContent(/YouTube · youtu\.be/);
  });
});

describe("LinkPreviewCard — audio links play where they are", () => {
  it("a Wavlake track link is the inline player, not a card that leaves", () => {
    render(<LinkPreviewCard url="https://wavlake.com/track/3b6d1e58-2f9d-4a7e-9c1b-0d2a6f7e8a90" />);
    const card = screen.getByTestId("wavlake-track");
    expect(card).toHaveTextContent("Need You Whole");
    expect(card).toHaveTextContent("Handled");
    expect(screen.getByTestId("track-play")).toHaveAttribute("aria-label", "Play");
    expect(screen.queryByTestId("link-card")).toBeNull();
  });

  it("a Fountain episode is a rich card — artwork, show, title, description — that plays where it is", () => {
    fountainItemMock.mockReturnValue({
      loading: false,
      item: {
        kind: "episode",
        id: "T0iRUdk8nBSfUEPLLcJ3",
        show: "Radio Detox",
        title: "Right Said Fred",
        description: "The conversation between Host Heather Larson and Right Said Fred covers the journey of independent artists.",
        image: "https://hosting-media.riverside.com/logos/b64d.jpeg",
        audio: "https://api.riverside.com/media/0abf.mp3",
        url: "https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3",
      },
    });
    render(<LinkPreviewCard url="https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3" />);

    const card = screen.getByTestId("fountain-card");
    expect(card).toHaveTextContent("Radio Detox");
    expect(card).toHaveTextContent("Right Said Fred");
    expect(card).toHaveTextContent(/journey of independent artists/);
    expect(card).toHaveTextContent(/Fountain/);
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://hosting-media.riverside.com/logos/b64d.jpeg");
    // The page stays one click away; the audio plays here.
    expect(screen.getByTestId("fountain-open").getAttribute("href")).toBe("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3");
    const play = screen.getByTestId("fountain-play");
    expect(play).toHaveAttribute("aria-label", "Play");
    // jsdom has no media pipeline; the shared player only needs play() to answer.
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    fireEvent.click(play);
    // The shared player took it: the card is now the active one, seek bar and all.
    expect(screen.getByTestId("fountain-seek")).toBeInTheDocument();
  });

  it("a long description folds to a few lines and opens fully on More", () => {
    const long = "Paul Keating and DirectorHodl come on the show to talk about Hummingbird, the documentary they just released. " +
      "The film started life as a small video idea for Bitcoin Jungle and grew over a couple of years into a feature-length meditation on indigenous prophecy, the fiat system, and the strange gravitational pull of one small town in Costa Rica. " +
      "The philosophical spine of the film is the prophecy of the Eagle and the Condor, unpacked in some depth.";
    fountainItemMock.mockReturnValue({
      loading: false,
      item: { kind: "episode", id: "x", show: "Plebchain Radio", title: "160 – Of Eagles and Condors", description: long, image: null, audio: "https://cdn/x.mp3", url: "https://fountain.fm/episode/x" },
    });
    render(<LinkPreviewCard url="https://fountain.fm/episode/x" />);

    const desc = screen.getByTestId("fountain-description");
    expect(desc.className).toMatch(/line-clamp/);
    const more = screen.getByTestId("fountain-more");
    expect(more).toHaveTextContent(/More/);

    fireEvent.click(more);
    expect(screen.getByTestId("fountain-description").className).not.toMatch(/line-clamp/);
    expect(screen.getByTestId("fountain-description")).toHaveTextContent(/Eagle and the Condor/);
    expect(screen.getByTestId("fountain-more")).toHaveTextContent(/Less/);
  });

  it("a short description has nothing to unfold, so no More", () => {
    fountainItemMock.mockReturnValue({
      loading: false,
      item: { kind: "episode", id: "y", show: "Show", title: "Short one", description: "A quick chat.", image: null, audio: "https://cdn/y.mp3", url: "https://fountain.fm/episode/y" },
    });
    render(<LinkPreviewCard url="https://fountain.fm/episode/y" />);
    expect(screen.queryByTestId("fountain-more")).toBeNull();
  });

  it("a Fountain link whose page cannot be read is still a Listen card that leaves", () => {
    fountainItemMock.mockReturnValue({ loading: false, item: null });
    render(<LinkPreviewCard url="https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3" />);
    const card = screen.getByTestId("link-card-fountain");
    expect(card).toHaveTextContent(/Listen on Fountain/);
    expect(card.getAttribute("href")).toBe("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3");
    expect(card.getAttribute("target")).toBe("_blank");
  });
});
