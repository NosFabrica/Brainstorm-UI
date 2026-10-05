/**
 * An alert someone acted on (unfollow, mute, report) stays hidden; taking the
 * action back — undoing a report — brings it back.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { actedAlertSet, markActed, unmarkActed } from "./networkAlertsIgnored";

const OBSERVER = "o".repeat(64);
const A = "a".repeat(64);
const B = "b".repeat(64);

beforeEach(() => localStorage.clear());

describe("acted alerts", () => {
  it("unmarking one leaves the others hidden, and persists", () => {
    markActed(OBSERVER, A);
    markActed(OBSERVER, B);

    const after = unmarkActed(OBSERVER, A);

    expect([...after]).toEqual([B]);
    expect([...actedAlertSet(OBSERVER)]).toEqual([B]);
  });
});
