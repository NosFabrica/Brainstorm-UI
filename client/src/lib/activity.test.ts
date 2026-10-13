import { describe, expect, it } from "vitest";
import {
  assertionMetrics,
  externalTargetOf,
  metricNoun,
  pollChoices,
  readApproval,
  readAssertion,
  readBadgeAward,
  readDeletion,
  readFollows,
  readLabel,
  readPollVote,
  readReaction,
  readReport,
  readRsvp,
  readZap,
  targetsOf,
  zapAmount,
} from "./activity";

const WALLET = "a".repeat(64);
const ALICE = "b".repeat(64);
const PAYER = "c".repeat(64);
const NOTE = "1".repeat(64);
const NOTE2 = "2".repeat(64);
const TXID = "f".repeat(64);
const BLOCK = "0".repeat(64);
const ev = (kind: number, tags: string[][] = [], content = "", pubkey = WALLET) => ({
  id: "e".repeat(64),
  pubkey,
  kind,
  created_at: 1_790_000_000,
  tags,
  content,
});

describe("zaps", () => {
  it("a receipt (9735) is the payer's — from its embedded request — not the wallet service that signed it", () => {
    const request = JSON.stringify({ pubkey: PAYER, content: "great post", tags: [["amount", "21000"]] });
    const zap = readZap(
      ev(9735, [
        ["p", ALICE],
        ["e", NOTE, "wss://relay.example"],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", request],
      ]),
    )!;
    expect(zap.payer).toBe(PAYER);
    expect(zap.payer).not.toBe(WALLET);
    expect(zap.recipient).toBe(ALICE);
    expect(zap.amount).toBe(21);
    expect(zapAmount(zap)).toBe("21 sats");
    expect(zap.comment).toBe("great post");
    expect(zap.target).toEqual({ id: NOTE, relay: "wss://relay.example" });
  });

  it("a receipt whose invoice disagrees with its request names no amount", () => {
    const request = JSON.stringify({ pubkey: PAYER, content: "", tags: [["amount", "5000"]] });
    const zap = readZap(
      ev(9735, [
        ["p", ALICE],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", request],
      ]),
    )!;
    expect(zap.amount).toBeNull();
    expect(zapAmount(zap)).toBeNull();
    // A zap to a profile has no target.
    expect(zap.target).toBeNull();
  });

  it("a request (9734) is signed by its payer; its amount is in millisats", () => {
    const zap = readZap(
      ev(
        9734,
        [
          ["p", ALICE],
          ["amount", "1000"],
          ["a", `30023:${ALICE}:essay`],
        ],
        "nice",
        PAYER,
      ),
    )!;
    expect(zap).toMatchObject({ rail: "request", payer: PAYER, recipient: ALICE, amount: 1, comment: "nice" });
    expect(zapAmount(zap)).toBe("1 sat");
    expect(zap.target).toEqual({ addr: `30023:${ALICE}:essay`, relay: undefined });
  });

  it("a nutzap (9321) sums its proofs, in its mint's unit, from its mint", () => {
    const zap = readZap(
      ev(
        9321,
        [
          ["proof", JSON.stringify({ amount: 8 })],
          ["proof", JSON.stringify({ amount: 2 })],
          ["proof", "not json"],
          ["unit", "usd"],
          ["u", "https://mint.example.com/"],
          ["p", ALICE],
          ["e", NOTE],
        ],
        "thanks",
        PAYER,
      ),
    )!;
    expect(zap).toMatchObject({
      rail: "cashu",
      payer: PAYER,
      amount: 10,
      unit: "usd",
      mint: "https://mint.example.com/",
    });
    expect(zapAmount(zap)).toBe("10 usd");
  });

  it("a BOLT12 zap (9736) names its payer in `P`, and an anonymous one names none", () => {
    const tags = [
      ["p", ALICE],
      ["amount", "50000"],
      ["offer", "lno1xyz"],
      ["e", NOTE],
      ["k", "1"],
    ];
    const attributed = readZap(ev(9736, [...tags, ["P", PAYER]], "gm", PAYER))!;
    expect(attributed).toMatchObject({ rail: "bolt12", payer: PAYER, amount: 50, comment: "gm", target: { id: NOTE } });
    const anonymous = readZap(ev(9736, tags, "", "9".repeat(64)))!;
    expect(anonymous.payer).toBeNull();
  });

  it("an onchain zap (8333): the signer pays, the amount is in sats, the transaction is in `i`", () => {
    const zap = readZap(
      ev(
        8333,
        [
          ["i", `bitcoin:tx:${TXID}`],
          ["p", ALICE],
          ["amount", "21000"],
          ["a", `30023:${ALICE}:essay`],
          ["e", NOTE],
          ["k", "30023"],
          ["block", BLOCK, "850000"],
        ],
        "stack sats",
        PAYER,
      ),
    )!;
    expect(zap).toMatchObject({
      rail: "onchain",
      payer: PAYER,
      recipient: ALICE,
      amount: 21000,
      txid: TXID,
      block: { hash: BLOCK, height: 850000 },
      comment: "stack sats",
      target: { id: NOTE },
    });
    expect(zapAmount(zap)).toBe("21,000 sats");
  });

  it("is not a zap's when the kind is not one", () => {
    expect(readZap(ev(1))).toBeNull();
  });
});

