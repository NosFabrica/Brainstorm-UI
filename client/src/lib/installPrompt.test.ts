import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetInstallPrompt, installOffer, promptInstall, startInstallPrompt } from "./installPrompt";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

function device(ua: string, standalone = false) {
  vi.stubGlobal("navigator", { ...navigator, userAgent: ua });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" && standalone }));
}

function offerPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return event;
}

let started = false;
beforeEach(() => {
  __resetInstallPrompt();
  if (!started) startInstallPrompt();
  started = true;
});
afterEach(() => vi.unstubAllGlobals());

describe("the install offer", () => {
  it("is the browser's own prompt when it hands one over, kept from its infobar", async () => {
    device(ANDROID);
    expect(installOffer()).toBeNull();
    const event = offerPrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(installOffer()).toBe("prompt");
    expect(await promptInstall()).toBe(true);
    expect(event.prompt).toHaveBeenCalled();
    // Spent: the browser fires a fresh one if it can ask again.
    expect(installOffer()).toBeNull();
  });

  it("is the Share-sheet steps on an iPhone", () => {
    device(IPHONE);
    expect(installOffer()).toBe("ios");
  });

  it("is nothing inside the installed app, or once it's installed", () => {
    device(IPHONE, true);
    expect(installOffer()).toBeNull();
    device(ANDROID);
    offerPrompt();
    window.dispatchEvent(new Event("appinstalled"));
    expect(installOffer()).toBeNull();
  });
});
