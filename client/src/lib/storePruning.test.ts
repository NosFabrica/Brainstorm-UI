// @vitest-environment node
/**
 * The store is pruned in long sessions (lib/storePruning) — but never of what
 * a screen shows, what routing and names read, or the reader's own events.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import type { Subscription } from "rxjs";
import { eventStore } from "./eventStore";
import { pruneStore } from "./storePruning";
import { __resetAsks, askOnce, isDue } from "./askOnce";

const ME = "e".repeat(64);
let n = 0;
const event = (kind: number, pubkey = "a".repeat(64), tags: string[][] = []): NostrEvent =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind,
    pubkey,
    created_at: 1_700_000_000 + n,
    tags,
    content: "",
    sig: "s",
  }) as NostrEvent;

const subs: Subscription[] = [];
beforeAll(() => {
  // Fake signatures: what is kept is the question here, not who signed it.
  eventStore.verifyEvent = undefined;
});
afterEach(() => {
  subs.splice(0).forEach((s) => s.unsubscribe());
  for (const e of eventStore.getByFilters({})) eventStore.remove(e);
  __resetAsks();
});

describe("pruneStore", () => {
  it("drops unclaimed events, least recently used first, down to the target", () => {
    const notes = Array.from({ length: 10 }, () => eventStore.add(event(1))!);
    expect(pruneStore(new Set(), 6)).toBe(4);
    expect(eventStore.getEvent(notes[0].id)).toBeUndefined();
    expect(eventStore.getEvent(notes[9].id)).toBeDefined();
  });

  it("keeps what a live subscription received and still holds", () => {
    subs.push(eventStore.timeline([{ authors: ["b".repeat(64)] }]).subscribe());
    const arrived = eventStore.add(event(1, "b".repeat(64)))!;
    for (let i = 0; i < 5; i++) eventStore.add(event(1));
    pruneStore(new Set(), 0);
    expect(eventStore.getEvent(arrived.id)).toBeDefined();
  });

  it("never takes a row off a mounted list", () => {
    const shown = eventStore.add(event(1, "c".repeat(64)))!;
    let rows: NostrEvent[] = [];
    subs.push(eventStore.timeline([{ authors: ["c".repeat(64)] }]).subscribe((t) => (rows = t)));
    expect(rows.map((e) => e.id)).toEqual([shown.id]);
    pruneStore(new Set(), 0);
    expect(rows.map((e) => e.id)).toEqual([shown.id]);
  });

  it("keeps profiles, follow lists and routing lists, and the reader's own events", () => {
    const kept = [event(0), event(3), event(10002), event(10040), event(10050), event(30078, ME, [["d", "x"]])].map(
      (e) => eventStore.add(e)!,
    );
    const note = eventStore.add(event(1))!;
    pruneStore(new Set([ME]), 0);
    for (const e of kept) expect(eventStore.getEvent(e.id)).toBeDefined();
    expect(eventStore.getEvent(note.id)).toBeUndefined();
  });

  it("does nothing under the target", () => {
    eventStore.add(event(1));
    expect(pruneStore(new Set(), 100)).toBe(0);
  });

  it("lets the next mount ask again for what it dropped", async () => {
    await askOnce("notes:someone", { minMs: 60_000 }, async () => []);
    eventStore.add(event(1));
    pruneStore(new Set(), 0);
    expect(isDue("notes:someone")).toBe(true);
  });
});
