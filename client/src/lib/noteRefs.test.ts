import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { analyzeNote, noteHeadingOf, replyRefs, sameScope } from "./noteRefs";
import { externalRef } from "./nip73";

const ev = (kind: number, tags: string[][]) => ({ id: "", kind, pubkey: "", created_at: 0, content: "", tags });

describe("replyRefs", () => {
  it("a reply's root and parent", () => {
    expect(
      replyRefs(
        ev(1, [
          ["e", "r", "", "root"],
          ["e", "p", "", "reply"],
        ]),
      ),
    ).toEqual({ rootId: "r", parentId: "p" });
  });

  it("a highlight's `e` is the text it quotes, not a post it answers", () => {
    expect(replyRefs(ev(9802, [["e", "source"]]))).toEqual({});
  });
});

describe("a list's `e` tags are items, not a thread", () => {
  // A kind-30003 notes pin from search.brainstorm.world (2026-10-08): six notes, no markers.
  const pin = ev(30003, [
    ["d", "notes-pin-2efaa715-2efaa715-stoicism"],
    ["title", "stoicism — notes"],
    ["e", "8b27ce0176d923e44ca50063d934be916f75e93d2cf4c0df98e797cd1aa67190"],
    ["e", "ef7be3aca3019a58de3dd4f8c4eff6e66264e24bf45103edf9d95f8f775aa972"],
    ["p", "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331"],
  ]);

  it("has no root or parent", () => {
    expect(replyRefs(pin)).toEqual({});
  });

  it("is not a reply to anyone", () => {
    const a = analyzeNote(pin);
    expect(a.isReply).toBe(false);
    expect(a.replyToPubkeys).toEqual([]);
  });

  it("a comment (NIP-22) still threads by its `e`", () => {
    expect(replyRefs(ev(1111, [["e", "parent"]]))).toEqual({ rootId: "parent", parentId: "parent" });
    expect(analyzeNote(ev(1111, [["e", "parent"]])).isReply).toBe(true);
  });

  it("bookmarks (10003) and articles (30023) are not replies either", () => {
    expect(replyRefs(ev(10003, [["e", "n"]]))).toEqual({});
    expect(analyzeNote(ev(30023, [["e", "n"]])).isReply).toBe(false);
  });

  it("a reaction keeps the post it is about above it", () => {
    expect(replyRefs(ev(7, [["e", "post"]]))).toEqual({ rootId: "post", parentId: "post" });
  });

  it("a legacy positional note reply still threads", () => {
    expect(
      replyRefs(
        ev(1, [
          ["e", "r"],
          ["e", "p"],
        ]),
      ),
    ).toEqual({ rootId: "r", parentId: "p" });
  });
});

