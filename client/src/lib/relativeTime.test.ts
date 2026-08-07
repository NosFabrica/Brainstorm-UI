import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeTime, relativeTimeShort } from "./relativeTime";

/** Pin "now" so these assert on formatting, not on when the suite runs. */
const NOW = 1_800_000_000; // seconds
const ago = (secs: number) => NOW - secs;

function freeze() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
}
afterEach(() => vi.useRealTimers());

describe("relativeTime", () => {
  it("covers each band", () => {
    freeze();
    expect(relativeTime(ago(5))).toBe("just now");
    expect(relativeTime(ago(3 * 60))).toBe("3m ago");
    expect(relativeTime(ago(2 * 3600))).toBe("2h ago");
    expect(relativeTime(ago(5 * 86400))).toBe("5d ago");
    expect(relativeTime(ago(70 * 86400))).toBe("2mo ago");
    expect(relativeTime(ago(800 * 86400))).toBe("2y ago");
  });

  it("returns nothing for a missing timestamp", () => {
    // 0 means "never happened" on several tag records. Formatting it would
    // print the epoch as a date half a century ago.
    expect(relativeTime(0)).toBe("");
    expect(relativeTimeShort(0)).toBe("");
  });

  it("never reads as the future when a relay's clock runs ahead", () => {
    freeze();
    expect(relativeTime(NOW + 3600)).toBe("just now");
    expect(relativeTimeShort(NOW + 3600)).toBe("now");
  });

  it("switches band exactly on the boundary, not before", () => {
    freeze();
    expect(relativeTime(ago(59))).toBe("just now");
    expect(relativeTime(ago(60))).toBe("1m ago");
    expect(relativeTime(ago(3599))).toBe("59m ago");
    expect(relativeTime(ago(3600))).toBe("1h ago");
  });

  it("drops the word for the compact form", () => {
    freeze();
    expect(relativeTimeShort(ago(5))).toBe("now");
    expect(relativeTimeShort(ago(3 * 60))).toBe("3m");
    expect(relativeTimeShort(ago(2 * 3600))).toBe("2h");
    expect(relativeTimeShort(ago(70 * 86400))).toBe("2mo");
  });
});
