// @vitest-environment jsdom
/**
 * Videos that start by themselves when they scroll into view take turns: one
 * plays, the rest pause. A page that is about one video (the video page) names
 * it the lead. While the lead is in view it has the floor, and a clip in a
 * reply further down does not start by itself over it.
 */
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";
import { fakePlayback } from "@/test/fakePlayback";
import { useAutoplayInView } from "./feedVideo";

function Clip({
  id,
  lead,
  enabled = true,
  held = false,
}: {
  id: string;
  lead?: boolean;
  enabled?: boolean;
  held?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hold = useRef(held);
  useEffect(() => {
    hold.current = held;
  }, [held]);
  // Muted as it appears, as every caller's video is: a browser starts no other by itself.
  useEffect(() => {
    if (ref.current) ref.current.muted = true;
  }, []);
  useAutoplayInView(ref, enabled, lead, hold);
  return <video ref={ref} data-testid={id} />;
}

describe("useAutoplayInView", () => {
  let io: ReturnType<typeof stubControllableIntersectionObserver>;
  const see = (id: string, inView: boolean) => {
    const el = screen.getByTestId(id);
    io.observers.find((o) => o.observed.has(el))!.report(el, inView);
  };
  const video = (id: string) => screen.getByTestId(id) as HTMLVideoElement;
  const playing = (id: string) => !video(id).paused;
  /** The tab goes to the background, or comes back. */
  const tab = (state: "hidden" | "visible") => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(state === "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    io = stubControllableIntersectionObserver();
    fakePlayback();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("plays a video that comes into view, and pauses it when it leaves", () => {
    render(<Clip id="a" />);
    expect(playing("a")).toBe(false);
    see("a", true);
    expect(playing("a")).toBe(true);
    see("a", false);
    expect(playing("a")).toBe(false);
  });

  it("plays one at a time: the one that came into view last", () => {
    render(
      <>
        <Clip id="a" />
        <Clip id="b" />
      </>,
    );
    see("a", true);
    see("b", true);
    expect(playing("a")).toBe(false);
    expect(playing("b")).toBe(true);
  });

  // A clip in a feed is not the page's own: what it did before the lead existed, it still does.
  it("a feed clip paused by hand starts again when it comes back into view, and pauses out of view with the sound on", () => {
    render(<Clip id="a" />);
    see("a", true);
    video("a").pause();
    see("a", false);
    see("a", true);
    expect(playing("a")).toBe(true);
    video("a").muted = false;
    see("a", false);
    expect(playing("a")).toBe(false);
  });

  it("does nothing when it is off", () => {
    render(<Clip id="a" enabled={false} />);
    expect(io.observers.some((o) => o.observed.size > 0)).toBe(false);
    expect(playing("a")).toBe(false);
  });

  describe("with a lead", () => {
    it("the lead keeps the floor: another video coming into view beside it does not start", () => {
      render(
        <>
          <Clip id="hero" lead />
          <Clip id="reply" />
        </>,
      );
      see("hero", true);
      see("reply", true);
      expect(playing("hero")).toBe(true);
      expect(playing("reply")).toBe(false);
    });

    it("the lead takes over from a video that was already playing", () => {
      render(
        <>
          <Clip id="hero" lead />
          <Clip id="reply" />
        </>,
      );
      see("reply", true);
      expect(playing("reply")).toBe(true);
      see("hero", true);
      expect(playing("hero")).toBe(true);
      expect(playing("reply")).toBe(false);
    });

    it("once the lead has left view, another video starts as it would anywhere", () => {
      render(
        <>
          <Clip id="hero" lead />
          <Clip id="reply" />
        </>,
      );
      see("hero", true);
      see("hero", false);
      expect(playing("hero")).toBe(false);
      see("reply", true);
      expect(playing("reply")).toBe(true);
    });

    // The page's player always shows its controls. A pause there is the reader's word: the
    // watch does not start the video again, however the page is scrolled, until they press play.
    describe("a pause the reader made", () => {
      it("holds through a scroll that keeps the video in view", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").pause();
        see("hero", true);
        expect(playing("hero")).toBe(false);
      });

      it("holds after the video has left view and come back", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").pause();
        see("hero", false);
        see("hero", true);
        expect(playing("hero")).toBe(false);
      });

      it("ends when the reader presses play: the watch has the video again", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").pause();
        void video("hero").play();
        expect(playing("hero")).toBe(true);
        see("hero", false);
        expect(playing("hero")).toBe(false);
        see("hero", true);
        expect(playing("hero")).toBe(true);
      });

      it("is not what the watch's own pause is: scrolled away and back, the video starts again", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        see("hero", false);
        expect(playing("hero")).toBe(false);
        see("hero", true);
        expect(playing("hero")).toBe(true);
      });
    });

    // The reader turned the sound on: they chose to listen, and may read on while they do.
    describe("with the sound on", () => {
      it("keeps playing when it scrolls out of view, where a muted one pauses", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        see("hero", false);
        expect(playing("hero")).toBe(false);
        see("hero", true);
        video("hero").muted = false;
        see("hero", false);
        expect(playing("hero")).toBe(true);
      });

      it("keeps the floor out of view: a clip in a reply does not start over the sound", () => {
        render(
          <>
            <Clip id="hero" lead />
            <Clip id="reply" />
          </>,
        );
        see("hero", true);
        video("hero").muted = false;
        see("hero", false);
        see("reply", true);
        expect(playing("hero")).toBe(true);
        expect(playing("reply")).toBe(false);
      });
    });

    describe("when the tab goes to the background", () => {
      it("pauses while muted, and plays again when the tab is back", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        tab("hidden");
        expect(playing("hero")).toBe(false);
        tab("visible");
        expect(playing("hero")).toBe(true);
      });

      it("leaves a video the reader paused as it is, on the way out and on the way back", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").pause();
        tab("hidden");
        tab("visible");
        expect(playing("hero")).toBe(false);
      });

      it("does not bring back a video that was out of view", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        see("hero", false);
        tab("hidden");
        tab("visible");
        expect(playing("hero")).toBe(false);
      });

      it("keeps playing with the sound on", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").muted = false;
        tab("hidden");
        expect(playing("hero")).toBe(true);
      });

      // With the sound on, a pause in a tab nobody is looking at is still somebody's: a media
      // key, the browser's own media controls, a phone's notification. It is the reader's, and holds.
      it("takes a pause with the sound on, in a hidden tab, for the reader's: started by the watch", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").muted = false;
        tab("hidden");
        video("hero").pause();
        tab("visible");
        expect(playing("hero")).toBe(false);
        see("hero", true);
        expect(playing("hero")).toBe(false);
      });

      it("takes a pause with the sound on, in a hidden tab, for the reader's: started by the reader", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").pause();
        video("hero").muted = false;
        void video("hero").play();
        tab("hidden");
        video("hero").pause();
        tab("visible");
        expect(playing("hero")).toBe(false);
        see("hero", true);
        expect(playing("hero")).toBe(false);
      });

      // Some browsers stop a muted video themselves in a tab nobody can see, before or without
      // telling the page the tab was hidden. Nobody was at the controls: that is not the reader's pause.
      it("does not take a muted video's pause in a hidden tab for the reader's", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        video("hero").pause();
        tab("visible");
        expect(playing("hero")).toBe(true);
      });

      it("does not start in a tab that opened in the background, until the tab is in front", () => {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        render(<Clip id="hero" lead />);
        see("hero", true);
        expect(playing("hero")).toBe(false);
        tab("visible");
        expect(playing("hero")).toBe(true);
      });

      it("leaves a video the reader started themselves alone", () => {
        render(<Clip id="hero" lead />);
        see("hero", true);
        video("hero").pause();
        void video("hero").play();
        tab("hidden");
        expect(playing("hero")).toBe(true);
      });
    });

    // The device stopped allowing it after the video began (reduced motion or a data saver
    // turned on): what plays is left alone, and the watch starts nothing while that lasts.
    describe("held back after it began", () => {
      it("is not stopped, and is not started again after a scroll away and back", () => {
        const { rerender } = render(<Clip id="hero" lead />);
        see("hero", true);
        rerender(<Clip id="hero" lead held />);
        expect(playing("hero")).toBe(true);
        see("hero", false);
        expect(playing("hero")).toBe(false);
        see("hero", true);
        expect(playing("hero")).toBe(false);
      });

      it("is not started again when the tab comes back", () => {
        const { rerender } = render(<Clip id="hero" lead />);
        see("hero", true);
        rerender(<Clip id="hero" lead held />);
        tab("hidden");
        expect(playing("hero")).toBe(false);
        tab("visible");
        expect(playing("hero")).toBe(false);
      });

      it("starts again once the hold is off and it comes into view", () => {
        const { rerender } = render(<Clip id="hero" lead held />);
        see("hero", true);
        expect(playing("hero")).toBe(false);
        rerender(<Clip id="hero" lead />);
        see("hero", false);
        see("hero", true);
        expect(playing("hero")).toBe(true);
      });
    });

    // A start the browser turned down (a file it cannot play) fires no `play` event. Nothing is
    // left owed: the reader's own play, later, is read as theirs.
    it("owes nothing for a start the browser turned down", async () => {
      vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() =>
        Promise.reject(Object.assign(new Error("no supported source"), { name: "NotSupportedError" })),
      );
      render(<Clip id="hero" lead />);
      see("hero", true);
      await Promise.resolve();
      await Promise.resolve();
      expect(playing("hero")).toBe(false);
      // The reader presses play. It is theirs, so a tab going to the background leaves it alone.
      void video("hero").play();
      tab("hidden");
      expect(playing("hero")).toBe(true);
    });

    it("a lead that is gone no longer holds the floor", () => {
      const { rerender } = render(
        <>
          <Clip id="hero" lead />
          <Clip id="reply" />
        </>,
      );
      see("hero", true);
      rerender(<Clip id="reply" />);
      see("reply", true);
      expect(playing("reply")).toBe(true);
    });
  });
});
