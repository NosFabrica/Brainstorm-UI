// @vitest-environment jsdom
/**
 * Favicons without a third-party service: a site's own /favicon.ico first,
 * then the places sites actually keep them, then the apex domain when the
 * link said www — and only after all of that, the globe.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Favicon, LinkPreviewCard } from "./LinkPreview";

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
