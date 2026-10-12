import { describe, expect, it } from "vitest";
import { postedAtOf } from "./eventDate";

const NOW = Math.floor(Date.now() / 1000);
const VINE_DAY = 1_410_674_550; // 2014-09-14

describe("postedAtOf — the date a row or a card shows", () => {
  it("a video is dated by when it was published", () => {
    for (const kind of [21, 22, 34235, 34236]) {
      expect(postedAtOf({ kind, created_at: NOW, tags: [["published_at", String(VINE_DAY)]] })).toBe(VINE_DAY);
    }
  });

  it("a video with no believable published_at keeps created_at", () => {
    expect(postedAtOf({ kind: 34236, created_at: NOW, tags: [] })).toBe(NOW);
    expect(postedAtOf({ kind: 34236, created_at: NOW, tags: [["published_at", "12"]] })).toBe(NOW);
  });

  it("every other kind keeps created_at, whatever it says about publishing", () => {
    expect(postedAtOf({ kind: 30023, created_at: NOW, tags: [["published_at", String(VINE_DAY)]] })).toBe(NOW);
    expect(postedAtOf({ kind: 1, created_at: NOW, tags: [["published_at", String(VINE_DAY)]] })).toBe(NOW);
  });
});
