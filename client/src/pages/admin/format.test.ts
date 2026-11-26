import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLatencyMs, formatNumber, formatRelativeAge, formatTimestamp, timeAgo, truncateError } from "./format";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

describe("formatNumber", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1_500)).toBe("1.5K");
    expect(formatNumber(2_340_000)).toBe("2.3M");
  });
});

describe("formatRelativeAge", () => {
  it("counts seconds, minutes and hours", () => {
    expect(formatRelativeAge(0, NOW)).toBe("—");
    expect(formatRelativeAge(NOW - 2_000, NOW)).toBe("just now");
    expect(formatRelativeAge(NOW - 30_000, NOW)).toBe("30s ago");
    expect(formatRelativeAge(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(formatRelativeAge(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("reads a backend timestamp without a zone as UTC", () => {
    expect(timeAgo("2026-10-22T11:00:00")).toBe("1h ago");
    expect(timeAgo("2026-10-22T11:00:00Z")).toBe("1h ago");
  });

  it("steps up from minutes to years", () => {
    expect(timeAgo(new Date(NOW - 10 * 60_000).toISOString())).toBe("10m ago");
    expect(timeAgo(new Date(NOW - 3 * 86_400_000).toISOString())).toBe("3d ago");
    expect(timeAgo(new Date(NOW - 14 * 86_400_000).toISOString())).toBe("2w ago");
    expect(timeAgo(new Date(NOW - 400 * 86_400_000).toISOString())).toBe("1y ago");
  });

  it("is empty for nothing or nonsense, and 'just now' for the future", () => {
    expect(timeAgo(undefined)).toBe("");
    expect(timeAgo("not a date")).toBe("");
    expect(timeAgo(new Date(NOW + 60_000).toISOString())).toBe("just now");
  });
});

describe("formatTimestamp", () => {
  it("keeps what it can't read", () => {
    expect(formatTimestamp("")).toBe("");
    expect(formatTimestamp("garbage")).toBe("garbage");
  });

  it("writes a date and a time", () => {
    expect(formatTimestamp("2026-10-22T11:00:00Z")).toMatch(/Oct 22, 2026/);
  });
});

describe("truncateError", () => {
  it("collapses whitespace and cuts long messages", () => {
    expect(truncateError("a   b\n c")).toBe("a b c");
    expect(truncateError("x".repeat(10), 4)).toBe("xxxx…");
  });
});

describe("formatLatencyMs", () => {
  const start = "2026-10-22T11:00:00Z";
  const after = (ms: number) => new Date(Date.parse(start) + ms).toISOString();

  it("writes the span between two timestamps", () => {
    expect(formatLatencyMs(start, after(500))).toBe("<1s");
    expect(formatLatencyMs(start, after(42_000))).toBe("42s");
    expect(formatLatencyMs(start, after(125_000))).toBe("2m 5s");
    expect(formatLatencyMs(start, after(120_000))).toBe("2m");
    expect(formatLatencyMs(start, after(3_900_000))).toBe("1h 5m");
  });

  it("has nothing for a backwards or unreadable span", () => {
    expect(formatLatencyMs(after(1_000), start)).toBeNull();
    expect(formatLatencyMs("nope", start)).toBeNull();
  });
});
