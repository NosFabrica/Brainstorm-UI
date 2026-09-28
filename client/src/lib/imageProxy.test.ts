/** Note and card pictures ask the proxy for the size they are drawn, except when they move. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxiedSrc } from "./imageProxy";

const runtimeEnv = vi.hoisted(() => ({ env: { VITE_IMG_PROXY: "" } }));
vi.mock("@/lib/runtimeEnv", () => runtimeEnv);

afterEach(() => {
  runtimeEnv.env.VITE_IMG_PROXY = "";
});

const NOTE = "https://media.example/photo.jpg";

describe("proxiedSrc", () => {
  it("keeps the original when the proxy is off", () => {
    expect(proxiedSrc(NOTE, "media_1280")).toBe(NOTE);
  });

  it("asks for the preset it is given", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
    for (const preset of ["media_320", "media_640", "media_1280"] as const) {
      expect(proxiedSrc(NOTE, preset)).toBe(`/img/insecure/${preset}/plain/${encodeURIComponent(NOTE)}`);
    }
  });

  it("leaves animated pictures alone — a still GIF is a broken post", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
    expect(proxiedSrc("https://media.example/loop.gif", "media_640")).toBe("https://media.example/loop.gif");
    expect(proxiedSrc("https://media.example/loop.GIF?x=1", "media_640")).toBe("https://media.example/loop.GIF?x=1");
    // A declared mime wins over the extension, either way round.
    expect(proxiedSrc("https://media.example/x", "media_640", "image/gif")).toBe("https://media.example/x");
    expect(proxiedSrc("https://media.example/still.gif", "media_640", "image/jpeg")).toMatch(/^\/img\//);
  });

  it("leaves anything that isn't http(s) alone", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
    expect(proxiedSrc("data:image/png;base64,AAA", "media_320")).toBe("data:image/png;base64,AAA");
  });
});
