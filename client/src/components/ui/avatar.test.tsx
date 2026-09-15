// @vitest-environment jsdom
/** A long list of faces downloads each picture only as it comes near the screen. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { __resetNearViewport } from "@/hooks/useNearViewport";
import { stubControllableIntersectionObserver } from "@/test/controllableIntersectionObserver";

let io: ReturnType<typeof stubControllableIntersectionObserver>;

const requested: FakeImage[] = [];
class FakeImage extends EventTarget {
  complete = false;
  naturalWidth = 0;
  src = "";
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

function Face() {
  return (
    <Avatar>
      <AvatarImage src="https://img.example/alice.jpg" alt="alice" />
      <AvatarFallback>AL</AvatarFallback>
    </Avatar>
  );
}

const srcs = () => requested.map((i) => i.src).filter(Boolean);

beforeEach(() => {
  requested.length = 0;
  __resetNearViewport();
  vi.stubGlobal("Image", FakeImage);
  io = stubControllableIntersectionObserver();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AvatarImage", () => {
  it("doesn't request the picture until the avatar comes near the screen", () => {
    render(<Face />);
    expect(srcs()).toEqual([]);
    expect(screen.getByText("AL")).toBeInTheDocument();

    io.bringAllIntoView();
    expect(srcs()).toEqual(["https://img.example/alice.jpg"]);
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
    expect(srcs()).toEqual(["https://img.example/alice.jpg"]);
  });
});