describe("NIP-22 comment scopes (kind 1111)", () => {
  const AUTHOR = "b".repeat(64);
  const ARTICLE = `30023:${AUTHOR}:my-article`;
  const ROOT_ID = "1".repeat(64);
  const PARENT_ID = "2".repeat(64);

  it("a reply to a comment: root from `E`, parent from `e`, kinds from `K`/`k`", () => {
    const refs = replyRefs(
      ev(1111, [
        ["E", ROOT_ID, "wss://root.example.com", AUTHOR],
        ["K", "1"],
        ["e", PARENT_ID, "wss://parent.example.com", AUTHOR],
        ["k", "1111"],
        ["p", AUTHOR],
      ]),
    );
    expect(refs).toEqual({
      rootId: ROOT_ID,
      parentId: PARENT_ID,
      rootKind: "1",
      parentKind: "1111",
      hints: ["wss://root.example.com", "wss://parent.example.com"],
    });
  });

  it("a top-level comment on an article: the address is both root and parent", () => {
    const comment = ev(1111, [
      ["A", ARTICLE, "wss://relay.example.com"],
      ["K", "30023"],
      ["a", ARTICLE, "wss://relay.example.com"],
      ["e", PARENT_ID, "wss://relay.example.com"],
      ["k", "30023"],
      ["P", AUTHOR],
      ["p", AUTHOR],
    ]);
    const refs = replyRefs(comment);
    const addr = { kind: 30023, pubkey: AUTHOR, identifier: "my-article", relays: ["wss://relay.example.com"] };
    expect(refs.rootAddr).toEqual(addr);
    expect(refs.parentAddr).toEqual(addr);
    expect(refs.parentId).toBe(PARENT_ID);
    expect(refs.rootKind).toBe("30023");
    expect(sameScope({ addr: refs.rootAddr }, { id: refs.parentId, addr: refs.parentAddr })).toBe(true);
    // The scope is the thread above it, not a link it carries below.
    const a = analyzeNote(comment);
    expect(a.isReply).toBe(true);
    expect(a.addrs).toEqual([]);
    expect(a.replyToPubkeys).toEqual([AUTHOR]);
  });

  it("a reply under an article's comment: the article is the root, the comment the parent", () => {
    const refs = replyRefs(
      ev(1111, [
        ["A", ARTICLE],
        ["K", "30023"],
        ["e", PARENT_ID],
        ["k", "1111"],
      ]),
    );
    expect(refs.rootAddr?.identifier).toBe("my-article");
    expect(refs.parentId).toBe(PARENT_ID);
    expect(refs.parentAddr).toBeUndefined();
    expect(sameScope({ addr: refs.rootAddr }, { id: refs.parentId })).toBe(false);
  });

  it("a comment on a web page: an external root (`I`)", () => {
    const comment = ev(1111, [
      ["I", "https://example.com/post"],
      ["K", "web"],
      ["i", "https://example.com/post"],
      ["k", "web"],
    ]);
    expect(replyRefs(comment)).toEqual({
      rootExternal: "https://example.com/post",
      parentExternal: "https://example.com/post",
      rootKind: "web",
      parentKind: "web",
    });
    expect(analyzeNote(comment).isReply).toBe(true);
    expect(analyzeNote(comment).replyToPubkeys).toEqual([]);
  });

  it("names external ids: a URL links, a book is labelled", () => {
    expect(externalRef("https://example.com/post")).toEqual({
      label: "Web page",
      text: "https://example.com/post",
      href: "https://example.com/post",
    });
    expect(externalRef("isbn:9780765382030")).toEqual({ label: "Book", text: "9780765382030", href: undefined });
    expect(externalRef("podcast:item:guid:abc")).toMatchObject({ label: "Podcast episode", text: "abc" });
    expect(externalRef("#bitcoin")).toEqual({ label: "Hashtag", text: "#bitcoin" });
    expect(externalRef("")).toBeNull();
  });
});

describe("NIP-C7 chat (kind 9): the `q` is the message it answers", () => {
  const PARENT = "c".repeat(64);
  const QUOTED = "d".repeat(64);
  const SENDER = "e".repeat(64);

  it("reads the `q` tag as the parent", () => {
    const msg = ev(9, [["q", PARENT, "wss://chat.example.com", SENDER]]);
    expect(replyRefs(msg)).toEqual({ rootId: PARENT, parentId: PARENT, hints: ["wss://chat.example.com"] });
    const a = analyzeNote(msg);
    expect(a.isReply).toBe(true);
    expect(a.replyToPubkeys).toEqual([SENDER]);
    // The parent is drawn above, not again as a quote below.
    expect(a.quoteIds).toEqual([]);
  });

  it("the spec's own form — the text names the parent it answers — is still a reply to it", () => {
    // NIP-C7: content "nostr:nevent1…\nyes", tags [["q", <id>, <relay>, <pubkey>]].
    const nevent = nip19.neventEncode({ id: PARENT });
    const msg = { ...ev(9, [["q", PARENT, "wss://r.example", SENDER]]), content: `nostr:${nevent}\nyes` };
    expect(replyRefs(msg)).toEqual({ rootId: PARENT, parentId: PARENT, hints: ["wss://r.example"] });
    const a = analyzeNote(msg);
    expect(a.isReply).toBe(true);
    expect(a.replyToPubkeys).toEqual([SENDER]);
    // Drawn above as the parent, not again below as a quote.
    expect(a.quoteIds).toEqual([]);
  });

  it("only the first `q` is the parent; a second one the text quotes stays a quote", () => {
    const nevent = nip19.neventEncode({ id: QUOTED });
    const msg = {
      ...ev(9, [
        ["q", PARENT],
        ["q", QUOTED],
      ]),
      content: `see nostr:${nevent}`,
    };
    expect(replyRefs(msg)).toMatchObject({ parentId: PARENT });
    expect(analyzeNote(msg).quoteIds).toEqual([QUOTED]);
  });

  it("a kind-1 `q` stays a quote", () => {
    expect(replyRefs(ev(1, [["q", QUOTED]]))).toEqual({});
    expect(analyzeNote(ev(1, [["q", QUOTED]])).quoteIds).toEqual([QUOTED]);
  });
});

