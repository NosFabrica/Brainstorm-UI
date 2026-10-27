/**
 * Your Assistant's Treasure Map read by treasure-maps.md § 9.2 — which tags are
 * self-entries, what the server's check must look like to count — and set
 * against what the server says it should list, line by line and as a whole.
 */
import { describe, expect, it } from "vitest";
import {
  isFalseClaim,
  lineState,
  parseTreasureMapCheck,
  readSelfEntries,
  selfMapButtons,
  selfMapStatus,
  type DutyLine,
} from "./assistantTreasureMap";

const BA = "b5".repeat(32);
const OTHER = "c6".repeat(32);
const SCORES = "wss://scores.example/";

const map = (tags: string[][], pubkey = BA) => ({ kind: 10040, pubkey, tags });
const rank = { key: "30382:rank", relay: SCORES };
const followers = { key: "30382:followers", relay: SCORES };

describe("which tags are self-entries", () => {
  it("names the author itself, under a key that parses, in its one spelling", () => {
    const entries = readSelfEntries(
      map([
        ["30382:rank", BA, "wss://SCORES.example"],
        ["30382:followers", OTHER, SCORES],
        ["39998:dlist-header", BA, "wss://dcosl.brainstorm.world"],
        ["client", "Brainstorm"],
      ]),
      BA,
    );
    expect(entries).toEqual([rank, { key: "39998", relay: "wss://dcosl.brainstorm.world/" }]);
  });

  it("drops keys that name nothing, and keeps the first per key", () => {
    const entries = readSelfEntries(
      map([
        ["39999:duty-menu", BA, SCORES],
        ["39998:", BA, SCORES],
        ["30382:rank", BA, SCORES],
        ["30382:rank", BA, "wss://elsewhere.example"],
      ]),
      BA,
    );
    expect(entries).toEqual([rank]);
  });

  it("keeps an empty relay as claiming nothing, and reads only the author's own Map", () => {
    expect(readSelfEntries(map([["30382:rank", BA]]), BA)).toEqual([{ key: "30382:rank", relay: "" }]);
    expect(readSelfEntries(map([["30382:rank", BA, SCORES]], OTHER), BA)).toEqual([]);
    expect(readSelfEntries({ kind: 39999, pubkey: BA, tags: [["30382:rank", BA, SCORES]] }, BA)).toEqual([]);
  });
});

describe("the server's check", () => {
  const answer = {
    assistant: BA.toUpperCase(),
    on: true,
    duties: [
      { key: "30382:rank", status: "live", relay: SCORES, reason: null, entries: [["30382:rank", SCORES]] },
      { key: "30392", status: "offered", relay: SCORES, reason: "not-scheduled", entries: [["30392", SCORES]] },
      { key: "30382:hops", status: "made-up" },
    ],
    shouldSay: [["30382:rank", "wss://scores.example"]],
    relays: ["wss://scores.example", "not a relay"],
  };

  it("is one with a 64-hex assistant, a boolean on, and duties and shouldSay arrays", () => {
    const check = parseTreasureMapCheck(answer);
    expect(check?.assistant).toBe(BA);
    expect(check?.shouldSay).toEqual([rank]);
    expect(check?.relays).toEqual([SCORES]);
    // An unknown status is dropped; only a live line keeps its entries.
    expect(check?.duties.map((d) => [d.key, d.status, d.entries.length])).toEqual([
      ["30382:rank", "live", 1],
      ["30392", "offered", 0],
    ]);
  });

  it("isn't one otherwise: GET /user/{pubkey} answers this path on a server without the route", () => {
    expect(parseTreasureMapCheck({ followers: [], following: [] })).toBeNull();
    expect(parseTreasureMapCheck({ ...answer, on: "yes" })).toBeNull();
    expect(parseTreasureMapCheck({ ...answer, shouldSay: undefined })).toBeNull();
    expect(parseTreasureMapCheck(null)).toBeNull();
  });
});

describe("the published Map against what it should list", () => {
  it("is current when the same by key and relay, in any order, and when both are empty", () => {
    expect(selfMapStatus([rank, followers], [followers, rank])).toBe("current");
    expect(selfMapStatus([], [])).toBe("current");
  });

  it("is missing when it lists nothing, and out of date when it lists something else", () => {
    expect(selfMapStatus([rank], [])).toBe("missing");
    expect(selfMapStatus([rank], [{ key: "30382:rank", relay: "wss://old.example/" }])).toBe("out-of-date");
    expect(selfMapStatus([], [rank])).toBe("out-of-date");
  });

  it("flags a listed duty that names a relay and isn't live there", () => {
    expect(isFalseClaim(followers, [rank])).toBe(true);
    expect(isFalseClaim(rank, [rank])).toBe(false);
    expect(isFalseClaim({ key: "30382:followers", relay: "" }, [rank])).toBe(false);
  });
});

describe("a duties line", () => {
  const live: DutyLine = {
    key: "3038x",
    status: "live",
    relay: SCORES,
    reason: null,
    lastLandedAt: null,
    entries: [rank, followers],
  };

  it("is active once every self-entry that should list it is published", () => {
    expect(lineState(live, [rank, followers])).toBe("active");
    expect(lineState(live, [rank])).toBe("live-unlisted");
  });

  it("keeps the server's word otherwise", () => {
    expect(lineState({ ...live, status: "offered", entries: [] }, [rank])).toBe("offered");
    expect(lineState({ ...live, status: "elsewhere", entries: [] }, [])).toBe("elsewhere");
  });
});

describe("the buttons", () => {
  it("while on: Update now, enabled unless up to date, and Turn off", () => {
    expect(selfMapButtons(true, "out-of-date", 1)).toEqual({
      turnOn: false,
      update: { shown: true, enabled: true },
      turnOff: true,
    });
    expect(selfMapButtons(true, "current", 1).update.enabled).toBe(false);
  });

  it("while off: Turn on, and Turn off only while a version still lists some duties", () => {
    expect(selfMapButtons(false, "missing", 0)).toEqual({
      turnOn: true,
      update: { shown: false, enabled: false },
      turnOff: false,
    });
    expect(selfMapButtons(false, "out-of-date", 2).turnOff).toBe(true);
  });
});
