/**
 * A feed account is a legitimate voice, but a wall of them makes a page feel
 * like a scraper. Nostr profiles can say so with `bot: true`; the ones that
 * don't usually say it in their name.
 */
import { describe, expect, it } from "vitest";
import { isFeedAccount } from "./feedAccount";

describe("isFeedAccount", () => {
  it("reads the profile's bot flag, or a name that says bot, RSS or feed", () => {
    expect(isFeedAccount({ name: "tftc", displayName: "TFTC (News Bot)" })).toBe(true);
    expect(isFeedAccount({ name: "Bitcoin Magazine (RSS Feed)" })).toBe(true);
    expect(isFeedAccount({ name: "Cryptovka | Feed | Crypto News" })).toBe(true);
    expect(isFeedAccount({ name: "quietaccount", bot: true })).toBe(true);
  });
  it("leaves people alone — even with 'robot' or 'feedback' in the name", () => {
    expect(isFeedAccount({ name: "jack" })).toBe(false);
    expect(isFeedAccount({ displayName: "Robot Dreams Studio" })).toBe(false);
    expect(isFeedAccount({ name: "feedbackloop" })).toBe(false);
    expect(isFeedAccount(null)).toBe(false);
  });
});
