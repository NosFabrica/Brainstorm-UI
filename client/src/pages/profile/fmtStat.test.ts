import { describe, expect, it } from "vitest";
import { fmtStat } from "./ProfileIdentity";

describe("fmtStat", () => {
  it("is the full number under 10k and compact from there", () => {
    expect(fmtStat(9999)).toBe((9999).toLocaleString());
    expect(fmtStat(10000)).toBe("10K");
    expect(fmtStat(114_321)).toBe("114.3K");
  });
});
