/**
 * Primal's pretty URLs name Nostr entities without a bech32 in them:
 * `primal.net/<nip05-name>/<slug>` is that person's kind-30023 article,
 * `primal.net/<nip05-name>` is the person. A note carrying one rendered as
 * a bare "primal.net" chip that left Brainstorm (Benjamin, 2026-09-23). The
 * grammar, on its own: what a URL names, or null.
 */
import { describe, expect, it } from "vitest";
import { primalRef, clientLinkKey } from "./clientLinks";

describe("primalRef", () => {
  it("two segments name an article: the author's NIP-05 name and the article's d tag", () => {
    expect(primalRef("https://primal.net/whitenoise/were-back")).toEqual({ kind: "article", name: "whitenoise", identifier: "were-back" });
  });

  it("one segment names a person; trailing slash, query, hash, www and http are tolerated; the bare root is nothing", () => {
    expect(primalRef("https://primal.net/alice")).toEqual({ kind: "profile", name: "alice" });
    expect(primalRef("http://www.primal.net/alice/?utm=x#top")).toEqual({ kind: "profile", name: "alice" });
    expect(primalRef("https://primal.net/")).toBeNull();
    expect(primalRef("https://example.com/alice/post")).toBeNull();
  });

  it("Primal's own routes are not people: e, p, a, reads, settings, files", () => {
    expect(primalRef("https://primal.net/e/" + "f".repeat(64))).toBeNull();
    expect(primalRef("https://primal.net/p/" + "f".repeat(64))).toBeNull();
    expect(primalRef("https://primal.net/reads")).toBeNull();
    expect(primalRef("https://primal.net/settings/x")).toBeNull();
    expect(primalRef("https://primal.net/favicon.ico")).toBeNull();
  });

  it("normalises the name, decodes the slug, and sheds the prose around a link", () => {
    expect(primalRef("https://primal.net/Alice/My%20Post")).toEqual({ kind: "article", name: "alice", identifier: "My Post" });
    expect(primalRef("https://primal.net/alice/my-post.")).toEqual({ kind: "article", name: "alice", identifier: "my-post" });
    expect(primalRef("(https://primal.net/alice)")).toBeNull(); // the tokeniser never hands over the paren; a stray one is not a name
    expect(primalRef("https://primal.net/al ice/post")).toBeNull();
    expect(primalRef("https://primal.net/alice/post/extra")).toBeNull();
  });

  it("keys a ref canonically, so `…/slug` and `…/slug.` share one lookup", () => {
    expect(clientLinkKey(primalRef("https://primal.net/alice/my-post")!)).toBe(clientLinkKey(primalRef("https://primal.net/alice/my-post.")!));
    expect(clientLinkKey({ kind: "profile", name: "alice" })).not.toBe(clientLinkKey({ kind: "article", name: "alice", identifier: "x" }));
  });
});
