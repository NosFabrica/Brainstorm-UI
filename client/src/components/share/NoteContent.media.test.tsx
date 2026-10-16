// @vitest-environment jsdom
/**
 * The files a note's words name, drawn where they are named: an extensionless
 * Blossom picture is a picture when its imeta says so, not a link. And a note
 * its creator marked sensitive (NIP-36) can always be shown: a note whose only
 * media are embeds or a link's picture gets one "Show media", and after any
 * reveal focus lands on what was shown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { stubVisibleIntersectionObserver } from "@/test/visibleIntersectionObserver";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
const unfurlMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: unfurlMock }));

import { NoteContent } from "./NoteContent";

const CW = { reason: "nsfw" };
const A = "https://blossom.example/" + "a".repeat(64);
const B = "https://blossom.example/" + "b".repeat(64);
const srcs = () =>
  Array.from(document.querySelectorAll("img:not([data-testid=favicon]), video, iframe")).map(
    (e) => e.getAttribute("src") ?? e.getAttribute("poster") ?? "",
  );

beforeEach(() => {
  unfurlMock.mockReset();
  unfurlMock.mockResolvedValue(null);
  stubVisibleIntersectionObserver();
});

describe("a file its imeta types, named in the words", () => {
  it("an extensionless picture is drawn in place, once each, never a link chip", () => {
    renderWithProviders(
      <NoteContent
        content={`look ${A} and ${B}.`}
        tags={[
          ["imeta", `url ${A}`, "m image/jpeg"],
          ["imeta", `url ${B}`, "m Image/JPEG"],
        ]}
      />,
    );
    expect(srcs().filter((s) => s.includes("aaaa"))).toHaveLength(1);
    expect(srcs().filter((s) => s.includes("bbbb"))).toHaveLength(1);
    expect(document.querySelector(`a[href="${A}"]`)).toBeNull();
    // The full stop after the last one stays words.
    expect(document.body).toHaveTextContent(/and\s*\./);
  });

  it("is covered with the note's other pictures when the note is sensitive", () => {
    renderWithProviders(
      <NoteContent content={`look ${A}`} tags={[["imeta", `url ${A}`, "m image/jpeg"]]} contentWarning={CW} />,
    );
    expect(srcs()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Show photo" }));
    expect(srcs().filter((s) => s.includes("aaaa"))).toHaveLength(1);
  });

  it("an extensionless sound or clip its imeta types plays in place", () => {
    renderWithProviders(
      <NoteContent
        content={`hear ${A} watch ${B}`}
        tags={[
          ["imeta", `url ${A}`, "m audio/mpeg"],
          ["imeta", `url ${B}`, "m video/mp4"],
        ]}
      />,
    );
    expect(screen.getByTestId("embedded-track")).toBeInTheDocument();
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("a link with no imeta, or an imeta that says nothing, stays a link", () => {
    renderWithProviders(<NoteContent content={`see ${A}`} tags={[["imeta", `url ${A}`]]} />);
    expect(srcs().filter((s) => s.includes("aaaa"))).toEqual([]);
  });
});

describe("a sensitive note whose only media are embeds or a link's picture", () => {
  it("offers one Show media, and showing it restores the embeds", () => {
    const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    renderWithProviders(<NoteContent content={`watch ${yt}\nand https://youtu.be/9bZkp7q19f0`} contentWarning={CW} />);
    expect(srcs()).toEqual([]);
    const show = screen.getAllByTestId("sensitive-show");
    expect(show).toHaveLength(1);
    expect(show[0]).toHaveTextContent("Show media");
    fireEvent.click(show[0]);
    expect(screen.queryByTestId("sensitive-show")).toBeNull();
    expect(screen.getAllByTestId("video-embed")).toHaveLength(2);
    // Focus lands on what was shown: the button that had it is gone.
    expect((document.activeElement as HTMLElement).getAttribute("data-testid")).toBe("note-revealed");
  });

  it("a link card's picture comes back once asked", async () => {
    unfurlMock.mockResolvedValue({
      kind: "page",
      title: "Story",
      description: "Words",
      image: "https://img.test/og-nsfw.jpg",
      siteName: null,
    });
    renderWithProviders(<NoteContent content="read https://news.test/story" linkCard contentWarning={CW} />);
    expect(await screen.findByTestId("link-card")).toHaveTextContent("Story");
    expect(srcs().filter((s) => s.includes("og-nsfw"))).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Show media" }));
    await waitFor(() => expect(srcs().filter((s) => s.includes("og-nsfw")).length).toBeGreaterThan(0));
  });

  it("a note that was never covered offers nothing", () => {
    renderWithProviders(<NoteContent content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    expect(screen.queryByTestId("sensitive-show")).toBeNull();
  });
});

describe("a sensitive live stream", () => {
  it("once shown, focus moves to the player", () => {
    renderWithProviders(<NoteContent content="live https://x.test/stream.m3u8" contentWarning={CW} />);
    fireEvent.click(screen.getByTestId("sensitive-show"));
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute("data-testid")).toBe("note-revealed");
    expect(focused.querySelector("[data-testid=note-live]")).not.toBeNull();
  });
});
