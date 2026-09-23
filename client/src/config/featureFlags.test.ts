import { describe, expect, it, vi } from "vitest";
import { boolEnv } from "./featureFlags";

/**
 * The assumption that cost a release: `runtimeEnv` coerces every missing key to
 * `""`, never `undefined`, so if `""` reads as an explicit `false` the fallback
 * argument is dead for every flag in this app — and a flag that needs to
 * default ON silently stays off.
 */
describe("boolEnv", () => {
  it("treats an empty value as unset, so the fallback decides", () => {
    expect(boolEnv("", true)).toBe(true);
    expect(boolEnv("   ", true)).toBe(true);
    expect(boolEnv("", false)).toBe(false);
  });

  it("treats a missing value as unset too", () => {
    expect(boolEnv(undefined, true)).toBe(true);
    expect(boolEnv(undefined, false)).toBe(false);
  });

  it("only an explicit word overrides the fallback", () => {
    for (const on of ["true", "1", "yes", "on", "TRUE", " On "]) {
      expect(boolEnv(on, false)).toBe(true);
    }
    for (const off of ["false", "0", "no", "off", "OFF"]) {
      expect(boolEnv(off, true)).toBe(false);
    }
  });

  it("falls back on anything it doesn't recognise", () => {
    expect(boolEnv("maybe", true)).toBe(true);
    expect(boolEnv("maybe", false)).toBe(false);
  });
});

// The chart emits `""` for an unset flag, so this is the real wiring, not a
// hypothetical: both surviving flags must still read false when unset.
describe("FEATURES with nothing configured", () => {
  it("leaves the false-by-default flags off", async () => {
    vi.resetModules();
    vi.doMock("@/lib/runtimeEnv", () => ({
      env: { VITE_FEATURE_AGENT_SUITE: "", VITE_FEATURE_ASSISTANTS_ADMIN: "" },
    }));
    const { FEATURES } = await import("./featureFlags");
    expect(FEATURES.agentSuite).toBe(false);
    expect(FEATURES.assistantsAdmin).toBe(false);
    vi.doUnmock("@/lib/runtimeEnv");
    vi.resetModules();
  });
});
