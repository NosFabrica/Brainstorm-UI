// @vitest-environment jsdom
/**
 * Benjamin: "is there a more professional, enterprise, dope way for us to be
 * showing audio files when they are playing?" One signal, on the art: while a
 * track plays, the cover carries the moving equaliser — Spotify's playing
 * mark — and reveals pause on hover; the small bars beside the title are gone.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EmbeddedTrackCard } from "./EmbeddedTrackCard";

let state = { isActive: false, isPlaying: false, isLoading: false, isError: false, currentTime: 0, duration: 0 };
vi.mock("@/lib/audioPlayer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audioPlayer")>()),
  useTrackPlayer: () => state,
  useTrackDuration: () => 200,
}));

const track = { id: "t1", title: "Hand Me Down Heart", artist: "Joe Martin", cover: "https://img/hmdh.jpg", audio: "https://cdn/hmdh.mp3" };

describe("EmbeddedTrackCard — the playing mark lives on the cover", () => {
  it("idle: the cover offers Play and nothing moves", () => {
    state = { ...state, isActive: false, isPlaying: false };
    render(<EmbeddedTrackCard {...track} />);
    expect(screen.getByTestId("track-play")).toHaveAttribute("aria-label", "Play");
    expect(screen.queryByTestId("track-eq")).toBeNull();
  });

  it("playing: the equaliser dances on the cover, not beside the title", () => {
    state = { ...state, isActive: true, isPlaying: true, currentTime: 12, duration: 200 };
    render(<EmbeddedTrackCard {...track} />);
    const cover = screen.getByTestId("track-play");
    expect(cover).toHaveAttribute("aria-label", "Pause");
    const eq = within(cover).getByTestId("track-eq");
    expect(eq).toBeInTheDocument();
    expect(screen.getAllByTestId("track-eq")).toHaveLength(1);
    // The title still reads as the active one.
    expect(screen.getByText("Hand Me Down Heart").className).toMatch(/brand-link/);
  });

  it("paused: the cover keeps the frozen bars and offers Play", () => {
    state = { ...state, isActive: true, isPlaying: false, currentTime: 12, duration: 200 };
    render(<EmbeddedTrackCard {...track} />);
    const cover = screen.getByTestId("track-play");
    expect(cover).toHaveAttribute("aria-label", "Play");
    expect(within(cover).getByTestId("track-eq")).toBeInTheDocument();
  });
});
