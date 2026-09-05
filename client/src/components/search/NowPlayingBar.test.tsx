// @vitest-environment jsdom
/**
 * Benjamin: "how does a user close out of the audio player? how does it
 * behave when they keep scrolling, or when there is overlapping content?"
 * One bar for the whole app, docked full width at the bottom, present
 * wherever you go while something plays; an X stops the sound and takes the
 * bar away; the page gets room under it, so nothing is covered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { closePlayer, setPlaylist, toggleTrack } from "@/lib/audioPlayer";
import { __resetBottomChrome } from "@/lib/bottomChrome";
const moreMock = vi.fn(async (_meta: unknown) => [] as import("@/lib/audioPlayer").PlaylistTrack[]);
vi.mock("@/lib/upNext", () => ({ moreFromArtist: (meta: unknown) => moreMock(meta) }));
import { NowPlayingBar } from "./NowPlayingBar";

describe("NowPlayingBar — the app's one player bar", () => {
  let pause: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    act(() => closePlayer());
    __resetBottomChrome();
  });
  afterEach(() => vi.restoreAllMocks());

  it("is absent until something plays, then names it, links it, and wears its art", () => {
    render(<NowPlayingBar />);
    expect(screen.queryByTestId("now-playing-bar")).toBeNull();
    act(() => toggleTrack("t1", "https://cdn/hmdh.mp3", { title: "Hand Me Down Heart", artist: "Joe Martin", cover: "https://img/hmdh.jpg", href: "/e/note1abc" }));
    const bar = screen.getByTestId("now-playing-bar");
    expect(bar).toHaveTextContent("Hand Me Down Heart");
    expect(screen.getByTestId("now-playing-link").getAttribute("href")).toBe("/e/note1abc");
    expect((screen.getByTestId("now-playing-backdrop") as HTMLImageElement).src).toBe("https://img/hmdh.jpg");
    // Docked: edge to edge, above whatever the phone keeps at the bottom.
    expect(bar.className).toMatch(/fixed/);
    expect(bar.className).toMatch(/inset-x-0/);
    expect(bar.style.bottom).toContain("--bs-chrome-tabbar");
  });

  it("a song on another site links out; the page makes room under the bar", () => {
    render(<NowPlayingBar />);
    act(() => toggleTrack("wavlake:1", "https://cdn/a.mp3", { title: "Two Ships", artist: "Ainsley", href: "https://wavlake.com/track/1" }));
    const link = screen.getByTestId("now-playing-link");
    expect(link.getAttribute("href")).toBe("https://wavlake.com/track/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(document.documentElement.style.getPropertyValue("--bs-chrome-player")).not.toBe("");
  });

  // Benjamin: should Next work when someone plays one track? It does — with
  // more from the same artist, found quietly; and the artist's name is the
  // way to their profile when they have one.
  it("a lone track gets an Up next from its artist, and the artist links to their profile", async () => {
    moreMock.mockResolvedValue([{ id: "t2", src: "https://cdn/t2.mp3", title: "Duende", artist: "NOVA" }]);
    render(<NowPlayingBar />);
    setPlaylist([]);
    act(() => toggleTrack("t1", "https://cdn/t1.mp3", { title: "Old Carbon", artist: "NOVA", artistHref: "/p/npub1nova", artistPubkey: "d".repeat(64) }));
    expect(screen.getByTestId("now-playing-artist").getAttribute("href")).toBe("/p/npub1nova");
    expect(screen.getByTestId("now-playing-next")).toBeDisabled();
    await screen.findByTestId("now-playing-up-next");
    expect(screen.getByTestId("now-playing-up-next")).toHaveTextContent("Duende");
    expect(moreMock).toHaveBeenCalledWith(expect.objectContaining({ id: "t1", artist: "NOVA", artistPubkey: "d".repeat(64) }));
    expect(screen.getByTestId("now-playing-next")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("now-playing-next"));
    expect(screen.getByTestId("now-playing-title")).toHaveTextContent("Duende");
  });

  it("the X stops the sound and takes the bar away, and the room goes with it", () => {
    render(<NowPlayingBar />);
    setPlaylist([{ id: "a", src: "https://cdn/a.mp3", title: "A" }, { id: "b", src: "https://cdn/b.mp3", title: "B" }]);
    act(() => toggleTrack("a", "https://cdn/a.mp3"));
    expect(screen.getByTestId("now-playing-bar")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("now-playing-close"));
    expect(screen.queryByTestId("now-playing-bar")).toBeNull();
    expect(pause).toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--bs-chrome-player")).toBe("");
    // Closed is closed: the queue does not carry on by itself.
    act(() => toggleTrack("a", "https://cdn/a.mp3"));
    expect(screen.getByTestId("now-playing-bar")).toHaveTextContent("A");
  });
});
