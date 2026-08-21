/**
 * The per-Account storage registry. v1 kept a hand-written list of keys inside
 * `logout()`; these are the two things that list got wrong — rows it forgot, and
 * rows it wiped that belonged to an Account still on this device.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { accountKey, clearAccountStorage, clearSessionScopedStorage } from "./accountStorage";

const PUBKEY = "a".repeat(64);
const OTHER = "b".repeat(64);

beforeEach(() => {
  localStorage.clear();
});

describe("clearing what a Session left behind", () => {
  it("takes the scoring markers, so signing back in doesn't resume a finished run", () => {
    localStorage.setItem(accountKey("brainstorm_calc_triggered_at", PUBKEY), "123");
    localStorage.setItem(accountKey("brainstorm_calc_pill_dismissed", PUBKEY), "123");

    clearSessionScopedStorage(PUBKEY);

    expect(localStorage.getItem(accountKey("brainstorm_calc_triggered_at", PUBKEY))).toBeNull();
    expect(localStorage.getItem(accountKey("brainstorm_calc_pill_dismissed", PUBKEY))).toBeNull();
  });

  it("leaves what the Account keeps on this device — it is still listed", () => {
    localStorage.setItem(accountKey("brainstorm_known_follows", PUBKEY), "{}");
    localStorage.setItem(accountKey("brainstorm_personalization", PUBKEY), "{}");

    clearSessionScopedStorage(PUBKEY);

    expect(localStorage.getItem(accountKey("brainstorm_known_follows", PUBKEY))).toBe("{}");
    expect(localStorage.getItem(accountKey("brainstorm_personalization", PUBKEY))).toBe("{}");
  });

  it("leaves the once-ever markers alone — they are promises about the identity", () => {
    // clearing this re-arms the automatic scoring kick, which is the loop
    // `AutoScoreReturning` exists to stop
    localStorage.setItem(accountKey("brainstorm_auto_score_kicked", PUBKEY), "true");

    clearSessionScopedStorage(PUBKEY);

    expect(localStorage.getItem(accountKey("brainstorm_auto_score_kicked", PUBKEY))).toBe("true");
  });

  it("never reaches another Account's rows", () => {
    localStorage.setItem(accountKey("brainstorm_calc_triggered_at", OTHER), "123");

    clearSessionScopedStorage(PUBKEY);

    expect(localStorage.getItem(accountKey("brainstorm_calc_triggered_at", OTHER))).toBe("123");
  });
});

describe("an Account leaving the device", () => {
  it("takes everything it kept here, whichever lifetime the row had", () => {
    localStorage.setItem(accountKey("brainstorm_calc_triggered_at", PUBKEY), "123");
    localStorage.setItem(accountKey("brainstorm_known_follows", PUBKEY), "{}");

    clearAccountStorage(PUBKEY);

    expect(localStorage.length).toBe(0);
  });

  it("takes the rows that nest under a namespace, not just the exact key", () => {
    localStorage.setItem(`${accountKey("brainstorm_assistant", PUBKEY)}:pubkey`, "npub");
    localStorage.setItem(`${accountKey("brainstorm_assistant", PUBKEY)}:profile`, "{}");

    clearAccountStorage(PUBKEY);

    expect(localStorage.length).toBe(0);
  });

  it("leaves rows that merely start with the same pubkey-less prefix", () => {
    localStorage.setItem("brainstorm_calc_completed", "true");

    clearAccountStorage(PUBKEY);

    expect(localStorage.getItem("brainstorm_calc_completed")).toBe("true");
  });
});
