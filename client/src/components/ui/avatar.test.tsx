// @vitest-environment jsdom
/** A long list of faces downloads each picture only as it comes near the screen. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { __resetNearViewport } from "@/hooks/useNearViewport";
import { __resetConnectionSpeed } from "@/lib/connection";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

const runtimeEnv = vi.hoisted(() => ({ env: { VITE_IMG_PROXY: "" } }));
vi.mock("@/lib/runtimeEnv", () => runtimeEnv);

let io: ReturnType<typeof stubControllableIntersectionObserver>;

const requested: FakeImage[] = [];
// Radix reuses one image per avatar and swaps its src, so every assignment is kept.
const assigned: string[] = [];
class FakeImage extends EventTarget {
  complete = false;
  naturalWidth = 0;
  #src = "";
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    if (value) assigned.push(value);
  }
  constructor() {
    super();
    requested.push(this);
  }
  finish(ok: boolean) {
    this.complete = ok;
    this.naturalWidth = ok ? 40 : 0;
    act(() => {
      this.dispatchEvent(new Event(ok ? "load" : "error"));
    });
  }
}

function Face({ size, src = "https://img.example/alice.jpg" }: { size?: "sm" | "lg"; src?: string }) {
  return (
    <Avatar>
      <AvatarImage src={src} alt="alice" size={size} />
      <AvatarFallback>AL</AvatarFallback>
    </Avatar>
  );
}


beforeEach(() => {
  requested.length = 0;
  assigned.length = 0;
  __resetNearViewport();
  __resetConnectionSpeed();
  vi.stubGlobal("Image", FakeImage);
  io = stubControllableIntersectionObserver();
});
afterEach(() => {
  vi.unstubAllGlobals();
  runtimeEnv.env.VITE_IMG_PROXY = "";
  Object.defineProperty(window.navigator, "connection", { value: undefined, configurable: true });
});

describe("AvatarImage", () => {
  it("doesn't request the picture until the avatar comes near the screen", () => {
    render(<Face />);
    expect(assigned).toEqual([]);
    expect(screen.getByText("AL")).toBeInTheDocument();

    io.bringAllIntoView();
    expect(assigned).toEqual(["https://img.example/alice.jpg"]);
    requested.at(-1)!.finish(true);
    expect(screen.getByAltText("alice")).toHaveAttribute("src", "https://img.example/alice.jpg");
  });

  it("keeps the fallback when the picture fails", () => {
    render(<Face />);
    io.bringAllIntoView();
    requested.at(-1)!.finish(false);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByAltText("alice")).toBeNull();
  });

  it("requests right away where there's no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Face />);
    expect(assigned).toEqual(["https://img.example/alice.jpg"]);
  });

  it("asks for no picture at all on a very slow connection", () => {
    Object.defineProperty(window.navigator, "connection", { value: { effectiveType: "2g" }, configurable: true });
    __resetConnectionSpeed();
    render(<Face />);
    io.bringAllIntoView();
    expect(assigned).toEqual([]);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});

describe("AvatarImage through the image proxy", () => {
  const ALICE = "https://img.example/alice.jpg";
  const thumb = (size: string) => `/img/insecure/avatar_${size}/plain/${encodeURIComponent(ALICE)}`;

  beforeEach(() => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
  });

  it("asks for the small thumbnail by default and the large one when told", () => {
    render(<Face />);
    render(<Face size="lg" />);
    io.bringAllIntoView();
    expect(assigned).toEqual([thumb("sm"), thumb("lg")]);
  });

  it("retries the original once on a normal connection, then falls back", () => {
    render(<Face />);
    io.bringAllIntoView();
    requested.at(-1)!.finish(false);
    expect(assigned).toEqual([thumb("sm"), ALICE]);

    requested.at(-1)!.finish(false);
    expect(assigned).toEqual([thumb("sm"), ALICE]);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows the original when the retry loads", () => {
    render(<Face />);
    io.bringAllIntoView();
    requested.at(-1)!.finish(false);
    requested.at(-1)!.finish(true);
    expect(screen.getByAltText("alice")).toHaveAttribute("src", ALICE);
  });

  it("tries the thumbnail again for a different picture after a fallback", () => {
    const BOB = "https://img.example/bob.jpg";
    const { rerender } = render(<Face />);
    io.bringAllIntoView();
    requested.at(-1)!.finish(false);
    rerender(<Face src={BOB} />);
    expect(assigned.at(-1)).toBe(`/img/insecure/avatar_sm/plain/${encodeURIComponent(BOB)}`);
  });

  it("keeps the fallback without retrying on a slow connection", () => {
    Object.defineProperty(window.navigator, "connection", { value: { effectiveType: "3g" }, configurable: true });
    __resetConnectionSpeed();
    render(<Face />);
    io.bringAllIntoView();
    requested.at(-1)!.finish(false);
    expect(assigned).toEqual([thumb("sm")]);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});
