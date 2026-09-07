// @vitest-environment node
/**
 * A wiki page (kind 30818) or a long-form article (30023) is addressable —
 * kind, author and its "d" name — and belongs on the article reader at /a.
 * Opened as a bare event at /e it rendered as a note, markup and all
 * (GitCitadel's "List of comedians", 2026-09-07). Anything else, or an
 * event we only know by id, stays a plain /e link.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { eventPath } from "./shareId";

const PK = "a".repeat(64);
const ID = "e".repeat(64);

describe("eventPath", () => {
  it("a wiki page opens on the article reader, addressed by kind, author and name", () => {
    const path = eventPath({ id: ID, pubkey: PK, kind: 30818, tags: [["d", "list-of-comedians"], ["title", "List of comedians"]] });
    expect(path.startsWith("/a/naddr1")).toBe(true);
    const decoded = nip19.decode(path.slice(3));
    expect(decoded.type).toBe("naddr");
    expect(decoded.data).toMatchObject({ kind: 30818, pubkey: PK, identifier: "list-of-comedians" });
  });

  it("a long-form article goes there too; a note and an id-only event stay on /e", () => {
    expect(eventPath({ id: ID, pubkey: PK, kind: 30023, tags: [["d", "why-bitcoin"]] }).startsWith("/a/naddr1")).toBe(true);
    expect(eventPath({ id: ID, pubkey: PK, kind: 1, tags: [] }).startsWith("/e/nevent1")).toBe(true);
    expect(eventPath({ id: ID, pubkey: PK }).startsWith("/e/nevent1")).toBe(true);
  });
});
