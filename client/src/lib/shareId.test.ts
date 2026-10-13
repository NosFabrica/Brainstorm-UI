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
import { ADDRESS_LINK_KINDS, READER_KINDS, eventPath, nprofileFor } from "./shareId";

const PK = "a".repeat(64);
const ID = "e".repeat(64);

describe("eventPath", () => {
  it("a spec (kind 30817) opens on the article reader, by address", () => {
    const path = eventPath({
      id: ID,
      pubkey: PK,
      kind: 30817,
      tags: [
        ["d", "scheduler-dvm"],
        ["title", "Scheduler DVM"],
      ],
    });
    expect(path).toMatch(/^\/e\/naddr1/);
  });

  it("a wiki page opens on the article reader, addressed by kind, author and name", () => {
    const path = eventPath({
      id: ID,
      pubkey: PK,
      kind: 30818,
      tags: [
        ["d", "list-of-comedians"],
        ["title", "List of comedians"],
      ],
    });
    expect(path.startsWith("/e/naddr1")).toBe(true);
    const decoded = nip19.decode(path.slice(3));
    expect(decoded.type).toBe("naddr");
    expect(decoded.data).toMatchObject({ kind: 30818, pubkey: PK, identifier: "list-of-comedians" });
  });

  it("a long-form article goes there too; a note and an id-only event stay on /e", () => {
    expect(eventPath({ id: ID, pubkey: PK, kind: 30023, tags: [["d", "why-bitcoin"]] }).startsWith("/e/naddr1")).toBe(
      true,
    );
    expect(eventPath({ id: ID, pubkey: PK, kind: 1, tags: [] }).startsWith("/e/nevent1")).toBe(true);
    expect(eventPath({ id: ID, pubkey: PK }).startsWith("/e/nevent1")).toBe(true);
  });

  // A creator who republishes an addressable video gives it a new id. A link by address still
  // finds it; a link by id is left pointing at the version that was replaced.
  describe("an addressable video", () => {
    const short = { id: ID, pubkey: PK, kind: 34236, tags: [["d", "b0f9"]] };

    it("is linked by its address, on /e", () => {
      const path = eventPath(short);
      expect(path.startsWith("/e/naddr1")).toBe(true);
      expect(nip19.decode(path.slice(3)).data).toMatchObject({ kind: 34236, pubkey: PK, identifier: "b0f9" });
      expect(eventPath({ ...short, kind: 34235 }).startsWith("/e/naddr1")).toBe(true);
    });

    it("carries the relay hint when one is known", () => {
      const decoded = nip19.decode(eventPath(short, ["wss://relay.divine.video"]).slice(3));
      expect(decoded.data).toMatchObject({ identifier: "b0f9", relays: ["wss://relay.divine.video"] });
    });

    it("is not a reader kind: the address opens the video page, not the article reader", () => {
      expect(ADDRESS_LINK_KINDS.has(34235) && ADDRESS_LINK_KINDS.has(34236)).toBe(true);
      expect([...ADDRESS_LINK_KINDS].some((k) => READER_KINDS.has(k))).toBe(false);
      expect([...READER_KINDS].sort()).toEqual([30023, 30817, 30818]);
    });

    it("without a d tag, or as a plain video (21, 22), it stays a link by id", () => {
      expect(eventPath({ ...short, tags: [] }).startsWith("/e/nevent1")).toBe(true);
      expect(eventPath({ ...short, kind: 22 }).startsWith("/e/nevent1")).toBe(true);
      expect(eventPath({ ...short, kind: 21 }).startsWith("/e/nevent1")).toBe(true);
    });

    it("a note keeps its link by id, with its relay hint and author", () => {
      const decoded = nip19.decode(eventPath({ id: ID, pubkey: PK, kind: 1, tags: [] }, ["wss://a.example"]).slice(3));
      expect(decoded.type).toBe("nevent");
      expect(decoded.data).toMatchObject({ id: ID, author: PK, relays: ["wss://a.example"] });
    });
  });
});

// Power users copy an nprofile from the ⋯ menu (team, 2026-09-08). One that
// carries the person's relays tells the next client where their events live.
describe("nprofileFor", () => {
  it("carries up to four of the person's relays, the pubkey intact", () => {
    const relays = [
      "wss://a.example",
      "wss://b.example",
      "wss://c.example",
      "wss://d.example",
      "wss://e.example",
      "wss://f.example",
    ];
    const decoded = nip19.decode(nprofileFor(PK, relays));
    expect(decoded.type).toBe("nprofile");
    expect(decoded.data).toMatchObject({ pubkey: PK, relays: relays.slice(0, 4) });
  });
  it("with no relays it is still an nprofile", () => {
    const decoded = nip19.decode(nprofileFor(PK));
    expect(decoded.type).toBe("nprofile");
    expect((decoded.data as { relays?: string[] }).relays ?? []).toEqual([]);
  });
  it("a bad pubkey encodes to nothing", () => {
    expect(nprofileFor("not-a-key")).toBe("");
  });
});
