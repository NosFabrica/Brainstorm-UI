import { beforeEach, describe, expect, it } from "vitest";

import { getNip85Consent, hasDeclinedNip85, hasNip85Consent, recordNip85Consent } from "./nip85Consent";
import { accountKey } from "./accountStorage";

const A = "a".repeat(64);
const B = "b".repeat(64);

beforeEach(() => {
  localStorage.clear();
});

describe("recording NIP-85 consent", () => {
  it("round-trips a grant", () => {
    recordNip85Consent(A, true);
    expect(hasNip85Consent(A)).toBe(true);
    expect(hasDeclinedNip85(A)).toBe(false);
    expect(getNip85Consent(A)?.at).toBeGreaterThan(0);
  });

  it("round-trips a decline", () => {
    recordNip85Consent(A, false);
    expect(hasNip85Consent(A)).toBe(false);
    expect(hasDeclinedNip85(A)).toBe(true);
  });

  // The dashboard CTA's cooldown is the one path that re-surfaces the ask after
  // a decline, and it reads the dismissal timestamp — a decline must write it.
  it("a decline also stamps the CTA dismissal", () => {
    recordNip85Consent(A, false);
    expect(Number(localStorage.getItem(accountKey("brainstorm_nip85_dismissed_at", A)))).toBeGreaterThan(0);
  });

  it("a grant does NOT stamp the CTA dismissal", () => {
    recordNip85Consent(A, true);
    expect(localStorage.getItem(accountKey("brainstorm_nip85_dismissed_at", A))).toBeNull();
  });

  it("answers per account — B is not asked to live with A's choice", () => {
    recordNip85Consent(A, true);
    expect(hasNip85Consent(B)).toBe(false);
    expect(hasDeclinedNip85(B)).toBe(false);
    expect(getNip85Consent(B)).toBeNull();
  });

  it("never asked reads as neither granted nor declined", () => {
    expect(hasNip85Consent(A)).toBe(false);
    expect(hasDeclinedNip85(A)).toBe(false);
  });

  it("tolerates a corrupt row", () => {
    localStorage.setItem(accountKey("brainstorm_nip85_consent", A), "not-json");
    expect(getNip85Consent(A)).toBeNull();
    localStorage.setItem(accountKey("brainstorm_nip85_consent", A), JSON.stringify({ granted: "yes" }));
    expect(getNip85Consent(A)).toBeNull();
  });
});
