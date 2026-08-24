// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getScoreDisplayMode,
  setScoreDisplayMode,
} from "./useScoreDisplayMode";

/**
 * The store, not the hook — the hook is the useActivePov pattern verbatim and
 * React Testing Library isn't in this harness. What can actually be wrong here:
 * the default, the per-account scoping, and garbage in storage.
 */
describe("score display mode store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to word — team review: ring + tier label is the face now", () => {
    expect(getScoreDisplayMode()).toBe("word");
  });

  it("round-trips a choice", () => {
    setScoreDisplayMode("level");
    expect(getScoreDisplayMode()).toBe("level");
    setScoreDisplayMode("tier");
    expect(getScoreDisplayMode()).toBe("tier");
    setScoreDisplayMode("word");
    expect(getScoreDisplayMode()).toBe("word");
    setScoreDisplayMode("off");
    expect(getScoreDisplayMode()).toBe("off");
  });

  it("scopes per account, so a second login keeps its own choice", () => {
    localStorage.setItem("nostr_user", JSON.stringify({ pubkey: "aaa" }));
    setScoreDisplayMode("tier");
    expect(getScoreDisplayMode()).toBe("tier");
    // Switch accounts: the other account never chose, so the default applies.
    localStorage.setItem("nostr_user", JSON.stringify({ pubkey: "bbb" }));
    expect(getScoreDisplayMode()).toBe("word");
  });

  it("treats garbage in storage as unset rather than crashing or trusting it", () => {
    localStorage.setItem("brainstorm_score_display:anon", "percentage");
    expect(getScoreDisplayMode()).toBe("word");
  });
});
