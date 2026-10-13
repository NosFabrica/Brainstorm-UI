// @vitest-environment jsdom
/**
 * A quote's media, for a keyboard and a slow phone: a sensitive picture post
 * is one "show" (not one per tile), and focus lands on the first picture once
 * it shows; a quoted sound says its length from its tags, and a row asks the
 * file for it only once it is near the screen, on a connection that can
 * afford it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";
import { __resetNearViewport } from "@/hooks/useNearViewport";
import type { MinimalEvent } from "@/lib/noteRefs";
import { EmbeddedAudio, EmbeddedPictures } from "./EmbeddedMedia";
import { EmbeddedTrackCard } from "./EmbeddedTrackCard";

const ev = (kind: number, tags: string[][], content = ""): MinimalEvent => ({
  id: "d".repeat(64),
  kind,
  pubkey: "a".repeat(64),
  created_at: 1,
  content,
  tags,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  __resetNearViewport();
});

describe("a sensitive picture post in a quote", () => {
  const post = ev(20, [
    ["imeta", "url https://img.example/0.jpg", "m image/jpeg"],
    ["imeta", "url https://img.example/1.jpg", "m image/jpeg"],
    ["imeta", "url https://img.example/2.jpg", "m image/jpeg"],
    ["content-warning", "nudity"],
  ]);

  it("is one button, whatever the number of tiles", () => {
    renderWithProviders(<EmbeddedPictures event={post} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getAllByTestId("sensitive-tile")).toHaveLength(3);
  });

  it("once shown, focus moves to the first picture", () => {
    renderWithProviders(<EmbeddedPictures event={post} />);
    fireEvent.click(screen.getByRole("button"));
    const focused = document.activeElement as HTMLElement;
    expect(focused.querySelector("img")?.getAttribute("src")).toContain("0.jpg");
  });
});

describe("a quoted sound's length", () => {
  it("is read from its tags, not asked of the file", () => {
    const probe = vi.spyOn(window, "Audio");
    stubVisibleIntersectionObserver();
    renderWithProviders(
      <EmbeddedAudio event={ev(1222, [["imeta", "url https://x.test/v.m4a", "m audio/mp4", "duration 61"]])} />,
    );
    expect(screen.getByTestId("embedded-audio")).toHaveTextContent("1:01");
    expect(probe).not.toHaveBeenCalled();
  });

  it("a row with none is asked only once near the screen", () => {
    const probe = vi.spyOn(window, "Audio");
    // setup.ts's IntersectionObserver never reports: the row is far below.
    renderWithProviders(<EmbeddedTrackCard id="t" title="T" audio="https://x.test/far.mp3" />);
    expect(probe).not.toHaveBeenCalled();
  });

  it("a row near the screen asks, on a normal connection", () => {
    const probe = vi.spyOn(window, "Audio");
    stubVisibleIntersectionObserver();
    renderWithProviders(<EmbeddedTrackCard id="t" title="T" audio="https://x.test/near.mp3" />);
    expect(probe).toHaveBeenCalled();
  });

  it("not on a connection that asked to save data", () => {
    const probe = vi.spyOn(window, "Audio");
    stubVisibleIntersectionObserver();
    vi.stubGlobal("navigator", { ...navigator, connection: { saveData: true } });
    renderWithProviders(<EmbeddedTrackCard id="t" title="T" audio="https://x.test/slow.mp3" />);
    expect(probe).not.toHaveBeenCalled();
  });
});
