// @vitest-environment jsdom
/** Profile pictures drawn as plain images follow the same thumbnail and retry rule as avatars. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfileImg } from "./profile-img";
import { __resetConnectionSpeed } from "@/lib/connection";

const runtimeEnv = vi.hoisted(() => ({ env: { VITE_IMG_PROXY: "" } }));
vi.mock("@/lib/runtimeEnv", () => runtimeEnv);

const ALICE = "https://img.example/alice.jpg";
const thumb = `/img/insecure/avatar_sm/plain/${encodeURIComponent(ALICE)}`;

function stubConnection(effectiveType?: string) {
  Object.defineProperty(window.navigator, "connection", {
    value: effectiveType ? { effectiveType } : undefined,
    configurable: true,
  });
  __resetConnectionSpeed();
}

beforeEach(() => {
  runtimeEnv.env.VITE_IMG_PROXY = "/img";
  stubConnection(undefined);
});
afterEach(() => {
  runtimeEnv.env.VITE_IMG_PROXY = "";
  stubConnection(undefined);
});

describe("ProfileImg", () => {
  it("asks the proxy for a small thumbnail", () => {
    render(<ProfileImg src={ALICE} alt="alice" />);
    expect(screen.getByAltText("alice")).toHaveAttribute("src", thumb);
  });

  it("keeps the original URL when the proxy is off", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "";
    render(<ProfileImg src={ALICE} alt="alice" />);
    expect(screen.getByAltText("alice")).toHaveAttribute("src", ALICE);
  });

  it("falls back to the original once when the thumbnail fails", () => {
    render(<ProfileImg src={ALICE} alt="alice" />);
    fireEvent.error(screen.getByAltText("alice"));
    expect(screen.getByAltText("alice")).toHaveAttribute("src", ALICE);
  });

  it("keeps the thumbnail on a slow connection, failure or not", () => {
    stubConnection("3g");
    render(<ProfileImg src={ALICE} alt="alice" />);
    fireEvent.error(screen.getByAltText("alice"));
    expect(screen.getByAltText("alice")).toHaveAttribute("src", thumb);
  });

  it("draws nothing on a very slow connection", () => {
    stubConnection("2g");
    render(<ProfileImg src={ALICE} alt="alice" />);
    expect(screen.queryByAltText("alice")).toBeNull();
  });

  it("still calls a caller's own onError", () => {
    const onError = vi.fn();
    render(<ProfileImg src={ALICE} alt="alice" onError={onError} />);
    fireEvent.error(screen.getByAltText("alice"));
    expect(onError).toHaveBeenCalledOnce();
  });
});
