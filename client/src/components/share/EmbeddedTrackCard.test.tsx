// @vitest-environment jsdom
/**
 * Benjamin: "is there a more professional, enterprise, dope way for us to be
 * showing audio files when they are playing?" One signal, on the art: while a
 * track plays, the cover carries the moving equaliser — Spotify's playing
 * mark — and reveals pause on hover; the small bars beside the title are gone.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EmbeddedTrackCard } from "./EmbeddedTrackCard";

let state = { isActive: false, isPlaying: false, isLoading: false, isError: false, currentTime: 0, duration: 0 };
const toggleTrackMock = vi.fn();
vi.mock("@/lib/audioPlayer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audioPlayer")>()),
  useTrackPlayer: () => state,
  useTrackDuration: () => 200,
  toggleTrack: (...args: unknown[]) => toggleTrackMock(...args),
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

  // Benjamin: the source should show Wavlake's own mark, not the word in
  // capitals — and it is a badge, not a door: nothing here leaves Brainstorm.
  it("names its source with the source's mark, and the mark is no link", () => {
    state = { ...state, isActive: false, isPlaying: false };
    render(<EmbeddedTrackCard {...track} sourceLabel="Wavlake" sourceHost="wavlake.com" />);
    const chip = screen.getByTestId("track-source");
    expect(chip).toHaveTextContent("Wavlake");
    expect(chip.querySelector('[data-testid="favicon"]')).toHaveAttribute("src", expect.stringContaining("wavlake.com"));
    expect(chip.closest("a")).toBeNull();
    expect(chip.querySelector("a")).toBeNull();
  });
});

describe("EmbeddedTrackCard — a tap on the row plays, like Spotify", () => {
  // Benjamin (2026-09-24): users must find it because it works from what they
  // already know. In Spotify and Apple Music the row plays; the title opens.
  it("tapping the row plays the track; tapping the title opens it", () => {
    toggleTrackMock.mockClear();
    const onOpen = vi.fn();
    render(<EmbeddedTrackCard {...track} onOpen={onOpen} flat />);
    fireEvent.click(screen.getByTestId("embedded-track"));
    expect(toggleTrackMock).toHaveBeenCalledWith("t1", "https://cdn/hmdh.mp3", expect.objectContaining({ title: "Hand Me Down Heart" }));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Hand Me Down Heart"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(toggleTrackMock).toHaveBeenCalledTimes(1);
  });

  it("a row with nothing to play still opens on tap", () => {
    toggleTrackMock.mockClear();
    const onOpen = vi.fn();
    render(<EmbeddedTrackCard id="t2" title="Silent" onOpen={onOpen} flat />);
    fireEvent.click(screen.getByTestId("embedded-track"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(toggleTrackMock).not.toHaveBeenCalled();
  });
});
