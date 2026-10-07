import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wakeRelays = vi.fn();
const checkForUpdate = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());
let back: (awayMs: number, how: "visible" | "pageshow" | "online") => void = () => {};
let clock = 0;

vi.mock("@/lib/relayPool", () => ({ wakeRelays }));
vi.mock("@/lib/serviceWorker", () => ({ checkForUpdate }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries } }));
vi.mock("@/lib/appResume", () => ({
  onAppResume: (listener: typeof back) => {
    back = listener;
    return () => {};
  },
}));

const { REFRESH_AFTER_MS, UPDATE_CHECK_EVERY_MS, WAKE_AFTER_MS, startAppResume } = await import("./appResume");

beforeEach(() => {
  clock = 1_000_000;
  startAppResume(() => clock);
});
afterEach(() => vi.clearAllMocks());

describe("coming back to the app", () => {
  it("after a real absence, reconnects and looks for a deploy", () => {
    back(WAKE_AFTER_MS, "visible");
    expect(wakeRelays).toHaveBeenCalledTimes(1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("leaves the relays alone for a glance at another tab, but not when the connection is back", () => {
    back(800, "visible");
    expect(wakeRelays).not.toHaveBeenCalled();
    back(800, "online");
    expect(wakeRelays).toHaveBeenCalledTimes(1);
  });

  it("looks for a deploy at most every few minutes", () => {
    back(60_000, "visible");
    clock += 60_000;
    back(60_000, "visible");
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    clock += UPDATE_CHECK_EVERY_MS;
    back(60_000, "visible");
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("asks the API again only after a long absence", () => {
    back(REFRESH_AFTER_MS, "visible");
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
