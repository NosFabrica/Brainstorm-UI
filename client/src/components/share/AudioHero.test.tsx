// @vitest-environment jsdom
/**
 * A sound's page shows its cover art large. Art its creator marked sensitive
 * (NIP-36, any audio kind) waits behind a placeholder until the reader asks,
 * and the player bar is not handed it meanwhile.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MinimalEvent } from "@/lib/noteRefs";

const toggleTrack = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audioPlayer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audioPlayer")>()),
  toggleTrack,
  useTrackDuration: () => null,
}));

import { AudioHero } from "./AudioHero";

const track = (tags: string[][] = []): MinimalEvent => ({
  id: "e".repeat(64),
  pubkey: "p".repeat(64),
  created_at: 1,
  kind: 31337,
  content: "",
  tags: [
    ["d", "t"],
    ["title", "Blue Hour"],
    ["image", "https://x.test/cover.jpg"],
    ["url", "https://x.test/a.mp3"],
    ...tags,
  ],
});

const coverImg = () => document.querySelector('img[src*="cover.jpg"]');

describe("AudioHero — cover art", () => {
  it("shows the art", () => {
    render(<AudioHero event={track()} />);
    expect(coverImg()).not.toBeNull();
  });

  it("marked sensitive, shows a placeholder until asked; the player bar gets no art meanwhile", () => {
    for (const flag of [
      ["content-warning", "nsfw"],
      ["l", "nudity", "content-warning"],
    ]) {
      toggleTrack.mockClear();
      const { unmount } = render(<AudioHero event={track([flag])} />);
      expect(coverImg()).toBeNull();
      expect(screen.getByTestId("sensitive-tile")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("audio-hero-play"));
      expect(toggleTrack.mock.calls[0][2]).toMatchObject({ cover: undefined });
      fireEvent.click(screen.getByRole("button", { name: /Show sensitive cover/ }));
      expect(coverImg()).not.toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId("audio-hero-cover"));
      unmount();
    }
  });

  it("a reveal does not carry to the next sound", () => {
    const { rerender } = render(<AudioHero event={track([["content-warning", "x"]])} />);
    fireEvent.click(screen.getByRole("button", { name: /Show sensitive cover/ }));
    expect(coverImg()).not.toBeNull();
    rerender(<AudioHero event={{ ...track([["content-warning", "x"]]), id: "f".repeat(64) }} />);
    expect(coverImg()).toBeNull();
  });
});
