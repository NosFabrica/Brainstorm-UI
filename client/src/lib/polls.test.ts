import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import {
  acceptedChoices,
  choicesOf,
  closingWords,
  parsePoll,
  parseZapPoll,
  percentOf,
  pollClosed,
  tallyPoll,
  tallyZapPoll,
  zapRangeWords,
  zappedPollOption,
} from "./polls";

const POLL_ID = "p".repeat(64);
const CREATED = 1_760_000_000;
const ENDS = CREATED + 86_400;

const AUTHOR = "a".repeat(64);
const pollEvent = (tags: string[][], kind = 1068) => ({
  id: POLL_ID,
  pubkey: AUTHOR,
  kind,
  created_at: CREATED,
  content: "Best relay?",
  tags,
});

const singleChoice = pollEvent([
  ["option", "x1", "damus"],
  ["option", "x2", "nos.lol"],
  ["option", "x3", "primal"],
  ["relay", "wss://relay.example.com"],
  ["relay", "not a relay"],
  ["polltype", "singlechoice"],
  ["endsAt", String(ENDS)],
]);

let n = 0;
const vote = (pubkey: string, at: number, responses: string[], pollId = POLL_ID) => ({
  id: String(++n).padStart(64, "0"),
  pubkey,
  kind: 1018,
  created_at: at,
  content: "",
  tags: [["e", pollId], ...responses.map((r) => ["response", r])],
});

const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);
const CAROL = "3".repeat(64);

describe("parsePoll (NIP-88)", () => {
  it("reads options, type, endsAt and relays", () => {
    const poll = parsePoll(singleChoice)!;
    expect(poll.options).toEqual([
      { id: "x1", label: "damus" },
      { id: "x2", label: "nos.lol" },
      { id: "x3", label: "primal" },
    ]);
    expect(poll.multiple).toBe(false);
    expect(poll.endsAt).toBe(ENDS);
    expect(poll.relays).toEqual(["wss://relay.example.com"]);
    expect(poll.question).toBe("Best relay?");
  });

  it("dials only public wss:// relays it names, three at most", () => {
    const poll = parsePoll(
      pollEvent([
        ["option", "a", "A"],
        ["relay", "ws://plain.example.com"],
        ["relay", "wss://localhost:7777"],
        ["relay", "wss://127.0.0.1"],
        ["relay", "wss://192.168.1.2"],
        ["relay", "wss://[::1]"],
        ["relay", "wss://umbrel.local"],
        ["relay", "wss://one.example.com"],
        ["relay", "wss://two.example.com"],
        ["relay", "wss://three.example.com"],
        ["relay", "wss://four.example.com"],
      ]),
    )!;
    expect(poll.relays).toEqual(["wss://one.example.com", "wss://two.example.com", "wss://three.example.com"]);
  });

  it("defaults to single choice and no end; reads multiplechoice", () => {
    expect(parsePoll(pollEvent([["option", "a", "A"]]))).toMatchObject({ multiple: false, endsAt: null });
    expect(
      parsePoll(
        pollEvent([
          ["option", "a", "A"],
          ["polltype", "multiplechoice"],
        ]),
      )!.multiple,
    ).toBe(true);
  });

  it("is not a poll without options, or of another kind", () => {
    expect(parsePoll(pollEvent([]))).toBeNull();
    expect(parsePoll(pollEvent([["option", "a", "A"]], 1))).toBeNull();
  });

  it("closes after endsAt", () => {
    const poll = parsePoll(singleChoice)!;
    expect(pollClosed(poll, ENDS)).toBe(false);
    expect(pollClosed(poll, ENDS + 1)).toBe(true);
  });
});

