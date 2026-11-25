// @vitest-environment node
/**
 * The app's one EventStore is a module singleton, so whatever a test adds to it
 * (directly, or through a fetcher or a publish) used to be there for every
 * later test in the file, and a test could pass only because an earlier one
 * had seeded it. test/setup.ts empties it before each test, deletions included.
 * The tests below run in order: each later one checks what the one before left.
 */
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";

const key = generateSecretKey();
const note = finalizeEvent({ kind: 1, created_at: 1_700_000_000, tags: [], content: "left behind" }, key);
const deletion = finalizeEvent({ kind: 5, created_at: 1_700_000_100, tags: [["e", note.id]], content: "" }, key);

describe("the EventStore between tests", () => {
  it("takes what a test adds", () => {
    eventStore.add(note);
    expect(eventStore.getEvent(note.id)).toBeDefined();
  });

  it("is empty when the next test starts", () => {
    expect(eventStore.getByFilters({})).toEqual([]);
  });

  it("deletes what a test deletes", () => {
    eventStore.add(deletion);
    eventStore.add(note);
    expect(eventStore.getEvent(note.id)).toBeUndefined();
  });

  it("forgets the deletion when the next test starts", () => {
    eventStore.add(note);
    expect(eventStore.getEvent(note.id)).toBeDefined();
  });
});
