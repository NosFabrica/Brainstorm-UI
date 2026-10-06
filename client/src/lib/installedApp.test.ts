import { afterEach, describe, expect, it, vi } from "vitest";

import { isInstalledPhoneApp } from "./installedApp";

function device({
  touch,
  standalone,
  iosStandalone = false,
}: {
  touch: boolean;
  standalone: boolean;
  iosStandalone?: boolean;
}) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: (q === "(pointer: coarse)" && touch) || (q === "(display-mode: standalone)" && standalone),
  }));
  vi.stubGlobal("navigator", { ...navigator, standalone: iosStandalone });
}

afterEach(() => vi.unstubAllGlobals());

describe("isInstalledPhoneApp", () => {
  it("is a home-screen app on a phone", () => {
    device({ touch: true, standalone: true });
    expect(isInstalledPhoneApp()).toBe(true);
  });

  it("knows iOS's own flag for it", () => {
    device({ touch: true, standalone: false, iosStandalone: true });
    expect(isInstalledPhoneApp()).toBe(true);
  });

  it("is not a phone's browser tab, nor a desktop's installed app (which keeps its extensions)", () => {
    device({ touch: true, standalone: false });
    expect(isInstalledPhoneApp()).toBe(false);
    device({ touch: false, standalone: true });
    expect(isInstalledPhoneApp()).toBe(false);
  });
});
