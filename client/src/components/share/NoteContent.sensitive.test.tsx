// @vitest-environment jsdom
/**
 * A note its creator marked sensitive (NIP-36) shows none of its pictures
 * until the reader asks — not as the art of a sound it plays, not as a
 * YouTube still, a song card's cover or a link's preview image. After the
 * reader asks, focus lands on what was revealed: the button that had it is gone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
const unfurlMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: unfurlMock }));

import { NoteContent } from "./NoteContent";

const CW = { reason: "nsfw" };
/** Every picture, clip and frame the note asked the browser for. */
const srcs = () =>
  Array.from(document.querySelectorAll("img:not([data-testid=favicon]), video, iframe, source")).map(
    (e) => e.getAttribute("src") ?? e.getAttribute("poster") ?? "",
  );

beforeEach(() => {
  unfurlMock.mockReset();
  unfurlMock.mockResolvedValue(null);
  stubVisibleIntersectionObserver();
});

describe("a covered note — nothing pictured before it is asked for", () => {
  it("its sound plays without the note's picture as the art", () => {
    renderWithProviders(
      <NoteContent content="look https://x.test/nsfw.jpg and https://x.test/song.mp3" contentWarning={CW} />,
    );
    expect(screen.getByTestId("embedded-track")).toBeInTheDocument();
    expect(srcs().filter((s) => s.includes("nsfw"))).toEqual([]);
  });

  it("nor a picture only its imeta names", () => {
    renderWithProviders(
      <NoteContent
        content="https://x.test/song.mp3"
        tags={[["imeta", "url https://x.test/nsfw.png", "m image/png"]]}
        contentWarning={CW}
      />,
    );
    expect(srcs().filter((s) => s.includes("nsfw"))).toEqual([]);
  });

  it("its YouTube, Wavlake and Fountain links are plain links", () => {
    const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const wavlake = "https://wavlake.com/track/0b1d6c4e-1234-4abc-9def-0123456789ab";
    const fountain = "https://fountain.fm/episode/abc123";
    renderWithProviders(<NoteContent content={`${yt}\n${wavlake}\n${fountain}`} contentWarning={CW} />);
    expect(srcs()).toEqual([]);
    for (const url of [yt, wavlake, fountain]) expect(document.querySelector(`a[href="${url}"]`)).not.toBeNull();
  });

  it("its link's preview has no picture, and a link that is itself a picture is not drawn", async () => {
    unfurlMock.mockResolvedValue({
      kind: "page",
      title: "Story",
      description: "Words",
      image: "https://img.test/og-nsfw.jpg",
      siteName: null,
    });
    renderWithProviders(<NoteContent content="read https://news.test/story" linkCard contentWarning={CW} />);
    expect(await screen.findByTestId("link-card")).toHaveTextContent("Story");
    expect(srcs().filter((s) => s.includes("nsfw"))).toEqual([]);
  });

  it("a link the preview finds to be a picture or a clip stays unshown", async () => {
    unfurlMock.mockResolvedValue({ kind: "image", image: "https://img.test/nsfw-direct.jpg" });
    renderWithProviders(<NoteContent content="see https://img.test/nsfw-direct" linkCard contentWarning={CW} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId("link-image")).toBeNull();
    expect(srcs().filter((s) => s.includes("nsfw"))).toEqual([]);
  });

  it("once asked, shows everything and moves focus to the first picture", () => {
    renderWithProviders(
      <NoteContent content="a https://x.test/1.jpg b https://x.test/2.jpg" contentWarning={CW} reading />,
    );
    expect(srcs()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Show photos" }));
    expect(srcs().filter((s) => s.includes("x.test"))).toHaveLength(2);
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute("data-testid")).toBe("note-revealed");
    expect(focused.querySelector("img")?.getAttribute("src")).toContain("1.jpg");
  });
});

describe("a note's files drawn elsewhere on the page", () => {
  it("are left out of its words (skipUrls), so each is drawn and covered once", () => {
    renderWithProviders(
      <NoteContent
        content="Early start https://cdn.example/a.jpg"
        skipUrls={new Set(["https://cdn.example/a.jpg"])}
        contentWarning={CW}
      />,
    );
    expect(screen.queryByTestId("sensitive-cover")).toBeNull();
    expect(screen.queryByTestId("sensitive-tile")).toBeNull();
    expect(document.body).toHaveTextContent("Early start");
  });
});
