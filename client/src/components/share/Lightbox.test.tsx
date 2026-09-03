// @vitest-environment jsdom
/**
 * The shared media lightbox. Born for images; now it plays video too, so a
 * tap on a clip anywhere in the app gives the clip — full view, playing —
 * the way X, Instagram and TikTok do. Plain URL strings still mean images.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LightboxProvider, useLightbox } from "./Lightbox";

function Opener({ items }: { items: Parameters<ReturnType<typeof useLightbox>>[0] }) {
  const open = useLightbox();
  return (
    <button type="button" onClick={() => open(items, 0)}>
      open
    </button>
  );
}

describe("Lightbox", () => {
  it("plays a video item full view, with controls, starting at once", () => {
    render(
      <LightboxProvider>
        <Opener items={[{ url: "https://cdn.example/goal.mp4", kind: "video", poster: "https://cdn.example/poster.jpg" }]} />
      </LightboxProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    const video = screen.getByTestId("lightbox-video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://cdn.example/goal.mp4");
    expect(video.getAttribute("poster")).toBe("https://cdn.example/poster.jpg");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
  });

  it("still shows plain URL strings as images", () => {
    render(
      <LightboxProvider>
        <Opener items={["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]} />
      </LightboxProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByTestId("lightbox-image").getAttribute("src")).toBe("https://cdn.example/a.jpg");
    expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 2");
  });
});
