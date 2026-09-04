// @vitest-environment jsdom
/**
 * Favicons without a third-party service: a site's own /favicon.ico first,
 * then the places sites actually keep them, then the apex domain when the
 * link said www — and only after all of that, the globe.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Favicon, LinkPreviewCard } from "./LinkPreview";

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

  it("a Fountain episode is a Listen card until the link proxy can fetch its audio", () => {
    render(<LinkPreviewCard url="https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3" />);
    const card = screen.getByTestId("link-card-fountain");
    expect(card).toHaveTextContent(/Listen on Fountain/);
    expect(card.getAttribute("href")).toBe("https://fountain.fm/episode/T0iRUdk8nBSfUEPLLcJ3");
    expect(card.getAttribute("target")).toBe("_blank");
  });
});
