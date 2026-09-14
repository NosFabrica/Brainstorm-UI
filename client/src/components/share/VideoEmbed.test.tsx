/**
 * A hosted video (YouTube, Vimeo) loads its player only when the reader hits
 * play — and from that tap it is what they chose to hear, so the music bar
 * yields (lib/playback; Benjamin, 2026-09-09).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VideoEmbed } from "./VideoEmbed";
import { installSoloPlayback, playSolo } from "@/lib/playback";

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe("VideoEmbed", () => {
  it("hitting play on a YouTube embed takes the floor from the music", () => {
    stop = installSoloPlayback(document);
    const music = { pause: vi.fn() };
    playSolo(music);
    render(<VideoEmbed url="https://youtu.be/dQw4w9WgXcQ" />);
    fireEvent.click(screen.getByRole("button", { name: /play youtube video/i }));
    expect(screen.getByTitle("YouTube video player")).toBeInTheDocument();
    expect(music.pause).toHaveBeenCalledTimes(1);
  });
});
