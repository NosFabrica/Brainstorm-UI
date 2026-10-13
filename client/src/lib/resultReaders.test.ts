import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { summarizeResult } from "./resultSummary";
import { readKind, who } from "./resultReaders";

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
    const sk = generateSecretKey();
    const payer = getPublicKey(sk);
    const request = JSON.stringify(
      finalizeEvent(
        {
          kind: 9734,
          created_at: 1,
          content: "great post",
          tags: [
            ["amount", "21000"],
            ["p", B],
            ["e", NOTE],
          ],
        },
        sk,
      ),
    );
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
    expect(s.by).toBe(payer);
    expect(s.body).toBe("great post");
    expect(s.ref).toMatchObject({ id: NOTE });
  });

  it("a zap receipt whose request nobody signed stays the signer's row, not the payer it names", () => {
    const request = JSON.stringify({ kind: 9734, pubkey: C, content: "", tags: [["e", NOTE]] });
    const s = summarizeResult(
      ev(9735, [
        ["p", B],
        ["P", C],
        ["e", NOTE],
        ["description", request],
      ]),
    );
    // No `by`: the row is the signer's.
    expect(s.by).toBeNull();
  });

  it("a receipt wrapping someone's real request: the comment is the request's, the amount unpinned", () => {
    const sk = generateSecretKey();
    const payer = getPublicKey(sk);
    const request = JSON.stringify(
      finalizeEvent(
        {
          kind: 9734,
          created_at: 1,
          content: "great post",
          tags: [
            ["p", B],
            ["e", NOTE],
          ],
        },
        sk,
      ),
    );
    const s = summarizeResult(
      ev(
        9735,
        [
          ["p", B],
          ["e", NOTE],
          ["bolt11", "lnbc210n1pxyz"],
          ["description", request],
        ],
        "I endorse scam.example",
      ),
    );
    expect(s.by).toBe(payer);
    expect(s.body).toBe("great post");
    // The request names no amount: the invoice's is the receipt's word.
    expect(s.title).toBe(`⚡ ≈21 sats to ${npub(B)}`);
  });

  it("an RSVP status that is an object's own property name reads as a reply", () => {
    expect(summarizeResult(ev(31925, [["status", "constructor"]])).title).toBe("Replied");
    expect(summarizeResult(ev(31925, [["status", "__proto__"]])).title).toBe("Replied");
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

  it("a score's row leaves its timestamps out of its numbers", () => {
    const s = summarizeResult(
      ev(30385, [
        ["d", "https://mint.example"],
        ["mint_audit_at", "1791913269"],
        ["rank", "96"],
      ]),
    );
    expect(s.facts).toEqual(["Rank 96"]);
  });

  it("a badge award with an opaque badge id lets the badge name itself", () => {
    const s = summarizeResult(
      ev(8, [
        ["a", `30009:${A}:e787ec6d-872e-4153-88b0-74cab22b6947`],
        ["p", C],
      ]),
    );
    expect(s.title).toBe("Awarded a badge");
    expect(s.ref?.addr).toContain("30009:");
  });

  it("a badge award by someone else than the badge's issuer only claims it (NIP-58)", () => {
    const s = summarizeResult(
      ev(8, [
        ["a", `30009:${B}:bravery`],
        ["p", C],
      ]),
    );
    expect(s.title).toBe("Claims the “bravery” badge");
  });

  it("an approval is the community's word only from its owner; anyone else says it approved", () => {
    expect(summarizeResult(ev(4550, [["a", `34550:${A}:cooking`]])).title).toBe("Approved a post");
    expect(summarizeResult(ev(4550, [["a", `34550:${B}:cooking`]])).title).toBe("Says it approved a post");
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

// A video's row said who and when and nothing about the video. Its own tags say how long it
// runs, and a restored Vine's say how often it looped in its first life.
describe("a NIP-71 video's row", () => {
  const imeta = ["imeta", "url https://media.divine.video/b0f9", "m video/mp4", "dim 1080x1920"];
  const native = (tags: string[][] = []) =>
    ev(34236, [["d", "b0f9"], ["title", "Morning at the lake"], ["summary", "Mist over the water"], imeta, ...tags]);
  const vine = (tags: string[][] = []) =>
    ev(34236, [
      ["d", "hF2PTbJmJBz"],
      ["title", "Do it for the vine"],
      ["imeta", "url https://media.divine.video/hf2p", "m video/mp4", "dim 480x480"],
      ["platform", "vine"],
      ["l", "vine-archive", "archive.divine.video"],
      ["L", "archive.divine.video"],
      ["likes", "40213"],
      ...tags,
    ]);

  it("a native video says its length", () => {
    expect(readKind(native([["duration", "6"]]))?.facts).toEqual(["6s"]);
    // A fraction is the nearest second; from a minute up it reads as a clock.
    expect(readKind(native([["duration", "6.033"]]))?.facts).toEqual(["6s"]);
    expect(readKind(native([["duration", "65"]]))?.facts).toEqual(["1:05"]);
    expect(readKind(native([["duration", "3725"]]))?.facts).toEqual(["1:02:05"]);
  });

  it("every video kind is read, the imeta's own length first", () => {
    for (const kind of [21, 22, 34235, 34236]) {
      const event = ev(kind, [
        ["imeta", "url https://cdn.example/v.mp4", "m video/mp4", "duration 12"],
        ["duration", "90"],
      ]);
      expect(readKind(event)?.facts).toEqual(["12s"]);
    }
  });

  it("a classic Vine says its length and its loops, counted with separators", () => {
    expect(
      readKind(
        vine([
          ["duration", "6"],
          ["loops", "1234567"],
        ]),
      )?.facts,
    ).toEqual(["6s", "1,234,567 loops"]);
    expect(readKind(vine([["loops", "1"]]))?.facts).toEqual(["1 loop"]);
  });

  it("a video without a duration says no length", () => {
    expect(readKind(native())?.facts).toEqual([]);
    expect(readKind(native([["duration", "soon"]]))?.facts).toEqual([]);
    expect(readKind(vine([["loops", "9000"]]))?.facts).toEqual(["9,000 loops"]);
  });

  it("loops are a Vine's: the tag on anything else is not read", () => {
    expect(readKind(native([["loops", "500"]]))?.facts).toEqual([]);
  });

  it("the row keeps its title, words and video, and gains the facts", () => {
    const s = summarizeResult(native([["duration", "6"]]));
    expect(s.title).toBe("Morning at the lake");
    expect(s.body).toBe("Mist over the water");
    expect(s.video).toBe("https://media.divine.video/b0f9");
    expect(s.facts).toEqual(["6s"]);
  });
});

// The page's heroes and the row read through lib/activity: the row says the same in a line.
describe("the row reads what the page reads", () => {
  it("an external reaction (17) names its NIP-73 target, which has no event to quote", () => {
    const s = summarizeResult(
      ev(
        17,
        [
          ["k", "web"],
          ["i", "https://example.com/post/1"],
        ],
        "+",
      ),
    );
    expect(s.title).toBe("Reacted ❤");
    expect(s.body).toBe("on example.com/post/1");
    expect(s.ref).toBeNull();
  });

  it("a BOLT12 zap (9736) is the payer's row; an onchain zap (8333) its signer's", () => {
    const bolt12 = summarizeResult({
      ...ev(9736, [
        ["p", B],
        ["amount", "21000"],
        ["P", C],
        ["e", NOTE],
      ]),
      pubkey: C,
    });
    expect(bolt12.title).toBe(`⚡ 21 sats to ${npub(B)}`);
    expect(bolt12.by).toBe(C);
    expect(bolt12.ref).toMatchObject({ id: NOTE });
    // Signed by another key than the `P` it names: the payer is only claimed, so the row stays the signer's.
    const claimed = summarizeResult(
      ev(9736, [
        ["p", B],
        ["amount", "21000"],
        ["P", C],
      ]),
    );
    expect(claimed.by).toBeNull();
    const onchain = summarizeResult(
      ev(8333, [
        ["i", `bitcoin:tx:${"f".repeat(64)}`],
        ["p", B],
        ["amount", "50000"],
      ]),
    );
    expect(onchain.title).toBe(`⚡ 50,000 sats to ${npub(B)}`);
    expect(onchain.facts).toEqual(["Onchain"]);
    expect(onchain.by).toBeNull();
  });
});
