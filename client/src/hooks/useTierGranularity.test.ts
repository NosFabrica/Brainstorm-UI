// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getTierGranularity, setTierGranularity } from "./useTierGranularity";

describe("tier granularity store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to simple — decision 8: three buckets for everyone, existing users included", () => {
    expect(getTierGranularity()).toBe("simple");
  });

  it("round-trips a choice", () => {
    setTierGranularity("detailed");
    expect(getTierGranularity()).toBe("detailed");
    setTierGranularity("simple");
    expect(getTierGranularity()).toBe("simple");
  });

  it("scopes per account, so a second login keeps its own choice", () => {
    localStorage.setItem("nostr_user", JSON.stringify({ pubkey: "aaa" }));
    setTierGranularity("detailed");
    localStorage.setItem("nostr_user", JSON.stringify({ pubkey: "bbb" }));
    expect(getTierGranularity()).toBe("simple");
  });

  it("ignores garbage in storage", () => {
    localStorage.setItem("brainstorm_tier_granularity:anon", "seven");
    expect(getTierGranularity()).toBe("simple");
  });
});
