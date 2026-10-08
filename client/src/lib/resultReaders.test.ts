import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { summarizeResult } from "./resultSummary";
import { who } from "./resultReaders";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const NOTE = "1".repeat(64);
const npub = (pk: string) => `nostr:${nip19.npubEncode(pk)}`;
const ev = (kind: number, tags: string[][] = [], content = "") => ({
  id: "e".repeat(64),
  pubkey: A,
  kind,
  created_at: 1_790_000_000,
  tags,
  content,
});

// Surveyed on the production relay (2026-10-07): these kinds read as nothing but a byline
// and a pill. Each now says what it did, to whom, and points at what it is about.
describe("the kinds whose meaning is in their tags", () => {
  it("a reaction: the mark, to whom, and the note it is on", () => {
    const s = summarizeResult(
      ev(
        7,
        [
          ["e", NOTE],
          ["p", B],
        ],
        "+",
      ),
    );
    expect(s.title).toBe("Reacted ❤");
    expect(s.facts).toEqual([`to ${npub(B)}`]);
    expect(s.ref).toMatchObject({ id: NOTE });
    expect(s.body).toBeNull();
  });

  it("a zap receipt: the amount from its invoice, the payer, the memo", () => {
    const request = JSON.stringify({ pubkey: C, content: "great post", tags: [["amount", "21000"]] });
    const s = summarizeResult(
      ev(9735, [
        ["p", B],
        ["e", NOTE],
        ["bolt11", "lnbc210n1pxyz"],
        ["description", request],
      ]),
    );
    expect(s.title).toBe(`⚡ 21 sats to ${npub(B)}`);
    // The row is the payer's; the signer is their recipient's wallet service.
    expect(s.by).toBe(C);
    expect(s.body).toBe("great post");
    expect(s.ref).toMatchObject({ id: NOTE });
  });

  it("a repost is the note it carries", () => {
    const inner = { id: NOTE, pubkey: B, kind: 1, created_at: 1, tags: [], content: "hello world", sig: "x" };
    const s = summarizeResult(
      ev(
        6,
        [
          ["e", NOTE],
          ["p", B],
        ],
        JSON.stringify(inner),
      ),
    );
    expect(s.body).toBe("hello world");
    expect(s.facts).toEqual([`Repost of ${npub(B)}`]);
    // Without the note inside, it points at it.
    expect(
      summarizeResult(
        ev(
          6,
          [
            ["e", NOTE],
            ["p", B],
          ],
          "",
        ),
      ).ref,
    ).toMatchObject({ id: NOTE });
  });

  it("a follow list counts its people and names the first few", () => {
    const s = summarizeResult(
      ev(3, [
        ["p", B],
        ["p", C],
        ["p", A],
        ["p", "d".repeat(64)],
      ]),
    );
    expect(s.title).toBe("Follows 4 people");
    expect(s.body).toContain(" and 1 other");
  });

  it("a relay list previews its hosts; a list counts what each tag is", () => {
    const s = summarizeResult(
      ev(10002, [
        ["r", "wss://nos.lol/"],
        ["r", "wss://relay.damus.io"],
      ]),
    );
    expect(s.body).toBe("nos.lol, relay.damus.io");
    expect(s.facts).toEqual(["2 relays"]);
    const badges = summarizeResult(
      ev(10008, [
        ["a", `30009:${B}:x`],
        ["e", NOTE],
        ["a", `30009:${C}:y`],
        ["e", NOTE],
      ]),
    );
    expect(badges.facts).toEqual(["2 notes", "2 badges"]);
  });

  it("a sealed list says it is private, not empty", () => {
    const s = summarizeResult(ev(10000, [], "A".repeat(80)));
    expect(s.title).toBeNull();
    expect(s.shape).toBe("encrypted");
  });

  it("a report names who, and why", () => {
    const s = summarizeResult(ev(1984, [["p", B, "spam"]]));
    expect(s.title).toBe(`Reported ${npub(B)}`);
    expect(s.facts).toEqual(["Spam"]);
  });

  it("an RSVP says going or not, and points at the event", () => {
    const s = summarizeResult(
      ev(31925, [
        ["a", `31923:${B}:meetup`],
        ["status", "accepted"],
        ["d", "x"],
      ]),
    );
    expect(s.title).toBe("Going");
    expect(s.ref).toEqual({ addr: `31923:${B}:meetup` });
  });

  it("a trust score names its subject and says its numbers in words", () => {
    const s = summarizeResult(
      ev(30382, [
        ["d", B],
        ["rank", "87"],
        ["followers", "3057"],
        ["post_cnt", "1"],
      ]),
    );
    expect(s.title).toBe(`Trust score for ${npub(B)}`);
    expect(s.facts).toEqual(["Rank 87", "3,057 followers", "1 post"]);
  });

  it("a badge award with an opaque badge id lets the badge name itself", () => {
    const s = summarizeResult(
      ev(8, [
        ["a", `30009:${B}:e787ec6d-872e-4153-88b0-74cab22b6947`],
        ["p", C],
      ]),
    );
    expect(s.title).toBe("Awarded a badge");
    expect(s.ref?.addr).toContain("30009:");
  });

  it("a P2P order: side, fiat amount, status and sats", () => {
    const s = summarizeResult(
      ev(38383, [
        ["k", "sell"],
        ["fa", "1000000"],
        ["f", "COP"],
        ["s", "canceled"],
        ["amt", "359987"],
        ["d", "x"],
      ]),
    );
    expect(s.title).toBe("Sell order · 1,000,000 COP");
    expect(s.facts.slice(0, 2)).toEqual(["Canceled", "359,987 sats"]);
  });

  it("code is shown as code; an encrypted job request as private", () => {
    const code = summarizeResult(ev(1337, [["l", "rust"]], 'fn main() {\n  println!("hi");\n}'));
    expect(code.code).toBe(true);
    expect(code.body).toContain("println!");
    expect(code.facts).toEqual(["rust"]);
    expect(summarizeResult(ev(5302, [["encrypted"]], "A".repeat(80))).shape).toBe("encrypted");
  });

  it("JSON content names itself when it carries a name and words", () => {
    const s = summarizeResult(ev(10100, [], JSON.stringify({ name: "Loom Worker", description: "2vcpu, 4gb ram" })));
    expect(s.title).toBe("Loom Worker");
    expect(s.body).toBe("2vcpu, 4gb ram");
  });
});

