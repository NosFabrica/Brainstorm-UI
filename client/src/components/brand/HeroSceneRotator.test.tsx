import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_PHOTO, HERO_PHOTO_SRCSET, HERO_SOLO } from "@/lib/heroScenes";
import { HeroSceneRotator } from "./HeroSceneRotator";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HeroSceneRotator", () => {
  it("offers the photo at each width it has, for the width it's drawn at", () => {
    const { container } = render(<HeroSceneRotator scenes={HERO_SOLO} sizes="45vw" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(HERO_PHOTO);
    expect(img.getAttribute("srcset")).toBe(HERO_PHOTO_SRCSET);
    expect(img.getAttribute("sizes")).toBe("45vw");
  });

  it("under a media query, asks for the photo only through a <source> that query gates", () => {
    // The login panel is display:none below lg, and an <img> there still downloads.
    const { container } = render(<HeroSceneRotator scenes={HERO_SOLO} media="(min-width: 1024px)" sizes="45vw" />);
    const source = container.querySelector("picture > source")!;
    expect(source.getAttribute("media")).toBe("(min-width: 1024px)");
    expect(source.getAttribute("srcset")).toBe(HERO_PHOTO_SRCSET);
    const img = container.querySelector("picture > img")!;
    expect(img.getAttribute("src")).toMatch(/^data:image\/gif;base64,/);
    expect(img.hasAttribute("srcset")).toBe(false);
  });

  it("doesn't preload a lone scene: its <img> is already the request", () => {
    const made = vi.fn();
    vi.stubGlobal(
      "Image",
      class {
        constructor() {
          made();
        }
      },
    );
    render(<HeroSceneRotator scenes={HERO_SOLO} />);
    expect(made).not.toHaveBeenCalled();
  });
});
