import { describe, expect, it } from "vitest";
import { expirationOf, isExpired } from "./nip40";

const NOW = 1_760_000_000;
const ev = (value?: string) => ({ tags: value === undefined ? [] : [["expiration", value]] });

describe("NIP-40 — the moment an event asked to be forgotten", () => {
  it("is past, future or not there", () => {
    expect(expirationOf(ev(String(NOW - 10)))).toBe(NOW - 10);
    expect(isExpired(ev(String(NOW - 10)), NOW)).toBe(true);
    expect(expirationOf(ev(String(NOW + 10)))).toBe(NOW + 10);
    expect(isExpired(ev(String(NOW + 10)), NOW)).toBe(false);
    expect(expirationOf(ev())).toBeUndefined();
    expect(isExpired(ev(), NOW)).toBe(false);
  });

  it("has passed at the second it names", () => {
    expect(isExpired(ev(String(NOW)), NOW)).toBe(true);
  });

  it("ignores an expiration that is not a whole number of seconds", () => {
    for (const value of ["soon", "", "-5", "12.5", "0", "1e9"]) {
      expect(expirationOf(ev(value))).toBeUndefined();
      expect(isExpired(ev(value), NOW)).toBe(false);
    }
  });

  it("reads the value with space around it", () => {
    expect(expirationOf(ev(` ${NOW} `))).toBe(NOW);
  });
});
