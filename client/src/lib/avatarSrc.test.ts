/** Profile pictures ask the image proxy for a thumbnail, or keep their original URL when it's off. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarSrc } from "./avatarSrc";

const runtimeEnv = vi.hoisted(() => ({ env: { VITE_IMG_PROXY: "" } }));
vi.mock("@/lib/runtimeEnv", () => runtimeEnv);

afterEach(() => {
  runtimeEnv.env.VITE_IMG_PROXY = "";
});

describe("avatarSrc", () => {
  it("keeps the original when the proxy is off", () => {
    expect(avatarSrc("https://img.example/a.jpg", "sm")).toBe("https://img.example/a.jpg");
  });

  it("asks the proxy for the preset matching the size, with the source encoded", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
    const url = "https://img.example/a b.jpg?v=2&x=@1";
    expect(avatarSrc(url, "sm")).toBe(`/img/insecure/avatar_sm/plain/${encodeURIComponent(url)}`);
    expect(avatarSrc("http://img.example/a.png", "lg")).toBe(`/img/insecure/avatar_lg/plain/${encodeURIComponent("http://img.example/a.png")}`);
  });

  it("tolerates a trailing slash on the prefix", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img/";
    expect(avatarSrc("https://img.example/a.jpg", "sm")).toMatch(/^\/img\/insecure\//);
  });

  it("leaves anything that isn't http(s) alone", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
    for (const url of ["data:image/png;base64,AAAA", "/brand/default-avatar.png", "blob:https://x/1", ""]) {
      expect(avatarSrc(url, "sm")).toBe(url);
    }
  });
});
