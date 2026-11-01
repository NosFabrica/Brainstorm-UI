/**
 * Your Assistant's Treasure Map read by treasure-maps.md § 9.2 — which tags are
 * self-entries, what the server's check must look like to count — and set
 * against what the server says it should list, line by line and as a whole.
 */
import { describe, expect, it } from "vitest";
import {
  isFalseClaim,
  lineState,
  missedRelays,
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

  it("drops keys that name nothing, and reads each key and relay once, as the server does", () => {
    const entries = readSelfEntries(
      map([
        ["39999:duty-menu", BA, SCORES],
        ["39998:", BA, SCORES],
        ["30382:rank", BA, SCORES],
        ["30382:rank", BA, "wss://scores.example"],
        ["30382:rank", BA, "wss://elsewhere.example"],
      ]),
      BA,
    );
    expect(entries).toEqual([rank, { key: "30382:rank", relay: "wss://elsewhere.example/" }]);
  });

  it("reads only the kind slots the server owns: a kind, 3038x, 3039x or *", () => {
    const entries = readSelfEntries(
      map([
        ["3038x", BA, SCORES],
        ["3039x", BA, SCORES],
        ["*", BA, SCORES],
        ["3040x", BA, SCORES],
      ]),
      BA,
    );
    expect(entries.map((e) => e.key)).toEqual(["3038x", "3039x", "*"]);
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
  const entry = (e: { key: string; relay: string }) => [e.key, BA, e.relay];

  it("is current when the same by key and relay, in any order, and when both are empty", () => {
    expect(selfMapStatus([rank, followers], map([entry(followers), entry(rank), ["client", "x"]]), BA)).toBe("current");
    expect(selfMapStatus([], null, BA)).toBe("current");
    expect(selfMapStatus([], map([["30382:rank", OTHER, SCORES]]), BA)).toBe("current");
  });

  it("is missing when it lists nothing, and out of date when it lists something else", () => {
    expect(selfMapStatus([rank], null, BA)).toBe("missing");
    expect(selfMapStatus([rank], map([["30382:rank", BA, "wss://old.example"]]), BA)).toBe("out-of-date");
    expect(selfMapStatus([], map([entry(rank)]), BA)).toBe("out-of-date");
  });

  // The server's press compares the self-entries alone (`nothing_to_change`,
  // since brainstorm_server#110's audit), so Update now does too.
  it("is current whatever else the version carries, as the press reads it", () => {
    expect(selfMapStatus([rank], map([entry(rank), ["expiration", "1790000000"]]), BA)).toBe("current");
    expect(selfMapStatus([rank], map([entry(rank), ["39998:", BA, SCORES]]), BA)).toBe("current");
    expect(selfMapStatus([rank], map([entry(rank), entry(rank)]), BA)).toBe("current");
  });

  it("is out of date with a second relay for the same key: the press drops it", () => {
    expect(selfMapStatus([rank], map([entry(rank), ["30382:rank", BA, "wss://elsewhere.example"]]), BA)).toBe(
      "out-of-date",
    );
  });

  it("with nothing to list, a version listing nothing is current whatever else it carries", () => {
    expect(
      selfMapStatus(
        [],
        map([
          ["39998:", BA, SCORES],
          ["expiration", "1790000000"],
        ]),
        BA,
      ),
    ).toBe("current");
  });

  it("leaves alone what the server doesn't own: other keys' entries, and families it doesn't read", () => {
    expect(selfMapStatus([rank], map([entry(rank), ["30382:rank", OTHER, SCORES], ["3040x", BA, SCORES]]), BA)).toBe(
      "current",
    );
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
    expect(selfMapButtons(true, "out-of-date", 1, 0)).toEqual({
      turnOn: false,
      update: { shown: true, enabled: true },
      turnOff: true,
    });
    expect(selfMapButtons(true, "current", 1, 0).update.enabled).toBe(false);
  });

  it("while off: Turn on, and Turn off only while a version still lists some duties", () => {
    expect(selfMapButtons(false, "missing", 0, 0)).toEqual({
      turnOn: true,
      update: { shown: false, enabled: false },
      turnOff: false,
    });
    expect(selfMapButtons(false, "out-of-date", 2, 0).turnOff).toBe(true);
  });

  it("offers the repair once a relay a press reads missed the newest version", () => {
    expect(selfMapButtons(true, "current", 1, 1).update.enabled).toBe(true);
    expect(selfMapButtons(false, "current", 0, 1).turnOff).toBe(true);
    expect(selfMapButtons(false, "current", 0, 0).turnOff).toBe(false);
  });
});

describe("the relays a press reads, as the check names them", () => {
  const OUTBOX = "wss://outbox.example/";
  const answer = {
    assistant: BA,
    on: true,
    duties: [],
    shouldSay: [["30382:rank", "wss://scores.example"]],
    relays: ["wss://scores.example", OUTBOX, "wss://hint.example"],
  };

  it("are the server's writerRelays, each once, in one spelling", () => {
    const check = parseTreasureMapCheck({
      ...answer,
      writerRelays: ["wss://SCORES.example", OUTBOX, "wss://scores.example/", "not a relay"],
    });
    expect(check?.writerRelays).toEqual([SCORES, OUTBOX]);
  });

  it("are unknown, not a reason to hide the step, in an answer from before the field", () => {
    const check = parseTreasureMapCheck(answer);
    expect(check).not.toBeNull();
    expect(check?.writerRelays).toBeNull();
    expect(parseTreasureMapCheck({ ...answer, writerRelays: "wss://scores.example" })?.writerRelays).toBeNull();
  });
});

describe("the relays a press would send to (brainstorm_server publish_assistant_treasure_map)", () => {
  const A = "wss://a.example/";
  const B = "wss://b.example/";
  const C = "wss://c.example/";
  const version = (n: number, entries: string[][], created_at = 100 * n) => ({
    ...map(entries.map(([key, relay]) => [key, BA, relay])),
    id: String(n).repeat(64),
    created_at,
  });
  const listed = [["30382:rank", SCORES]];
  const v1 = version(1, listed);
  const v2 = version(2, listed);
  const v2other = version(2, [["30382:followers", SCORES]]);
  const empty = version(3, []);
  const held = (relay: string, newest?: ReturnType<typeof version>, answered = true) => ({ relay, answered, newest });

  it("are those that answered without the newest of their versions, when it lists the target (_missing)", () => {
    expect(missedRelays([held(A, v2), held(B, v1)], [rank], BA)).toEqual([B]);
    expect(missedRelays([held(A, v2), held(B)], [rank], BA)).toEqual([B]);
    expect(missedRelays([held(A, v2), held(B, v2)], [rank], BA)).toEqual([]);
  });

  it("are every relay that answered, when their newest doesn't list the target: a press signs one for them all", () => {
    // What the store found elsewhere (a version at a hint, say) doesn't count; theirs is out of date.
    expect(missedRelays([held(A, v2other), held(B, v1)], [rank], BA)).toEqual([A, B]);
    // While off, a relay still serving the duties gets the version listing none.
    expect(missedRelays([held(A, v1), held(B, v1)], [], BA)).toEqual([A, B]);
    // None of them holds a version, and there is something to list.
    expect(missedRelays([held(A), held(B)], [rank], BA)).toEqual([A, B]);
  });

  it("while off, are the relays still serving a version that lists duties, once one holds the empty version", () => {
    expect(missedRelays([held(A, empty), held(B, v1)], [], BA)).toEqual([B]);
  });

  it("are none when none holds a version and there is nothing to list: a press finds nothing to change", () => {
    expect(missedRelays([held(A), held(B)], [], BA)).toEqual([]);
  });

  it("leave alone a relay that didn't answer, as the press does", () => {
    expect(missedRelays([held(A, v2), held(B), held(C, undefined, false)], [rank], BA)).toEqual([B]);
    expect(missedRelays([held(A, v1, false), held(B, v2, false)], [rank], BA)).toEqual([]);
    expect(missedRelays([], [rank], BA)).toEqual([]);
  });

  it("only grow as more relays answer, so each can be named as soon as its answer is in", () => {
    const all = [held(A, v1), held(B, v2other), held(C)];
    for (const target of [[rank], []]) {
      for (let i = 0; i < all.length; i++) {
        const some = all.slice(0, i + 1);
        const named = missedRelays(some, target, BA);
        expect(missedRelays(all, target, BA)).toEqual(expect.arrayContaining(named));
      }
    }
  });

  it("take the lower id when two versions share a second, as NIP-01 does", () => {
    const twin = { ...version(2, listed), id: "0".repeat(64) };
    expect(missedRelays([held(A, v2), held(B, twin)], [rank], BA)).toEqual([A]);
  });
});