describe("noteHeadingOf", () => {
  it("a NIP-7D thread's title", () => {
    expect(noteHeadingOf(ev(11, [["title", "  Relay operators: what breaks first?  "]]))).toBe(
      "Relay operators: what breaks first?",
    );
  });

  it("a note's NIP-14 subject, but not a reply's Re:", () => {
    expect(noteHeadingOf(ev(1, [["subject", "Weekly update"]]))).toBe("Weekly update");
    expect(noteHeadingOf(ev(1, [["subject", "Re: Weekly update"]]))).toBeNull();
  });

  it("nothing for other kinds or empty tags", () => {
    expect(noteHeadingOf(ev(1, [["title", "not a subject"]]))).toBeNull();
    expect(noteHeadingOf(ev(1111, [["title", "x"]]))).toBeNull();
    expect(noteHeadingOf(ev(11, [["title", " "]]))).toBeNull();
  });
});

describe("threading, second audit (2026-10)", () => {
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  const D = "d".repeat(64);
  const ev = (kind: number, tags: string[][], content = "") => ({
    id: "c".repeat(64),
    kind,
    pubkey: "1".repeat(64),
    created_at: 1,
    content,
    tags,
  });

  it("a repost (6/16) is no reply: its `e` is the post it carries, drawn once, inside it", () => {
    for (const kind of [6, 16]) {
      const rp = ev(kind, [
        ["e", D, "wss://r.example"],
        ["p", "2".repeat(64)],
      ]);
      expect(replyRefs(rp)).toEqual({});
      expect(analyzeNote(rp).isReply).toBe(false);
    }
  });

  it("a voice reply (1244) threads by its NIP-22 scopes, like a comment", () => {
    const v = ev(
      1244,
      [
        ["E", A, "", "2".repeat(64)],
        ["K", "1222"],
        ["e", B, "", "3".repeat(64)],
        ["k", "1244"],
      ],
      "https://x.example/a.webm",
    );
    expect(replyRefs(v)).toMatchObject({ rootId: A, parentId: B, rootKind: "1222", parentKind: "1244" });
    expect(analyzeNote(v).isReply).toBe(true);
  });

  it("a comment naming only its root scope (E/A/I) is still a reply", () => {
    expect(
      analyzeNote(
        ev(
          1111,
          [
            ["E", A],
            ["K", "1"],
          ],
          "hi",
        ),
      ).isReply,
    ).toBe(true);
    expect(
      analyzeNote(
        ev(
          1111,
          [
            ["A", `30023:${B}:x`],
            ["K", "30023"],
          ],
          "hi",
        ),
      ).isReply,
    ).toBe(true);
    expect(
      analyzeNote(
        ev(
          1111,
          [
            ["I", "https://example.com"],
            ["K", "web"],
          ],
          "hi",
        ),
      ).isReply,
    ).toBe(true);
    expect(replyRefs(ev(1111, [["E", A]], "hi"))).toMatchObject({ rootId: A, parentId: A });
  });
});
