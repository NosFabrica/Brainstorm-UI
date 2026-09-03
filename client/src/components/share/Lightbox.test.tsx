// @vitest-environment jsdom
/**
 * The shared media lightbox. Born for images; now it plays video too, so a
 * tap on a clip anywhere in the app gives the clip — full view, playing —
 * the way X, Instagram and TikTok do. Plain URL strings still mean images.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LightboxProvider, useLightbox } from "./Lightbox";

type OpenArgs = Parameters<ReturnType<typeof useLightbox>>;
function Opener({ items, context }: { items: OpenArgs[0]; context?: OpenArgs[2] }) {
  const open = useLightbox();
  return (
    <button type="button" onClick={() => open(items, 0, context)}>
      open
    </button>
  );
}

describe("Lightbox", () => {
  // Benjamin: in full view, say whose media it is — a subtle bar with the
  // poster's face and name (to their profile) and a "View post" link — so
  // the click keeps its value and the way onward is one tap away.
  it("credits the poster and offers the post, quietly, in full view", () => {
    render(
      <LightboxProvider>
        <Opener
          items={["https://cdn.example/a.jpg"]}
          context={{ author: { name: "Sports Central", npub: "npub1sports", picture: "https://cdn.example/sc.png", score01: 0.8 }, postHref: "/e/nevent1abc" }}
        />
      </LightboxProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    const bar = screen.getByTestId("lightbox-attribution");
    expect(bar).toHaveTextContent("Sports Central");
    // The face wears the poster's tier ring (jsdom never loads the picture itself).
    expect(bar.querySelector('[class*="shadow-[0_0_0"]')).not.toBeNull();
    expect(bar.querySelector('a[href="/p/npub1sports"]')).not.toBeNull();
    const post = screen.getByTestId("lightbox-view-post");
    expect(post.getAttribute("href")).toBe("/e/nevent1abc");
    expect(post).toHaveTextContent("View post");
    // Taking either way onward closes the full view.
    fireEvent.click(post);
    expect(screen.queryByTestId("lightbox")).toBeNull();
  });

  it("shows no bar when nobody is credited (app screenshots)", () => {
    render(
      <LightboxProvider>
        <Opener items={["https://cdn.example/shot.png"]} />
      </LightboxProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    expect(screen.queryByTestId("lightbox-attribution")).toBeNull();
  });
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
