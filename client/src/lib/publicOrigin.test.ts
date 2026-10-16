// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeEnv = vi.hoisted(() => ({ env: { VITE_PUBLIC_ORIGIN: "" } }));
vi.mock("@/lib/runtimeEnv", () => runtimeEnv);

import { publicOrigin, publicPageUrl } from "./publicOrigin";

beforeEach(() => {
  runtimeEnv.env.VITE_PUBLIC_ORIGIN = "";
  window.history.replaceState(null, "", "/p/npub1abc?tab=notes#top");
});

describe("publicOrigin", () => {
  it("is this page's origin when unset", () => {
    expect(publicOrigin()).toBe(window.location.origin);
  });

  it("is the configured origin, without a trailing slash", () => {
    runtimeEnv.env.VITE_PUBLIC_ORIGIN = "https://brainstorm.world/";
    expect(publicOrigin()).toBe("https://brainstorm.world");
  });
});

describe("publicPageUrl", () => {
  it("keeps path, query and hash on the configured origin", () => {
    runtimeEnv.env.VITE_PUBLIC_ORIGIN = "https://brainstorm.world";
    expect(publicPageUrl()).toBe("https://brainstorm.world/p/npub1abc?tab=notes#top");
  });

  it("is this page's URL when unset", () => {
    expect(publicPageUrl()).toBe(window.location.href);
  });
});
