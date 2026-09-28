/**
 * Nostr web clients' pretty URLs name entities without a bech32 in them —
 * a person by NIP-05 name, an article by name and slug. A note carrying one
 * rendered as a bare "primal.net" chip that left Brainstorm (Benjamin,
 * 2026-09-23); the team (2026-09-24) asked for the other clients too, so a
 * reader stays in Brainstorm. The grammar, on its own: what a URL names, or
 * null. URLs that carry a bech32 never reach here — the tokeniser makes
 * them mentions first.
 */
import { describe, expect, it } from "vitest";
import { clientRef, clientLinkKey } from "./clientLinks";

describe("clientRef — Primal", () => {
  it("two segments name an article: the author's NIP-05 name and the article's d tag", () => {
    expect(clientRef("https://primal.net/whitenoise/were-back")).toEqual({ kind: "article", nip05: "whitenoise@primal.net", identifier: "were-back" });
  });

  it("one segment names a person; trailing slash, query, hash, www and http are tolerated; the bare root is nothing", () => {
    expect(clientRef("https://primal.net/alice")).toEqual({ kind: "profile", nip05: "alice@primal.net" });
    expect(clientRef("http://www.primal.net/alice/?utm=x#top")).toEqual({ kind: "profile", nip05: "alice@primal.net" });
    expect(clientRef("https://primal.net/")).toBeNull();
    expect(clientRef("https://example.com/alice/post")).toBeNull();
  });

  it("Primal's own routes are not people: e, p, a, reads, settings, files", () => {
    expect(clientRef("https://primal.net/e/" + "f".repeat(64))).toBeNull();
    expect(clientRef("https://primal.net/p/" + "f".repeat(64))).toBeNull();
    expect(clientRef("https://primal.net/reads")).toBeNull();
    expect(clientRef("https://primal.net/settings/x")).toBeNull();
    expect(clientRef("https://primal.net/favicon.ico")).toBeNull();
  });

  it("normalises the name, decodes the slug, and sheds the prose around a link", () => {
    expect(clientRef("https://primal.net/Alice/My%20Post")).toEqual({ kind: "article", nip05: "alice@primal.net", identifier: "My Post" });
    expect(clientRef("https://primal.net/alice/my-post.")).toEqual({ kind: "article", nip05: "alice@primal.net", identifier: "my-post" });
    expect(clientRef("(https://primal.net/alice)")).toBeNull(); // the tokeniser never hands over the paren; a stray one is not a name
    expect(clientRef("https://primal.net/al ice/post")).toBeNull();
    expect(clientRef("https://primal.net/alice/post/extra")).toBeNull();
  });

  it("keys a ref canonically, so `…/slug` and `…/slug.` share one lookup", () => {
    expect(clientLinkKey(clientRef("https://primal.net/alice/my-post")!)).toBe(clientLinkKey(clientRef("https://primal.net/alice/my-post.")!));
    expect(clientLinkKey({ kind: "profile", nip05: "alice@primal.net" })).not.toBe(clientLinkKey({ kind: "article", nip05: "alice@primal.net", identifier: "x" }));
  });
});

describe("clientRef — Habla", () => {
  it("/u/<nip05>/<slug> is that person's article, /u/<nip05> the person; a bare domain is its `_` name", () => {
    expect(clientRef("https://habla.news/u/alice@example.com/my-post")).toEqual({ kind: "article", nip05: "alice@example.com", identifier: "my-post" });
    expect(clientRef("https://habla.news/u/alice@example.com")).toEqual({ kind: "profile", nip05: "alice@example.com" });
    expect(clientRef("https://habla.news/u/fiatjaf.com/nostr-is-a-protocol")).toEqual({ kind: "article", nip05: "_@fiatjaf.com", identifier: "nostr-is-a-protocol" });
  });

  it("Habla's other routes are not people: /a/<naddr> is a mention already, /t/<tag>, /search, the root", () => {
    expect(clientRef("https://habla.news/t/bitcoin")).toBeNull();
    expect(clientRef("https://habla.news/search")).toBeNull();
    expect(clientRef("https://habla.news/")).toBeNull();
    expect(clientRef("https://habla.news/u/not a handle")).toBeNull();
  });
});

describe("clientRef — clients that name their own users by local part", () => {
  it("iris.to/<name> and snort.social/<name> are that client's users; a full handle is anyone", () => {
    expect(clientRef("https://iris.to/alice")).toEqual({ kind: "profile", nip05: "alice@iris.to" });
    expect(clientRef("https://snort.social/alice")).toEqual({ kind: "profile", nip05: "alice@snort.social" });
    expect(clientRef("https://snort.social/alice@example.com")).toEqual({ kind: "profile", nip05: "alice@example.com" });
    expect(clientRef("https://iris.to/alice@example.com")).toEqual({ kind: "profile", nip05: "alice@example.com" });
  });

  it("their own routes are not people: snort's /e /p /notifications, iris's /settings /search, files", () => {
    expect(clientRef("https://snort.social/e/note1abc")).toBeNull();
    expect(clientRef("https://snort.social/notifications")).toBeNull();
    expect(clientRef("https://iris.to/settings")).toBeNull();
    expect(clientRef("https://iris.to/manifest.json")).toBeNull();
  });

  it("ditto.pub/@user@domain is a Mastodon-style handle for a NIP-05; ditto.pub/@user is Ditto's own user", () => {
    expect(clientRef("https://ditto.pub/@alice@example.com")).toEqual({ kind: "profile", nip05: "alice@example.com" });
    expect(clientRef("https://ditto.pub/@alice")).toEqual({ kind: "profile", nip05: "alice@ditto.pub" });
    expect(clientRef("https://ditto.pub/about")).toBeNull();
  });
});

describe("clientRef — clients that take a full handle at the root", () => {
  it("njump.me/<nip05> is the person; a bare domain is its `_` name; a route word is nothing", () => {
    expect(clientRef("https://njump.me/alice@example.com")).toEqual({ kind: "profile", nip05: "alice@example.com" });
    expect(clientRef("https://njump.me/fiatjaf.com")).toEqual({ kind: "profile", nip05: "_@fiatjaf.com" });
    expect(clientRef("https://njump.me/about")).toBeNull();
    expect(clientRef("https://njump.me/")).toBeNull();
  });

  it("highlighter.com/<nip05>/<slug> is the article, highlighter.com/<nip05> the person; /a and /reads are not", () => {
    expect(clientRef("https://highlighter.com/alice@example.com/my-post")).toEqual({ kind: "article", nip05: "alice@example.com", identifier: "my-post" });
    expect(clientRef("https://highlighter.com/alice@example.com")).toEqual({ kind: "profile", nip05: "alice@example.com" });
    expect(clientRef("https://highlighter.com/reads")).toBeNull();
    expect(clientRef("https://highlighter.com/a/naddr1abc")).toBeNull();
  });
});
