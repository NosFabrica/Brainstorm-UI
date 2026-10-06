import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wakeRelays = vi.fn();
const checkForUpdate = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());
let back: (awayMs: number) => void = () => {};

vi.mock("@/lib/relayPool", () => ({ wakeRelays }));
vi.mock("@/lib/serviceWorker", () => ({ checkForUpdate }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries } }));
vi.mock("@/lib/appResume", () => ({
  onAppResume: (listener: (awayMs: number) => void) => {
    back = listener;
    return () => {};
  },
}));

const { REFRESH_AFTER_MS, startAppResume } = await import("./appResume");

beforeEach(() => startAppResume());
afterEach(() => vi.clearAllMocks());

describe("coming back to the app", () => {
  it("reconnects and looks for a deploy every time", () => {
    back(5000);
    expect(wakeRelays).toHaveBeenCalledTimes(1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("asks the API again only after a long absence", () => {
    back(REFRESH_AFTER_MS);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
