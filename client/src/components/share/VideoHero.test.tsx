// @vitest-environment jsdom
/**
 * NIP-71 video events (kinds 21 / 22 normal & short, 34235 / 34236 their
 * addressable twins) on the post page. Benjamin, over a DiVine short that
 * opened as a post with no video: "these divine videos should play." The
 * video URL carries no file extension — the imeta `m video/mp4` says what it
 * is — and the poster rides in imeta's `image`.
 */
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { __resetConnectionSpeed } from "@/lib/connection";
import { useAutoplayInView } from "@/lib/feedVideo";
import type { Nip05Status } from "@/lib/nip05";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";
import { fakePlayback } from "@/test/fakePlayback";

const requestNav = vi.fn();
vi.mock("@/components/share/ShareNavContext", () => ({ useShareNav: () => requestNav }));
const reduce = vi.hoisted(() => ({ on: false }));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => reduce.on }));
// What the handle's domain answered (lib/nip05): the check itself is not under test here.
const handle = vi.hoisted(() => ({ status: "unknown" as Nip05Status }));
vi.mock("@/hooks/useNip05", () => ({
  useNip05: (nip05?: string | null, pubkey?: string | null) => (nip05 && pubkey ? handle.status : "unknown"),
}));

import { VideoHero } from "./VideoHero";

const short = {
  id: "1".repeat(64),
  kind: 34236,
  pubkey: "9".repeat(64),
  created_at: 1_760_000_000,
  content: "Yep, in 2006 Eminem gifted Sir Elton John a pair of diamond-encrusted rings.",
  sig: "",
  tags: [
    ["d", "b0f9"],
    [
      "imeta",
      "url https://media.divine.video/b0f9046b98cc",
      "m video/mp4",
      "image https://media.divine.video/8cf94982",
      "dim 1080x1920",
    ],
    ["title", "#Today #June 21 #FunFact"],
    ["summary", "Yep, in 2006 Eminem gifted Sir Elton John a pair of rings."],
  ],
};

