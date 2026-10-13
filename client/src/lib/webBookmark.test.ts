/**
 * A NIP-B0 web bookmark is one link: the page in its `d` tag (no scheme),
 * its name in `title`, the saver's words in its content.
 */
import { describe, expect, it } from "vitest";
import { webBookmarkOf } from "./webBookmark";

const ev = (tags: string[][], content = "", kind = 39701) => ({ kind, tags, content });

describe("webBookmarkOf", () => {
  it("reads the page from the d tag, adding the https the spec leaves out", () => {
    expect(
      webBookmarkOf(
        ev(
          [
            ["d", "www.alice.blog/post?id=1"],
            ["title", "Alice's post"],
            ["t", "nostr"],
            ["t", "nostr"],
          ],
          " Worth a read ",
        ),
      ),
    ).toEqual({
      url: "https://www.alice.blog/post?id=1",
      host: "alice.blog",
      title: "Alice's post",
      description: "Worth a read",
      topics: ["nostr"],
    });
  });

  it("keeps a scheme the d tag already has, and has no title when none is given", () => {
    expect(webBookmarkOf(ev([["d", "http://old.example/x"]]))).toMatchObject({
      url: "http://old.example/x",
      host: "old.example",
      title: null,
    });
  });

  it("is nothing without a page, with a page that is not a web page, or for another kind", () => {
    expect(webBookmarkOf(ev([]))).toBeNull();
    expect(webBookmarkOf(ev([["d", "ftp://files.example/a"]]))).toBeNull();
    expect(webBookmarkOf(ev([["d", "alice.blog"]], "", 30003))).toBeNull();
  });
});
