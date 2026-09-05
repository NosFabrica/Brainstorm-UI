// @vitest-environment jsdom
/**
 * One ledger for what occupies the bottom of the window — the phone tab bar,
 * the now-playing bar — so pages get room under all of it and every floating,
 * bottom-anchored thing (back to top, the scoring pill) sits above the stack
 * instead of on it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { bottomChromeTotal, registerBottomChrome, __resetBottomChrome } from "./bottomChrome";

const root = () => document.documentElement.style;

describe("bottomChrome — the stack of things at the bottom of the window", () => {
  afterEach(() => __resetBottomChrome());

  it("publishes each part and the total, and pads the page by the total", () => {
    // jsdom re-serialises calc(), so the total is read back from the ledger and
    // the CSS variables are checked for presence and parts.
    const offTab = registerBottomChrome("tabbar", "calc(4rem + env(safe-area-inset-bottom))");
    expect(root().getPropertyValue("--bs-chrome-tabbar")).toContain("4rem");
    expect(bottomChromeTotal()).toBe("calc(0px + calc(4rem + env(safe-area-inset-bottom)))");
    const offPlayer = registerBottomChrome("player", "56px");
    expect(root().getPropertyValue("--bs-chrome-player")).toBe("56px");
    expect(bottomChromeTotal()).toBe("calc(0px + calc(4rem + env(safe-area-inset-bottom)) + 56px)");
    expect(root().getPropertyValue("--bs-bottom-chrome")).toContain("56px");
    expect(document.body.style.paddingBottom).toContain("56px");
    offPlayer();
    expect(root().getPropertyValue("--bs-chrome-player")).toBe("");
    expect(bottomChromeTotal()).toBe("calc(0px + calc(4rem + env(safe-area-inset-bottom)))");
    expect(root().getPropertyValue("--bs-bottom-chrome")).not.toContain("56px");
    offTab();
    expect(bottomChromeTotal()).toBe("");
    expect(root().getPropertyValue("--bs-bottom-chrome")).toBe("");
    expect(document.body.style.paddingBottom).toBe("");
  });

  it("re-registering a key replaces its height", () => {
    registerBottomChrome("player", "56px");
    registerBottomChrome("player", "64px");
    expect(bottomChromeTotal()).toBe("calc(0px + 64px)");
  });
});
