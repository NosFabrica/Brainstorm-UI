import { describe, expect, it } from "vitest";
import { readEmbeddedEvent } from "./embeddedEvent";
import { signed, TEST_PUBKEY } from "@/test/signedEvent";

const note = signed({ kind: 1, content: "reposted words" });

describe("an event carried inside another, as JSON", () => {
  it("is the event when it is whole and signed", () => {
    const read = readEmbeddedEvent(JSON.stringify(note));
    expect(read?.id).toBe(note.id);
    expect(read?.pubkey).toBe(TEST_PUBKEY);
    expect(read?.content).toBe("reposted words");
  });

  it("is nothing when it only claims to be one", () => {
    expect(readEmbeddedEvent('{"id":"x","pubkey":"y"}')).toBeNull();
    // The right shape and an author's key, but no signature of theirs: a forgery.
    expect(readEmbeddedEvent(JSON.stringify({ ...note, sig: "s" }))).toBeNull();
    expect(readEmbeddedEvent(JSON.stringify({ ...note, content: "words they never wrote" }))).toBeNull();
    expect(readEmbeddedEvent(JSON.stringify({ ...note, tags: "nope" }))).toBeNull();
    expect(readEmbeddedEvent("not json")).toBeNull();
    expect(readEmbeddedEvent("")).toBeNull();
    expect(readEmbeddedEvent(null)).toBeNull();
  });

  it("is nothing when the carrier names another event", () => {
    expect(readEmbeddedEvent(JSON.stringify(note), { expectId: note.id })?.id).toBe(note.id);
    expect(readEmbeddedEvent(JSON.stringify(note), { expectId: note.id.toUpperCase() })?.id).toBe(note.id);
    expect(readEmbeddedEvent(JSON.stringify(note), { expectId: "f".repeat(64) })).toBeNull();
    const set = signed({ kind: 30003, tags: [["d", "Mine"]] });
    expect(readEmbeddedEvent(JSON.stringify(set), { expectAddr: `30003:${TEST_PUBKEY}:Mine` })?.id).toBe(set.id);
    expect(readEmbeddedEvent(JSON.stringify(set), { expectAddr: `30003:${TEST_PUBKEY}:mine` })).toBeNull();
  });

  it("keeps only what was signed", () => {
    const read = readEmbeddedEvent(JSON.stringify({ ...note, extra: "unsigned" }));
    expect(read).not.toBeNull();
    expect((read as unknown as Record<string, unknown>).extra).toBeUndefined();
  });
});
