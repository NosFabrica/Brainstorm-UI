import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPersistentStorage, keepStorageForInstalledApp } from "./persistentStorage";

const persist = vi.fn(() => Promise.resolve(true));
const persisted = vi.fn(() => Promise.resolve(false));

function device(installed: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" && installed }));
  vi.stubGlobal("navigator", { ...navigator, storage: { persist, persisted } });
}

beforeEach(() => {
  __resetPersistentStorage();
  persist.mockClear();
  persisted.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("keepStorageForInstalledApp", () => {
  it("asks once, in an installed app", async () => {
    device(true);
    keepStorageForInstalledApp();
    keepStorageForInstalledApp();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask again for storage already kept", async () => {
    device(true);
    persisted.mockResolvedValueOnce(true);
    keepStorageForInstalledApp();
    await settle();
    expect(persist).not.toHaveBeenCalled();
  });

  it("leaves a browser tab alone", async () => {
    device(false);
    keepStorageForInstalledApp();
    await settle();
    expect(persisted).not.toHaveBeenCalled();
  });
});