describe("VideoHero", () => {
  it("plays the imeta video with its poster, title and summary — extension or not", () => {
    render(<VideoHero event={short} />);
    const video = screen.getByTestId("video-hero-player") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://media.divine.video/b0f9046b98cc");
    expect(video.getAttribute("poster")).toBe("https://media.divine.video/8cf94982");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(screen.getByTestId("video-hero-title")).toHaveTextContent("#Today #June 21 #FunFact");
    expect(screen.getByText(/a pair of rings/)).toBeInTheDocument();
    // A portrait short stands upright, not stretched to a landscape box.
    expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-\[9\/16\]/);
  });

  it("a landscape video without imeta falls back to the url tag and a wide frame", () => {
    render(
      <VideoHero
        event={{
          ...short,
          kind: 21,
          tags: [
            ["url", "https://cdn.example/talk.mp4"],
            ["thumb", "https://cdn.example/talk.jpg"],
            ["title", "A talk"],
          ],
        }}
      />,
    );
    const video = screen.getByTestId("video-hero-player") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://cdn.example/talk.mp4");
    expect(video.getAttribute("poster")).toBe("https://cdn.example/talk.jpg");
    expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-video/);
  });

  // A short reads as a short: the right shape, looping, with what its own tags say about it.
  describe("a short reads as a short", () => {
    const withTags = (tags: string[][], kind = 34236) => ({ ...short, kind, tags });
    const imeta = (dim: string) => [
      "imeta",
      "url https://media.divine.video/b0f9046b98cc",
      "m video/mp4",
      "image https://media.divine.video/8cf94982",
      `dim ${dim}`,
    ];
    const vine = withTags([
      ["d", "iq3bXYa5duP"],
      [...imeta("480x480"), "duration 6"],
      ["title", "So cute"],
      ["summary", "So cute\n\nOriginal stats: 491 loops - 39 likes"],
      ["platform", "vine"],
      ["l", "vine-archive", "archive.divine.video"],
      ["loops", "1234567"],
      ["likes", "4"],
      ["published_at", "1399982400"],
      ["client", "vine-archive-importer"],
    ]);

    it("frames a square video square, and a portrait one upright", () => {
      const { unmount } = render(<VideoHero event={withTags([imeta("1080x1080")])} />);
      expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-square/);
      unmount();
      // A few pixels off square is still square.
      const near = render(<VideoHero event={withTags([imeta("1080x1040")])} />);
      expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-square/);
      near.unmount();
      render(<VideoHero event={withTags([imeta("1080x1920")])} />);
      expect(screen.getByTestId("video-hero-frame").className).toMatch(/aspect-\[9\/16\]/);
      expect(screen.getByTestId("video-hero-frame").className).not.toMatch(/aspect-square/);
    });

    it("loops a short, and never a full-length video", () => {
      const { unmount } = render(<VideoHero event={short} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(true);
      unmount();
      const twentyTwo = render(<VideoHero event={{ ...short, kind: 22 }} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(true);
      twentyTwo.unmount();
      const long = render(<VideoHero event={{ ...short, kind: 21 }} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(false);
      // Starting is the in-view watch's to do, for a short only: never the autoplay attribute.
      expect(screen.getByTestId("video-hero-player").hasAttribute("autoplay")).toBe(false);
      long.unmount();
      render(<VideoHero event={{ ...short, kind: 34235 }} />);
      expect(screen.getByTestId("video-hero-player").hasAttribute("loop")).toBe(false);
    });

    it("names the video for a screen reader by its alt, else its title", () => {
      const { unmount } = render(<VideoHero event={withTags([...short.tags, ["alt", "Two rings on a piano"]])} />);
      expect(screen.getByTestId("video-hero-player").getAttribute("aria-label")).toBe("Two rings on a piano");
      unmount();
      render(<VideoHero event={short} />);
      expect(screen.getByTestId("video-hero-player").getAttribute("aria-label")).toBe("#Today #June 21 #FunFact");
    });

    it("a restored Vine says how long it is and what Vine counted", () => {
      render(<VideoHero event={{ ...vine, created_at: 1_760_000_000 }} />);
      const facts = screen.getByTestId("video-hero-facts");
      expect(facts).toHaveTextContent(/^6s · 1,234,567 loops · 4 likes/);
      expect(within(facts).getByTestId("video-hero-vine")).toHaveTextContent("Classic Vine");
      // The date is the byline's to say, once.
      expect(facts).not.toHaveTextContent(/20\d\d/);
      // The summary was only the title and the stats again.
      expect(screen.queryByText(/Original stats/)).toBeNull();
      expect(screen.getAllByText("So cute")).toHaveLength(1);
    });

    it("a native short says its length, and nothing about Vine; a minute or more reads as m:ss", () => {
      render(<VideoHero event={withTags([...short.tags, ["duration", "65"]])} />);
      const facts = screen.getByTestId("video-hero-facts");
      expect(facts).toHaveTextContent(/^1:05$/);
    });

    it("has no facts line when the event gives none", () => {
      render(<VideoHero event={short} />);
      expect(screen.queryByTestId("video-hero-facts")).toBeNull();
    });

    it("offers the hashtags the words do not already carry, each a way to its tag", () => {
      render(
        <VideoHero
          event={withTags([
            ...short.tags.filter((t) => t[0] !== "summary"),
            ["summary", "Rings for #Elton, from Eminem."],
            ["t", "today"],
            ["t", "Elton"],
            ["t", "music"],
            ["t", "FunFact"],
            ["t", "history"],
          ])}
        />,
      );
      const chips = screen.getAllByTestId("video-hero-hashtag");
      expect(chips.map((c) => c.textContent)).toEqual(["#music", "#history"]);
      fireEvent.click(chips[0]);
      expect(requestNav).toHaveBeenLastCalledWith({ kind: "hashtag", target: "#music", label: "#music" });
    });

    it("offers twelve hashtags at most", () => {
      const many = Array.from({ length: 15 }, (_, i) => ["t", `tag${i + 1}`]);
      render(<VideoHero event={withTags([...short.tags, ...many])} />);
      const chips = screen.getAllByTestId("video-hero-hashtag");
      expect(chips).toHaveLength(12);
      expect(chips.at(-1)).toHaveTextContent("#tag12");
    });

    it("shows no hashtag row when the words carry them all", () => {
      render(<VideoHero event={withTags([...short.tags, ["t", "today"], ["t", "funfact"]])} />);
      expect(screen.queryByTestId("video-hero-hashtags")).toBeNull();
    });

    it("links to the video on Divine when it is Divine's, and not otherwise", () => {
      const { unmount } = render(<VideoHero event={vine} />);
      const link = screen.getByTestId("video-hero-divine");
      expect(link.getAttribute("href")).toBe("https://divine.video/video/iq3bXYa5duP");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link).toHaveTextContent("Watch on");
      expect(within(link).getByTestId("brand-divine")).toBeInTheDocument();
      unmount();
      render(
        <VideoHero
          event={withTags(
            [
              ["d", "talk"],
              ["url", "https://cdn.example/talk.mp4"],
              ["title", "A talk"],
            ],
            21,
          )}
        />,
      );
      expect(screen.queryByTestId("video-hero-divine")).toBeNull();
    });

    it("links to the creator's profile on Divine, for a video that is Divine's", () => {
      const { unmount } = render(<VideoHero event={vine} />);
      const link = screen.getByTestId("video-hero-divine-creator");
      expect(link.getAttribute("href")).toBe(`https://divine.video/profile/${nip19.npubEncode(vine.pubkey)}`);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link).toHaveTextContent("Creator on Divine");
      // Divine's wordmark is drawn once: on "Watch on".
      expect(screen.getAllByTestId("brand-divine")).toHaveLength(1);
      unmount();
      render(
        <VideoHero
          event={withTags(
            [
              ["d", "talk"],
              ["url", "https://cdn.example/talk.mp4"],
              ["title", "A talk"],
            ],
            21,
          )}
        />,
      );
      expect(screen.queryByTestId("video-hero-divine-creator")).toBeNull();
    });

    // The handle is a claim until its domain confirms it (Nip05Handle): only a confirmed one is said here.
    describe("the creator's handle", () => {
      afterEach(() => {
        handle.status = "unknown";
      });

      it("is shown, with its check, once the domain confirms it", () => {
        handle.status = "verified";
        render(<VideoHero event={vine} nip05="rabble@divine.video" />);
        const shown = screen.getByTestId("video-hero-handle");
        expect(shown).toHaveTextContent("rabble@divine.video");
        expect(shown.getAttribute("data-nip05-status")).toBe("verified");
        expect(shown.querySelector("svg")).not.toBeNull();
      });

      it("is shown for a handle on a subdomain of divine.video too", () => {
        handle.status = "verified";
        render(<VideoHero event={vine} nip05="_@rabble.divine.video" />);
        expect(screen.getByTestId("video-hero-handle")).toHaveTextContent("rabble.divine.video");
      });

      // Beside Divine's links a handle reads as Divine's word. One from anywhere else is the byline's to show.
      it("is left out when the handle is not on divine.video, confirmed or not", () => {
        handle.status = "verified";
        for (const nip05 of ["rabble@example.com", "rabble@notdivine.video", "rabble@divine.video.example.com"]) {
          const { unmount } = render(<VideoHero event={vine} nip05={nip05} />);
          expect(screen.queryByTestId("video-hero-handle")).toBeNull();
          unmount();
        }
      });

      it("is left out while unconfirmed, and when the domain names someone else", () => {
        const { unmount } = render(<VideoHero event={vine} nip05="rabble@divine.video" />);
        expect(screen.queryByTestId("video-hero-handle")).toBeNull();
        unmount();
        handle.status = "invalid";
        render(<VideoHero event={vine} nip05="rabble@divine.video" />);
        expect(screen.queryByTestId("video-hero-handle")).toBeNull();
      });

      it("is left out when the creator has none, and on a video that is not Divine's", () => {
        handle.status = "verified";
        const { unmount } = render(<VideoHero event={vine} />);
        expect(screen.queryByTestId("video-hero-handle")).toBeNull();
        unmount();
        render(
          <VideoHero event={withTags([["url", "https://cdn.example/talk.mp4"]], 21)} nip05="rabble@divine.video" />,
        );
        expect(screen.queryByTestId("video-hero-handle")).toBeNull();
      });
    });

    it("says where Divine recorded it, as Divine's own check", () => {
      const { unmount } = render(<VideoHero event={withTags([...short.tags, ["verification", "verified_mobile"]])} />);
      const chip = screen.getByTestId("video-hero-capture");
      expect(chip).toHaveTextContent("Recorded in the Divine app");
      expect(chip.getAttribute("title")).toBe("Divine's own capture check, not a Brainstorm trust score");
      unmount();
      const web = render(<VideoHero event={withTags([...short.tags, ["verification", "verified_web"]])} />);
      expect(screen.getByTestId("video-hero-capture")).toHaveTextContent("Recorded in Divine on the web");
      web.unmount();
      render(<VideoHero event={short} />);
      expect(screen.queryByTestId("video-hero-capture")).toBeNull();
    });
  });

  // The team's call (issue #212): on its own page a short starts by itself, muted, the way a
  // media card does. Never against the device's wishes, and never a video behind a warning.
  describe("a short starts by itself, muted", () => {
    let io: ReturnType<typeof stubControllableIntersectionObserver>;
    let play: ReturnType<typeof fakePlayback>;
    const flagged = { ...short, tags: [...short.tags, ["content-warning", "nudity"]] };
    const player = () => screen.getByTestId("video-hero-player") as HTMLVideoElement;
    const connection = (value: { saveData?: boolean; effectiveType?: string } | undefined) => {
      const listeners = new Set<() => void>();
      const live = value && {
        ...value,
        addEventListener: (_type: string, fn: () => void) => void listeners.add(fn),
        removeEventListener: (_type: string, fn: () => void) => void listeners.delete(fn),
      };
      Object.defineProperty(window.navigator, "connection", { value: live, configurable: true });
      __resetConnectionSpeed();
      /** The device reports a different connection while the page is open. */
      return (next: { saveData?: boolean; effectiveType?: string }) =>
        act(() => {
          Object.assign(live!, next);
          listeners.forEach((fn) => fn());
        });
    };

    beforeEach(() => {
      reduce.on = false;
      io = stubControllableIntersectionObserver();
      play = fakePlayback();
    });
    afterEach(() => {
      reduce.on = false;
      connection(undefined);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("once it is in view: muted, inline, and with its controls so the reader can turn the sound on", () => {
      render(<VideoHero event={short} />);
      expect(play).not.toHaveBeenCalled();
      expect(player().muted).toBe(true);
      expect(player().hasAttribute("playsinline")).toBe(true);
      expect(player().hasAttribute("controls")).toBe(true);
      io.bringAllIntoView();
      expect(play).toHaveBeenCalledTimes(1);
      expect(play.mock.contexts[0]).toBe(player());
    });

    it("a kind 22 short does too", () => {
      render(<VideoHero event={{ ...short, kind: 22 }} />);
      io.bringAllIntoView();
      expect(play).toHaveBeenCalledTimes(1);
      expect(player().muted).toBe(true);
    });

    it("never with reduced motion: it waits for the reader to press play", () => {
      reduce.on = true;
      render(<VideoHero event={short} />);
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      expect(player().muted).toBe(false);
      expect(player().hasAttribute("controls")).toBe(true);
    });

    it("never on a data saver or a slow connection", () => {
      connection({ saveData: true });
      const saver = render(<VideoHero event={short} />);
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      saver.unmount();
      connection({ effectiveType: "3g" });
      render(<VideoHero event={short} />);
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      expect(player().muted).toBe(false);
    });

    it("never a video its creator marked sensitive, before or after the reader asks to see it", () => {
      render(<VideoHero event={flagged} />);
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      // It waits, paused and with the sound as the reader left it, holding the focus.
      expect(player().muted).toBe(false);
      expect(document.activeElement).toBe(player());
    });

    it("never a full-length video (kinds 21 and 34235)", () => {
      const long = render(<VideoHero event={{ ...short, kind: 21 }} />);
      io.bringAllIntoView();
      long.unmount();
      render(<VideoHero event={{ ...short, kind: 34235 }} />);
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      expect(player().muted).toBe(false);
    });

    it("starts the next one when the page turns to another short", () => {
      const { rerender } = render(<VideoHero event={short} />);
      io.bringAllIntoView();
      const first = player();
      const next = {
        ...short,
        id: "2".repeat(64),
        tags: [
          ["d", "c1a2"],
          ["imeta", "url https://media.divine.video/c1a2", "m video/mp4", "dim 1080x1920"],
        ],
      };
      rerender(<VideoHero event={next} />);
      expect(player()).not.toBe(first);
      io.bringAllIntoView();
      expect(play.mock.contexts.at(-1)).toBe(player());
      expect(player().muted).toBe(true);
    });

    // An addressable video published again is a new event. With the same file it is the same video to the reader.
    it("keeps playing, untouched, when a newer version of the event carries the same file", () => {
      const { rerender } = render(<VideoHero event={short} />);
      io.bringAllIntoView();
      const first = player();
      first.muted = false;
      rerender(<VideoHero event={{ ...short, id: "2".repeat(64), created_at: short.created_at + 60 }} />);
      expect(player()).toBe(first);
      io.bringAllIntoView();
      expect(play).toHaveBeenCalledTimes(1);
      expect(player().muted).toBe(false);
    });

    // Muted once, as the watch begins. The device's connection changing is no reason to do it again.
    it("is not muted again, or started again, when the connection changes", () => {
      const change = connection({ effectiveType: "4g" });
      render(<VideoHero event={short} />);
      io.bringAllIntoView();
      expect(play).toHaveBeenCalledTimes(1);
      const first = player();
      first.muted = false;
      first.pause();
      change({ effectiveType: "3g" });
      change({ effectiveType: "4g" });
      io.bringAllIntoView();
      expect(player()).toBe(first);
      expect(player().muted).toBe(false);
      expect(player().paused).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
    });

    // The device stops allowing it while the video plays. What plays is left alone: stopping
    // it would be motion of its own. But the page does not start it again while that lasts.
    it("is left playing when reduced motion is turned on, and is not started again after a scroll away and back", () => {
      const { rerender } = render(<VideoHero event={short} />);
      io.bringAllIntoView();
      expect(player().paused).toBe(false);
      reduce.on = true;
      rerender(<VideoHero event={short} />);
      expect(player().paused).toBe(false);
      const watch = io.observers.find((o) => o.observed.has(player()))!;
      watch.report(player(), false);
      expect(player().paused).toBe(true);
      watch.report(player(), true);
      expect(player().paused).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
    });

    it("is left playing when a data saver is turned on, and is not started again after a scroll away and back", () => {
      const change = connection({ effectiveType: "4g" });
      render(<VideoHero event={short} />);
      io.bringAllIntoView();
      change({ saveData: true });
      expect(player().paused).toBe(false);
      const watch = io.observers.find((o) => o.observed.has(player()))!;
      watch.report(player(), false);
      watch.report(player(), true);
      expect(player().paused).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
      // Allowed again: the next time it comes into view it starts, as any video would.
      change({ saveData: false });
      watch.report(player(), false);
      watch.report(player(), true);
      expect(player().paused).toBe(false);
    });

    // A browser's first reading of the connection can be wrong for a moment (seen on a cold
    // load: slow, then normal). The video that appeared in that moment still gets its start.
    it("starts once the device allows it, for a video that appeared before it did", () => {
      const change = connection({ effectiveType: "3g" });
      render(<VideoHero event={short} />);
      io.bringAllIntoView();
      expect(play).not.toHaveBeenCalled();
      change({ effectiveType: "4g" });
      expect(player().muted).toBe(true);
      io.bringAllIntoView();
      expect(play).toHaveBeenCalledTimes(1);
      expect(play.mock.contexts[0]).toBe(player());
    });

    it("leaves the video to the reader when they started it before the device allowed it", () => {
      const change = connection({ effectiveType: "3g" });
      render(<VideoHero event={short} />);
      void player().play();
      change({ effectiveType: "4g" });
      // Their sound is not cut, and the page does not take the video over.
      expect(player().muted).toBe(false);
      expect(io.observers.some((o) => o.observed.has(player()))).toBe(false);
      expect(player().paused).toBe(false);
    });

    // A reply under the video can carry a clip of its own (FeedVideo, through the same watch).
    it("is the one that plays when another video on the page is in view too", () => {
      function ReplyClip() {
        const ref = useRef<HTMLVideoElement>(null);
        useAutoplayInView(ref, true);
        return <video ref={ref} data-testid="reply-clip" />;
      }
      render(
        <>
          <VideoHero event={short} />
          <ReplyClip />
        </>,
      );
      const see = (el: Element) => io.observers.find((o) => o.observed.has(el))!.report(el, true);
      see(player());
      see(screen.getByTestId("reply-clip"));
      expect(play).toHaveBeenCalledTimes(1);
      expect(play.mock.contexts[0]).toBe(player());
    });
  });

  // Safe by default: nothing of a video its creator marked sensitive is asked for until the reader says so.
  describe("a video its creator marked sensitive", () => {
    const flagged = { ...short, tags: [...short.tags, ["content-warning", "nudity"]] };

    it("is covered, with no player and no poster, until “Show video”", () => {
      render(<VideoHero event={flagged} />);
      const frame = screen.getByTestId("video-hero-frame");
      expect(within(frame).getByTestId("sensitive-cover")).toHaveTextContent(
        "The creator marked this video as sensitive: nudity",
      );
      expect(screen.queryByTestId("video-hero-player")).toBeNull();
      expect(frame.querySelector("video, img")).toBeNull();
      // The words stay: they are the creator's description, not the video.
      expect(screen.getByTestId("video-hero-title")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      expect(screen.queryByTestId("sensitive-cover")).toBeNull();
      const video = screen.getByTestId("video-hero-player");
      expect(video.getAttribute("src")).toBe("https://media.divine.video/b0f9046b98cc");
      expect(video.getAttribute("poster")).toBe("https://media.divine.video/8cf94982");
      // The button that had focus is gone: focus lands on what it revealed.
      expect(document.activeElement).toBe(video);
    });

    it("does not take focus for a video that was never covered", () => {
      render(<VideoHero event={short} />);
      expect(document.activeElement).toBe(document.body);
    });

    it("is covered again on a new visit", () => {
      const first = render(<VideoHero event={flagged} />);
      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      first.unmount();
      render(<VideoHero event={flagged} />);
      expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    });

    // The reveal is for one video: another flagged video drawn in the same place asks again.
    it("is covered again when the page turns to a different flagged video", () => {
      const { rerender } = render(<VideoHero event={flagged} />);
      fireEvent.click(screen.getByRole("button", { name: "Show video" }));
      expect(screen.getByTestId("video-hero-player")).toBeInTheDocument();
      rerender(<VideoHero event={{ ...flagged, id: "2".repeat(64) }} />);
      expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
      expect(screen.queryByTestId("video-hero-player")).toBeNull();
      // …and the first one, come back to, asks again too.
      rerender(<VideoHero event={flagged} />);
      expect(screen.getByTestId("sensitive-cover")).toBeInTheDocument();
    });

    it("covers a video labelled in the content-warning namespace too", () => {
      render(<VideoHero event={{ ...short, tags: [...short.tags, ["l", "violence", "content-warning"]] }} />);
      expect(screen.getByTestId("sensitive-cover")).toHaveTextContent(": violence");
      expect(screen.queryByTestId("video-hero-player")).toBeNull();
    });
  });
});