describe("reactions", () => {
  it("+ is a like, - a dislike, anything else the emoji itself", () => {
    expect(readReaction(ev(7, [], "+")).mark).toEqual({ type: "like" });
    expect(readReaction(ev(7, [], "")).mark).toEqual({ type: "like" });
    expect(readReaction(ev(7, [], "-")).mark).toEqual({ type: "dislike" });
    expect(readReaction(ev(7, [], "🔥")).mark).toEqual({ type: "text", text: "🔥" });
  });

  it("a NIP-30 custom emoji is its picture, from the `emoji` tag", () => {
    const r = readReaction(
      ev(
        7,
        [
          ["e", NOTE],
          ["p", ALICE],
          ["k", "1"],
          ["emoji", "soapbox", "https://cdn.example/soapbox.png"],
        ],
        ":soapbox:",
      ),
    );
    expect(r.mark).toEqual({ type: "custom", emoji: { code: "soapbox", url: "https://cdn.example/soapbox.png" } });
    expect(r).toMatchObject({ to: ALICE, target: { id: NOTE }, targetKind: 1, external: null });
  });

  it("names the last `e` (NIP-25), and an external reaction's NIP-73 target", () => {
    expect(
      readReaction(
        ev(7, [
          ["e", NOTE2],
          ["e", NOTE],
        ]),
      ).target,
    ).toMatchObject({ id: NOTE });
    const r = readReaction(
      ev(
        17,
        [
          ["k", "web"],
          ["i", "https://www.example.com/post/1/"],
        ],
        "+",
      ),
    );
    expect(r.target).toBeNull();
    expect(r.external).toEqual({
      id: "https://www.example.com/post/1/",
      url: "https://www.example.com/post/1/",
      kind: "web",
      label: "example.com/post/1",
    });
    expect(externalTargetOf({ tags: [["i", "isbn:9780765382030"]] })).toMatchObject({
      url: null,
      label: "isbn:9780765382030",
    });
  });
});

