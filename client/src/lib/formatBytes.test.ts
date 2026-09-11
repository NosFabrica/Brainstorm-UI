import { describe, expect, it } from "vitest";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  it("speaks in the unit a person would pick", () => {
    expect(formatBytes(160171130)).toBe("153 MB"); // Primal's APK, live
    expect(formatBytes(1_300_000_000)).toBe("1.2 GB");
    expect(formatBytes(840_000)).toBe("820 KB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(0)).toBe("");
  });
});
