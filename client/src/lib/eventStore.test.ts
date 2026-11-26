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
import { getSeenRelays } from "applesauce-core/helpers/relays";
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

/** As a relay hands it over: JSON, so nothing of this tab's "verified" mark comes along. */
const wire = (event: object): NostrEvent => JSON.parse(JSON.stringify(event)) as NostrEvent;

describe("an id the store already holds", () => {
  it("is no pass for a kind 5 that reuses it: the forged deletion is refused and deletes nothing", () => {
    const note = sign(victimKey, { content: "keep me" });
    eventStore.add(note);
    // The held note's id and sig, under a kind 5 that names the note.
    const forged = wire({ ...forgedDeletion([["e", note.id]], 2000), id: note.id, sig: note.sig });
    expect(eventStore.add(forged)).toBeNull();
    expect(eventStore.hasEvent(note.id)).toBe(true);
  });

  it("is no pass for a different body under it, whatever the kind", () => {
    const note = sign(victimKey, { content: "real" });
    eventStore.add(note);
    const reaction = wire({ ...note, kind: 7, content: "+" });
    expect(() => eventStore.add(reaction, "wss://forger.example")).not.toThrow();
    expect(eventStore.add(wire({ ...note, content: "forged" }), "wss://forger.example")).toBeNull();
    // Nothing of the forger's is credited to the held copy.
    expect(getSeenRelays(eventStore.getEvent(note.id)!)?.has("wss://forger.example") ?? false).toBe(false);
  });

  it("still lets the same event in from a second relay without a second check", () => {
    const note = sign(victimKey, { content: "twice" });
    eventStore.add(note, "wss://a.example");
    const again = wire(note);
    expect(eventStore.add(again, "wss://b.example")?.id).toBe(note.id);
    expect(getSeenRelays(eventStore.getEvent(note.id)!)?.has("wss://b.example")).toBe(true);
  });
});