describe("Tapestry's trusted lists", () => {
  it("count what they hold", () => {
    const s = summarizeResult(
      ev(30392, [
        ["d", "bitcoin-meetup"],
        ["title", "Bitcoin Meetup"],
        ["p", B],
        ["p", C],
      ]),
    );
    expect(s.title).toBe("Bitcoin Meetup");
    expect(s.facts).toEqual(["2 people"]);
  });

  it("say whose tag a list was built from and whose web of trust ranked it, never the JSON", () => {
    const s = summarizeResult(
      ev(
        30392,
        [
          ["title", "Podcaster"],
          ["observer", B],
          ["source-tag", "f".repeat(64), C, "podcaster"],
          ["p", C, "", "50"],
          ["p", B, "", "93"],
        ],
        JSON.stringify({ members: [{ pubkey: B, endorsements: 4, disputes: 0, score: 93 }] }),
      ),
    );
    expect(s.title).toBe("Podcaster");
    // Best first.
    expect(s.body).toBe(`${who(B)} and ${who(C)}`);
    expect(s.facts).toEqual(["2 people", `From ${who(C)}'s tag`, `Ranked by ${who(B)}`]);
    expect(s.shape).toBeNull();
  });

  // Most on the relay are pinned-tag copies with no one on them yet.
  it("say an empty list is empty, not JSON", () => {
    const s = summarizeResult(
      ev(
        30392,
        [
          ["title", "Bitcoin Vendor"],
          ["metric", "pinned-tag-membership"],
          ["observer", B],
        ],
        JSON.stringify({ members: [] }),
      ),
    );
    expect(s.title).toBe("Bitcoin Vendor");
    expect(s.body).toBeNull();
    expect(s.shape).toBeNull();
    expect(s.facts).toEqual(["No one yet", `Ranked by ${who(B)}`]);
  });
});

// The audit (2026-10-07): what the row lost, said wrong, or cut without saying so.
describe("the row says what it means", () => {
  it("a channel mute's reason is public, not encrypted", () => {
    const s = summarizeResult(ev(44, [["p", B]], JSON.stringify({ reason: "spam" })));
    expect(s.shape).toBeNull();
    expect(s.facts).toEqual(["spam"]);
  });

  it("a job result is never JSON or ciphertext as words; a zap poll is not a job", () => {
    const json = summarizeResult(ev(6300, [["e", NOTE]], JSON.stringify([["e", NOTE]])));
    expect(json.body).toBeNull();
    expect(json.shape).toBe("json");
    const sealed = summarizeResult(ev(6302, [["encrypted"]], "A".repeat(80)));
    expect(sealed.shape).toBe("encrypted");
    expect(summarizeResult(ev(6969, [], "Which one?")).body).toBe("Which one?");
  });

  it("a cut list says how many more", () => {
    const tags = Array.from({ length: 10 }, (_, i) => ["t", `tag${i}`]);
    expect(summarizeResult(ev(10015, tags)).body).toMatch(/#tag7 and 2 more$/);
    const labels = summarizeResult(
      ev(1985, [
        ["l", "a"],
        ["l", "b"],
        ["l", "c"],
        ["l", "d"],
        ["e", NOTE],
      ]),
    );
    expect(labels.title).toBe("Labelled “a”, “b”, “c” and 1 more");
  });

  it("cut code ends in an ellipsis line", () => {
    const s = summarizeResult(ev(1337, [], Array.from({ length: 9 }, (_, i) => `line ${i}`).join("\n")));
    expect(s.body?.split("\n").at(-1)).toBe("…");
  });
});

describe("a list's row", () => {
  it("a bookmark set of notes quotes its first note", () => {
    expect(
      summarizeResult(
        ev(30003, [
          ["title", "Stoicism"],
          ["e", NOTE],
          ["e", B],
        ]),
      ).ref,
    ).toMatchObject({ id: NOTE });
  });

  it("a mute list never quotes the thread it hides", () => {
    expect(
      summarizeResult(
        ev(10000, [
          ["e", NOTE],
          ["word", "spoilers"],
        ]),
      ).ref,
    ).toBeNull();
  });
});
