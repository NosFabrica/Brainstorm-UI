import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onAppResume } from "./appResume";

let visibility: DocumentVisibilityState = "visible";
let clock = 0;
const now = () => clock;

function hide() {
  visibility = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
}
function show() {
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  visibility = "visible";
  clock = 100_000;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => vi.restoreAllMocks());

describe("onAppResume", () => {
  it("says the app is back, and how long it was hidden", () => {
    const seen: number[] = [];
    const stop = onAppResume((away) => seen.push(away), now);
    hide();
    clock += 90_000;
    show();
    stop();
    expect(seen).toEqual([90_000]);
  });

  it("counts a return from offline too, from when the connection went", () => {
    const seen: number[] = [];
    const stop = onAppResume((away) => seen.push(away), now);
    window.dispatchEvent(new Event("offline"));
    clock += 30_000;
    window.dispatchEvent(new Event("online"));
    stop();
    expect(seen).toEqual([30_000]);
  });

  it("counts a page restored from the back/forward cache, and not an ordinary load", () => {
    const seen: number[] = [];
    const stop = onAppResume((away) => seen.push(away), now);
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    stop();
    expect(seen).toEqual([0]);
  });

  it("counts one return once, when it shows and comes online together", () => {
    const seen: number[] = [];
    const stop = onAppResume((away) => seen.push(away), now);
    hide();
    clock += 5000;
    show();
    clock += 200;
    window.dispatchEvent(new Event("online"));
    stop();
    expect(seen).toEqual([5000]);
  });

  it("waits for the reader when the connection comes back in the background, and counts the whole absence", () => {
    const seen: number[] = [];
    const stop = onAppResume((away) => seen.push(away), now);
    hide();
    clock += 60 * 60_000;
    window.dispatchEvent(new Event("online"));
    expect(seen).toEqual([]);
    clock += 60 * 60_000;
    show();
    stop();
    expect(seen).toEqual([2 * 60 * 60_000]);
  });

  it("says how it came back", () => {
    const seen: string[] = [];
    const stop = onAppResume((_away, how) => seen.push(how), now);
    hide();
    show();
    clock += 5000;
    window.dispatchEvent(new Event("online"));
    stop();
    expect(seen).toEqual(["visible", "online"]);
  });

  it("hears nothing once stopped", () => {
    const listener = vi.fn();
    onAppResume(listener, now)();
    hide();
    show();
    expect(listener).not.toHaveBeenCalled();
  });
});
