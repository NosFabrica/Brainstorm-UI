import { describe, expect, it, vi } from "vitest";

const runtimeEnv = vi.hoisted(() => ({ env: { VITE_IMG_PROXY: "" } }));
vi.mock("@/lib/runtimeEnv", () => runtimeEnv);

import { firstPreviewableLink, privateImageSrc } from "./DmLinkPreview";

describe("private link previews", () => {
  it("previews the first public link, never a local one", () => {
    expect(firstPreviewableLink("see https://example.com/a and https://b.org")).toBe("https://example.com/a");
    expect(firstPreviewableLink("my router http://192.168.1.1/admin")).toBeNull();
    expect(firstPreviewableLink("no links here")).toBeNull();
  });

  it("loads a preview picture only through the image proxy, never from the site", () => {
    runtimeEnv.env.VITE_IMG_PROXY = "";
    expect(privateImageSrc("https://example.com/og.png")).toBeNull();
    runtimeEnv.env.VITE_IMG_PROXY = "/img";
    expect(privateImageSrc("https://example.com/og.png")).toMatch(/^\/img\/insecure\/media_640\/plain\//);
    // An animated picture the proxy would pass through untouched is dropped, not loaded direct.
    expect(privateImageSrc("https://example.com/a.gif")).toBeNull();
  });
});