describe("the rest of the activities", () => {
  it("a deletion (5): its targets each once, the kinds, the reason", () => {
    const d = readDeletion(
      ev(
        5,
        [
          ["e", NOTE],
          ["e", NOTE],
          ["a", `30023:${WALLET}:essay`],
          ["k", "1"],
          ["k", "30023"],
          ["k", "1"],
        ],
        " posted by mistake ",
      ),
    );
    expect(d.targets).toEqual([
      { id: NOTE, relay: undefined },
      { addr: `30023:${WALLET}:essay`, relay: undefined },
    ]);
    expect(d.kinds).toEqual([1, 30023]);
    expect(d.reason).toBe("posted by mistake");
  });

  it("a badge award (8): the definition's address and who got it", () => {
    expect(
      readBadgeAward(
        ev(8, [
          ["a", `30009:${WALLET}:bravery`, "wss://relay.example"],
          ["p", ALICE],
          ["p", PAYER],
          ["p", ALICE],
        ]),
      ),
    ).toEqual({ badge: `30009:${WALLET}:bravery`, relay: "wss://relay.example", awardees: [ALICE, PAYER] });
  });

  it("a report (1984): the type on the event's tag, else on the person's; a relay there is no reason", () => {
    expect(
      readReport(
        ev(
          1984,
          [
            ["p", ALICE],
            ["e", NOTE, "Spam"],
          ],
          "bot",
        ),
      ),
    ).toEqual({ person: ALICE, event: { id: NOTE, relay: undefined }, reason: "spam", comment: "bot" });
    expect(readReport(ev(1984, [["p", ALICE, "impersonation"]]))).toMatchObject({
      person: ALICE,
      event: null,
      reason: "impersonation",
    });
    expect(
      readReport(
        ev(1984, [
          ["p", ALICE],
          ["e", NOTE, "wss://relay.example"],
        ]),
      ).reason,
    ).toBeNull();
  });

  it("a label (1985): namespace, labels, and every kind of target", () => {
    const l = readLabel(
      ev(1985, [
        ["L", "ugc"],
        ["l", "funny", "ugc"],
        ["l", "funny", "ugc"],
        ["l", "art", "ugc"],
        ["p", ALICE],
        ["e", NOTE],
        ["r", "wss://relay.example"],
        ["t", "#nostr"],
      ]),
    );
    expect(l.namespaces).toEqual(["ugc"]);
    expect(l.labels).toEqual([
      { value: "funny", namespace: "ugc" },
      { value: "art", namespace: "ugc" },
    ]);
    expect(l).toMatchObject({
      people: [ALICE],
      events: [{ id: NOTE }],
      links: ["wss://relay.example"],
      hashtags: ["nostr"],
    });
  });

  it("an approval (4550): the community, and the post as it carries it", () => {
    const post = { id: NOTE, pubkey: ALICE, kind: 1, created_at: 1, tags: [], content: "hello", sig: "x" };
    const a = readApproval(
      ev(
        4550,
        [
          ["a", `34550:${WALLET}:cooking`],
          ["e", NOTE],
          ["p", ALICE],
          ["k", "1"],
        ],
        JSON.stringify(post),
      ),
    );
    expect(a.community).toBe(`34550:${WALLET}:cooking`);
    expect(a.post).toMatchObject({ id: NOTE });
    expect(a.embedded?.content).toBe("hello");
    expect(
      readApproval(
        ev(4550, [
          ["a", `34550:${WALLET}:cooking`],
          ["a", `30023:${ALICE}:essay`],
        ]),
      ).post,
    ).toMatchObject({
      addr: `30023:${ALICE}:essay`,
    });
  });

  it("a poll vote (1018): the poll, and the choices in the poll's words once it is here", () => {
    const vote = readPollVote(
      ev(1018, [
        ["e", NOTE],
        ["response", "opt1"],
        ["response", "opt9"],
      ]),
    );
    expect(vote).toEqual({ poll: { id: NOTE, relay: undefined }, responses: ["opt1", "opt9"] });
    const poll = { tags: [["option", "opt1", "Yes"]] };
    expect(pollChoices(vote.responses, poll)).toEqual(["Yes", "opt9"]);
    expect(pollChoices(vote.responses, undefined)).toEqual(["opt1", "opt9"]);
  });

  it("an RSVP (31925): the status in words, free/busy, and the appointment", () => {
    const appt = `31923:${ALICE}:meetup`;
    expect(
      readRsvp(
        ev(
          31925,
          [
            ["d", "x"],
            ["a", appt],
            ["status", "accepted"],
            ["fb", "busy"],
          ],
          "see you there",
        ),
      ),
    ).toMatchObject({ status: "accepted", word: "Going", freeBusy: "busy", appointment: appt, note: "see you there" });
    expect(readRsvp(ev(31925, [["status", "tentative"]])).word).toBe("Maybe going");
    // NIP-52: a "no" says nothing of free or busy.
    expect(
      readRsvp(
        ev(31925, [
          ["status", "declined"],
          ["fb", "busy"],
        ]),
      ),
    ).toMatchObject({ word: "Not going", freeBusy: null });
    expect(readRsvp(ev(31925, [["status", "whatever"]]))).toMatchObject({ status: null, word: "Replied" });
  });

  it("a follow list (3): the people each once, and followed hashtags", () => {
    expect(
      readFollows(
        ev(3, [
          ["p", ALICE],
          ["p", ALICE.toUpperCase()],
          ["p", "junk"],
          ["p", PAYER],
          ["t", "bitcoin"],
        ]),
      ),
    ).toEqual({ people: [ALICE, PAYER], hashtags: ["bitcoin"] });
  });

  it("targetsOf skips what is not an event or an address", () => {
    expect(
      targetsOf({
        tags: [
          ["e", "nope"],
          ["a", "1:short:x"],
          ["e", NOTE],
        ],
      }),
    ).toEqual([{ id: NOTE, relay: undefined }]);
  });
});

describe("trusted assertions (NIP-85)", () => {
  it("30382: the person, the rank, and an absent `hops` read as no known path — never 0", () => {
    const a = readAssertion(
      ev(30382, [
        ["d", ALICE],
        ["rank", "63"],
        ["followers", "188"],
        ["reporters", "0"],
        ["muters", "1"],
      ]),
    );
    expect(a).toMatchObject({ pubkey: ALICE, rank: 63, hops: null, ref: null });
    expect(a.metrics.map((m) => m.tag)).toEqual(["rank", "followers", "reporters", "muters"]);
    expect(
      readAssertion(
        ev(30382, [
          ["d", ALICE],
          ["hops", "0"],
        ]),
      ).hops,
    ).toBe(0);
  });

  it("30383 and 30384 name the event or address scored; 30385 its identifier", () => {
    expect(
      readAssertion(
        ev(30383, [
          ["d", NOTE],
          ["rank", "9"],
        ]),
      ).ref,
    ).toEqual({ id: NOTE });
    expect(readAssertion(ev(30384, [["d", `30023:${ALICE}:essay`]])).ref).toEqual({ addr: `30023:${ALICE}:essay` });
    expect(readAssertion(ev(30385, [["d", "isbn:978"]])).identifier).toBe("isbn:978");
  });

  it("reads numbers only, each once, and names them in words", () => {
    expect(
      assertionMetrics({
        tags: [
          ["d", "1"],
          ["k", "1"],
          ["zap_cnt", "3"],
          ["zap_cnt", "4"],
          ["note", "hi"],
        ],
      }),
    ).toEqual([{ tag: "zap_cnt", value: 3 }]);
    expect(metricNoun("zap_cnt")).toBe("zaps");
    expect(metricNoun("personalizedGrapeRank_influence")).toBe("personalized grape rank influence");
  });
});
