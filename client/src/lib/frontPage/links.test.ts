import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { toNevent, toNpub } from "./desks";
import { BRAINSTORM_LINKS, LEGACY_JUMBLE_LINKS, PAPER_LINK_ORIGIN, linksLine, paperLinkSet } from "./links";

// Amethyst's PaperLinksTest, with Brainstorm's set.

const ALICE = "a1".repeat(32);
const ID = "7".repeat(64);
const naddr = nip19.naddrEncode({ kind: 30311, pubkey: ALICE, identifier: "show" });

describe("the paper's link set", () => {
  it("is Brainstorm's own event and profile pages, on the production origin", () => {
    expect(PAPER_LINK_ORIGIN).toBe("https://brainstorm.world");
    expect(BRAINSTORM_LINKS.citeBase).toBe("https://brainstorm.world/e/");
    expect(BRAINSTORM_LINKS.profileBase).toBe("https://brainstorm.world/p/");
    expect(linksLine(BRAINSTORM_LINKS)).toBe(
      "Links: citations https://brainstorm.world/e/<id>, people https://brainstorm.world/p/<id>",
    );
  });

  it("its encoded forms become nostr: URIs", () => {
    const nevent = toNevent(ID);
    expect(BRAINSTORM_LINKS.toNostrUri(`https://brainstorm.world/e/${nevent}`)).toBe(`nostr:${nevent}`);
    expect(BRAINSTORM_LINKS.toNostrUri(`https://brainstorm.world/e/${naddr}`)).toBe(`nostr:${naddr}`);
    expect(BRAINSTORM_LINKS.toNostrUri(`https://brainstorm.world/p/${toNpub(ALICE)}`)).toBe(`nostr:${toNpub(ALICE)}`);
    // Another app's set routes its own forms, and only those.
    const amethyst = paperLinkSet("https://jumble.social/notes/", "https://jumble.social/users/");
    expect(amethyst.toNostrUri(`https://jumble.social/notes/${naddr}`)).toBe(`nostr:${naddr}`);
    expect(BRAINSTORM_LINKS.toNostrUri(`https://jumble.social/notes/${nevent}`)).toBeNull();
  });

  it("everything else stays a web link", () => {
    expect(BRAINSTORM_LINKS.toNostrUri("https://evil.example/drain")).toBeNull();
    // The writer's hex forms are resolve's to encode; a page never ships with them.
    expect(BRAINSTORM_LINKS.toNostrUri(`https://brainstorm.world/e/${ID}`)).toBeNull();
    // Matched is not decoded: a broken bech32, or the wrong entity on a base, is not routed.
    expect(BRAINSTORM_LINKS.toNostrUri("https://brainstorm.world/e/nevent1qqqqqqq")).toBeNull();
    expect(BRAINSTORM_LINKS.toNostrUri(`https://brainstorm.world/p/${naddr}`)).toBeNull();
    expect(BRAINSTORM_LINKS.toNostrUri(`https://brainstorm.world/e/${toNpub(ALICE)}`)).toBeNull();
    // The per-desk hosts are gone: every kind goes to the app's own viewer.
    expect(BRAINSTORM_LINKS.toNostrUri(`https://zap.stream/${naddr}`)).toBeNull();
    expect(BRAINSTORM_LINKS.toNostrUri(`https://njump.me/${naddr}`)).toBeNull();
  });

  it("reads the writer's forms and the encoded ones, decoded", () => {
    expect(BRAINSTORM_LINKS.writerCited(`https://brainstorm.world/e/${ID.toUpperCase()}`)).toBe(ID);
    expect(BRAINSTORM_LINKS.cited(`https://brainstorm.world/e/${naddr}`)).toEqual({
      type: "naddr",
      kind: 30311,
      pubkey: ALICE,
      identifier: "show",
    });
    expect(BRAINSTORM_LINKS.writerProfile(`https://brainstorm.world/p/${ID}?x=1`)).toBe(ID);
    expect(BRAINSTORM_LINKS.profiled(`https://brainstorm.world/p/${toNpub(ALICE)}`)).toBe(ALICE);
    expect(LEGACY_JUMBLE_LINKS.writerCited(`https://jumble.social/notes/${ID}`)).toBe(ID);
    expect(BRAINSTORM_LINKS.writerCited(`https://brainstorm.world.evil.example/e/${ID}`)).toBeNull();
  });
});
