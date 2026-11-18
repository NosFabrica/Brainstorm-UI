import { beforeEach, describe, expect, it } from "vitest";
import { clearSessionScopedStorage } from "./accountStorage";
import { hasOwnScores, markOwnScores } from "./ownScores";

const A = "a".repeat(64);
const B = "b".repeat(64);

beforeEach(() => localStorage.clear());

describe("hasOwnScores", () => {
  // Switching from a scored Account to a new one showed the new one's empty
  // perspective as if it were theirs.
  it("one Account's scores are not another's", () => {
    markOwnScores(A);

    expect(hasOwnScores(A)).toBe(true);
    expect(hasOwnScores(B)).toBe(false);
  });

  it("no Account, no scores", () => {
    markOwnScores(A);

    expect(hasOwnScores(null)).toBe(false);
  });

  it("goes with the Account's Session on sign-out", () => {
    markOwnScores(A);

    clearSessionScopedStorage(A);

    expect(hasOwnScores(A)).toBe(false);
  });
});
