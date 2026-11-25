/**
 * What the app's one store lets in.
 *
 * applesauce-core 6.2.0's `EventStore.add` hands a kind 5 to its delete
 * manager before anything checks the signature, so a forged deletion — any
 * pubkey, any created_at — removed a victim's events and, dated far in the
 * future, kept every newer genuine version of them out. And for an event
 * already deleted it returns the event, not null, so every fetcher that
 * trusts `add`'s answer passed deleted events on as if the store had kept them.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools";
import { eventStore } from "./eventStore";

const victimKey = generateSecretKey();
const victim = getPublicKey(victimKey);
const attackerKey = generateSecretKey();

const sign = (key: Uint8Array, template: Partial<NostrEvent>) =>
  finalizeEvent({ kind: 1, content: "", tags: [], created_at: 1000, ...template }, key);

/** A kind 5 claiming to be the victim's, signed by someone else. */
function forgedDeletion(tags: string[][], created_at = 4_000_000_000): NostrEvent {
  const real = sign(attackerKey, { kind: 5, tags, created_at });
  return { ...real, pubkey: victim };
}

beforeEach(() => {
  for (const e of eventStore.getByFilters([{}])) eventStore.remove(e);
});

describe("the app's event store", () => {
  it("ignores a kind 5 whose signature isn't its pubkey's: the note it names stays", () => {
    const note = sign(victimKey, { content: "hello" });
    eventStore.add(note);
    expect(eventStore.add(forgedDeletion([["e", note.id]]))).toBeNull();
    expect(eventStore.hasEvent(note.id)).toBe(true);
  });

  it("ignores a forged far-future address deletion: newer genuine versions still get in", () => {
    const list = sign(victimKey, { kind: 10000, created_at: 2000 });
    eventStore.add(list);
    eventStore.add(forgedDeletion([["a", `10000:${victim}:`]]));
    expect(eventStore.getReplaceable(10000, victim)?.id).toBe(list.id);
    const newer = sign(victimKey, { kind: 10000, created_at: 3000 });
    expect(eventStore.add(newer)?.id).toBe(newer.id);
    expect(eventStore.getReplaceable(10000, victim)?.id).toBe(newer.id);
  });

  it("honours a genuine deletion, and answers null for the deleted event rather than the event", () => {
    const note = sign(victimKey, { content: "regret" });
    eventStore.add(note);
    const deletion = sign(victimKey, { kind: 5, tags: [["e", note.id]], created_at: 2000 });
    expect(eventStore.add(deletion)).not.toBeNull();
    expect(eventStore.hasEvent(note.id)).toBe(false);
    // A relay sending it again: refused, and said so.
    expect(eventStore.add({ ...note })).toBeNull();
    expect(eventStore.hasEvent(note.id)).toBe(false);
  });

  it("still refuses a bad signature on any other kind", () => {
    const note = sign(victimKey, { content: "real" });
    expect(eventStore.add({ ...note, content: "forged" })).toBeNull();
  });
});