describe("tallyPoll", () => {
  const poll = parsePoll(singleChoice)!;

  it("counts only each person's latest vote", () => {
    const tally = tallyPoll(poll, [
      vote(ALICE, CREATED + 10, ["x1"]),
      vote(ALICE, CREATED + 20, ["x2"]), // changed their mind
      vote(BOB, CREATED + 15, ["x2"]),
    ]);
    expect(tally.voters).toHaveLength(2);
    expect(tally.votersByOption.get("x1")).toEqual([]);
    expect(tally.votersByOption.get("x2")!.sort()).toEqual([ALICE, BOB].sort());
    expect(choicesOf(poll, tally, ALICE)).toEqual(["x2"]);
  });

  it("ignores votes after endsAt — a late vote does not replace an earlier one", () => {
    const tally = tallyPoll(poll, [
      vote(ALICE, CREATED + 10, ["x1"]),
      vote(ALICE, ENDS + 1, ["x3"]), // after the poll closed
      vote(CAROL, ENDS + 60, ["x3"]),
    ]);
    expect(tally.voters).toEqual([ALICE]);
    expect(tally.votersByOption.get("x1")).toEqual([ALICE]);
    expect(tally.votersByOption.get("x3")).toEqual([]);
    expect(choicesOf(poll, tally, CAROL)).toEqual([]);
  });

  it("ignores votes before the poll existed, and votes for other polls", () => {
    const tally = tallyPoll(poll, [vote(ALICE, CREATED - 1, ["x1"]), vote(BOB, CREATED + 1, ["x1"], "q".repeat(64))]);
    expect(tally.voters).toEqual([]);
  });

  it("single choice: only the first response counts; unknown ids are dropped", () => {
    expect(acceptedChoices(poll, ["x2", "x1", "x3"])).toEqual(["x2"]);
    expect(acceptedChoices(poll, ["nope", "x1"])).toEqual([]);
    const tally = tallyPoll(poll, [vote(ALICE, CREATED + 1, ["x1", "x2", "x3"]), vote(BOB, CREATED + 1, ["zzz"])]);
    expect(tally.voters).toEqual([ALICE]);
    expect(tally.votersByOption.get("x1")).toEqual([ALICE]);
    expect(tally.votersByOption.get("x2")).toEqual([]);
  });

  it("multiple choice: each picked option counts once; shares are of voters", () => {
    const multi = parsePoll(
      pollEvent([
        ["option", "a", "A"],
        ["option", "b", "B"],
        ["polltype", "multiplechoice"],
      ]),
    )!;
    const tally = tallyPoll(multi, [vote(ALICE, CREATED + 1, ["a", "b", "a"]), vote(BOB, CREATED + 2, ["a"])]);
    expect(tally.voters).toHaveLength(2);
    expect(tally.votersByOption.get("a")).toHaveLength(2);
    expect(tally.votersByOption.get("b")).toEqual([ALICE]);
    expect(percentOf(2, 2)).toBe(100);
    expect(percentOf(1, 2)).toBe(50);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("zap polls (kind 6969)", () => {
  const zapPollEvent = pollEvent(
    [
      ["poll_option", "0", "Yes"],
      ["poll_option", "1", "No"],
      ["value_minimum", "10"],
      ["value_maximum", "1000"],
      ["closed_at", String(ENDS)],
      ["consensus_threshold", "60"],
    ],
    6969,
  );

  // "lnbc<amount>n1…": n is nano-BTC, i.e. 100 msats — so 1000n is 100 sats.
  const invoice = (sats: number) => `lnbc${sats * 10}n1pexample`;
  // Zappers sign their requests; the receipt (by the wallet) carries them.
  const keys = new Map<string, Uint8Array>();
  const zapper = (name: string) => {
    if (!keys.has(name)) keys.set(name, generateSecretKey());
    return getPublicKey(keys.get(name)!);
  };
  const request = (sender: string, option: number | null, pollId: string, extra: string[][] = []) =>
    finalizeEvent(
      {
        kind: 9734,
        created_at: CREATED,
        content: "",
        tags: [["e", pollId], ["p", AUTHOR], ...(option === null ? [] : [["poll_option", String(option)]]), ...extra],
      },
      keys.get(sender)!,
    );
  const receiptOf = (
    req: object | string,
    sats: number,
    at = CREATED + 60,
    pollId = POLL_ID,
    tags: string[][] = [],
  ) => ({
    id: String(++n).padStart(64, "0"),
    pubkey: "f".repeat(64),
    kind: 9735,
    created_at: at,
    content: "",
    tags: [
      ["e", pollId],
      ["p", AUTHOR],
      ["bolt11", invoice(sats)],
      ["description", typeof req === "string" ? req : JSON.stringify(req)],
      ...tags,
    ],
  });
  const receipt = (sender: string, sats: number, option: number | null, at = CREATED + 60, pollId = POLL_ID) =>
    receiptOf(request(sender, option, pollId), sats, at, pollId);
  const ALICE_Z = zapper("alice");
  const BOB_Z = zapper("bob");
  zapper("carol");

  it("reads options and rules", () => {
    const zp = parseZapPoll(zapPollEvent)!;
    expect(zp.options).toEqual([
      { index: 0, label: "Yes" },
      { index: 1, label: "No" },
    ]);
    expect(zp).toMatchObject({ min: 10, max: 1000, closedAt: ENDS, threshold: 60 });
    expect(zapRangeWords(zp)).toBe("10–1,000 sats");
  });

  it("reads an old days-after-posting closed_at as a date", () => {
    const zp = parseZapPoll(
      pollEvent(
        [
          ["poll_option", "0", "Yes"],
          ["closed_at", "7"],
        ],
        6969,
      ),
    )!;
    expect(zp.closedAt).toBe(CREATED + 7 * 86_400);
  });

  it("finds the option in the embedded zap request", () => {
    expect(zappedPollOption(receipt("alice", 100, 1))).toBe(1);
    expect(zappedPollOption(receipt("alice", 100, null))).toBeNull();
  });

  it("sums sats per option: in range, before closing, for a declared option", () => {
    const zp = parseZapPoll(zapPollEvent)!;
    const tally = tallyZapPoll(zp, [
      receipt("alice", 100, 0),
      receipt("bob", 300, 0),
      receipt("carol", 200, 1),
      receipt("carol", 5, 1), // below value_minimum
      receipt("carol", 5000, 1), // above value_maximum
      receipt("alice", 100, 1, ENDS + 1), // after closed_at
      receipt("alice", 100, 7), // no such option
      receipt("alice", 100, null), // a plain zap, no vote
      receipt("alice", 100, 0, CREATED + 60, "q".repeat(64)), // another event
    ]);
    expect(tally.sats.get(0)).toBe(400);
    expect(tally.sats.get(1)).toBe(200);
    expect(tally.total).toBe(600);
    expect(tally.zaps).toBe(3);
    // None of these requests names its amount: each size is the receipt's word.
    expect(tally.unpinned).toBe(3);
    expect(tally.zappers.get(0)!.sort()).toEqual([ALICE_Z, BOB_Z].sort());
    expect(percentOf(tally.sats.get(0)!, tally.total)).toBe(67);
  });

  describe("counts a receipt only under its zapper's signature", () => {
    const zp = parseZapPoll(zapPollEvent)!;
    const open = parseZapPoll(
      pollEvent(
        [
          ["poll_option", "0", "Yes"],
          ["poll_option", "1", "No"],
        ],
        6969,
      ),
    )!;

    it("not a request nobody signed (any key can sign a receipt)", () => {
      const forged = {
        kind: 9734,
        pubkey: ALICE,
        content: "",
        tags: [
          ["e", POLL_ID],
          ["poll_option", "1"],
        ],
      };
      expect(tallyZapPoll(zp, [receiptOf(forged, 500)]).total).toBe(0);
    });

    it("not a signed request about another event, or by someone else than the receipt's `P`", () => {
      const elsewhere = receiptOf(request("alice", 1, "q".repeat(64)), 500);
      const otherP = receiptOf(request("alice", 1, POLL_ID), 500, CREATED + 60, POLL_ID, [["P", BOB_Z]]);
      expect(tallyZapPoll(zp, [elsewhere, otherP]).total).toBe(0);
      // Its own `P`, it counts.
      const ownP = receiptOf(request("alice", 1, POLL_ID), 500, CREATED + 60, POLL_ID, [["P", ALICE_Z]]);
      expect(tallyZapPoll(zp, [ownP]).sats.get(1)).toBe(500);
    });

    it("not a zap to someone else than the poll's author", () => {
      const req = finalizeEvent(
        {
          kind: 9734,
          created_at: CREATED,
          content: "",
          tags: [
            ["e", POLL_ID],
            ["p", "b".repeat(64)],
            ["poll_option", "1"],
          ],
        },
        keys.get("alice")!,
      );
      const r = receiptOf(req, 500);
      r.tags[1] = ["p", "b".repeat(64)];
      expect(tallyZapPoll(zp, [r]).total).toBe(0);
    });

    it("one request is one payment, however many receipts repeat it", () => {
      const req = request("bob", 0, POLL_ID);
      const tally = tallyZapPoll(zp, [receiptOf(req, 300), receiptOf(req, 300), receiptOf(req, 300)]);
      expect(tally.sats.get(0)).toBe(300);
      expect(tally.zaps).toBe(1);
    });

    it("an amount past every bitcoin there is counts nothing, so it cannot carry consensus alone", () => {
      // 22,000,000 BTC: no unit letter is whole bitcoin.
      const absurd = receiptOf(request("carol", 1, POLL_ID), 0, CREATED + 60, POLL_ID);
      absurd.tags[1] = ["bolt11", "lnbc220000001pexample"];
      const tally = tallyZapPoll(open, [absurd, receipt("alice", 100, 0)]);
      expect(tally.sats.get(1)).toBe(0);
      expect(tally.total).toBe(100);
    });
  });
});

describe("closingWords", () => {
  const now = 1_760_000_000;
  it("counts down, then names the day it ended", () => {
    expect(closingWords(null, now)).toBeNull();
    expect(closingWords(now + 3 * 86_400 + 5, now)).toBe("Ends in 3 days");
    expect(closingWords(now + 86_400, now)).toBe("Ends in 1 day");
    expect(closingWords(now + 5 * 3600, now)).toBe("Ends in 5 hours");
    expect(closingWords(now + 90, now)).toBe("Ends in 2 minutes");
    expect(closingWords(now - 10, now)).toMatch(/^Ended [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });
});
