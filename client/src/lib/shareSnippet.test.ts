import { describe, expect, it } from "vitest";
import { shareSnippet } from "./shareSnippet";

const ev = (kind: number, tags: string[][], content: string) => ({
  id: "e".repeat(64),
  pubkey: "a".repeat(64),
  kind,
  created_at: 1,
  tags,
  content,
});

// What a shared link's preview says under the title: the event in words, not its raw content.
describe("shareSnippet", () => {
  it("a note is its text, on one line, cut at 160", () => {
    expect(shareSnippet(ev(1, [], "hello\n\n  world"))).toBe("hello world");
    expect(shareSnippet(ev(1, [], "x".repeat(300)))).toHaveLength(160);
  });

  it("a voice message is not its file's address", () => {
    expect(shareSnippet(ev(1222, [], "https://x.example/a.webm"))).toBe("A voice message");
    expect(shareSnippet(ev(1244, [], "https://x.example/b.webm"))).toBe("A voice reply");
  });

  it("a reaction says it reacted, not its '+'", () => {
    expect(shareSnippet(ev(7, [["e", "1".repeat(64)]], "+"))).toBe("Reacted ❤");
  });

  it("a follow list says how many it follows, not an empty string or JSON", () => {
    expect(
      shareSnippet(
        ev(
          3,
          [
            ["p", "b".repeat(64)],
            ["p", "c".repeat(64)],
          ],
          "",
        ),
      ),
    ).toBe("Follows 2 people");
  });

  it("a repost is the note it carries, never its JSON", () => {
    const inner = {
      id: "1".repeat(64),
      pubkey: "b".repeat(64),
      kind: 1,
      created_at: 1,
      tags: [],
      content: "hi there",
      sig: "x",
    };
    expect(shareSnippet(ev(6, [["e", inner.id]], JSON.stringify(inner)))).toBe("hi there");
    expect(shareSnippet(ev(16, [["e", inner.id]], ""))).toBe("A repost");
  });
});
