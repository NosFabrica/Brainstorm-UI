import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { signed } from "@/test/signedEvent";
import type { MinimalEvent } from "@/lib/noteRefs";
import type { Thing } from "@/lib/thing";
import { isInlineThing } from "./EmbeddedInlineThing";
import { repostedEvent } from "./repostedEvent";
import { decodeEventId } from "@/components/share/eventPage/eventPointer";

const ev = (kind: number, tags: string[][] = [], content = ""): MinimalEvent => ({
  id: "f".repeat(64),
  kind,
  pubkey: "4".repeat(64),
  created_at: 1_790_000_000,
  tags,
  content,
});
const thingOf = (type: string) => ({ detail: { type } }) as unknown as Thing;

describe("isInlineThing", () => {
  it("draws a kind-38000 market or ballot in the note card, nothing else", () => {
    expect(isInlineThing(ev(38000), thingOf("market"))).toBe(true);
    expect(isInlineThing(ev(38000), thingOf("ballot"))).toBe(true);
    expect(isInlineThing(ev(38000), thingOf("mint-review"))).toBe(false);
    expect(isInlineThing(ev(38000), null)).toBe(false);
    expect(isInlineThing(ev(34550), thingOf("market"))).toBe(false);
  });
});

describe("repostedEvent", () => {
  const note = signed({ kind: 1, content: "the original" });
  it("is the note a repost carries, signed and named by its `e`", () => {
    expect(repostedEvent(ev(6, [["e", note.id]], JSON.stringify(note)))?.id).toBe(note.id);
  });
  it("is nothing for a repost whose JSON its `e` does not name, or for any other kind", () => {
    expect(repostedEvent(ev(6, [["e", "1".repeat(64)]], JSON.stringify(note)))).toBeNull();
    expect(repostedEvent(ev(1, [["e", note.id]], JSON.stringify(note)))).toBeNull();
  });
});

describe("decodeEventId", () => {
  const id = "a".repeat(64);
  it("reads a note, an nevent with its hints, a nostr: URI and a bare id", () => {
    expect(decodeEventId(nip19.noteEncode(id))).toEqual({ id });
    expect(decodeEventId(`nostr:${nip19.neventEncode({ id, relays: ["wss://r.example"] })}`)).toMatchObject({
      id,
      relays: ["wss://r.example"],
    });
    expect(decodeEventId(id.toUpperCase())).toEqual({ id });
  });
  it("is null for anything else", () => {
    expect(decodeEventId("npub1xyz")).toBeNull();
    expect(decodeEventId("hello")).toBeNull();
  });
});
