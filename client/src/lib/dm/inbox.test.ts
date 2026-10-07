// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shelfOf, shelve, unreadIn, type TrustLookup } from "./inbox";
import type { DmMessage, DmRoom } from "./store";
import type { DmPrefs } from "./prefs";

const ME = "f".repeat(64);
const ANA = "a".repeat(64);
const BOB = "b".repeat(64);
const EVE = "e".repeat(64);

const prefs = (over: Partial<DmPrefs> = {}): DmPrefs => ({
  read: {},
  accepted: [],
  hidden: {},
  timers: {},
  reach: "follows",
  defaultTimer: 0,
  pinned: [],
  muted: [],
  notify: { desktop: false, sound: true, preview: true },
  linkPreviews: true,
  ...over,
});

function room(other: string, opts: { mine?: boolean; at?: number; count?: number } = {}): DmRoom {
  const key = [ME, other].sort().join(",");
  const messages = Array.from({ length: opts.count ?? 1 }, (_, i) => ({
    id: `${other}${i}`,
    author: other,
    createdAt: (opts.at ?? 100) + i,
  })) as DmMessage[];
  return {
    key,
    participants: key.split(","),
    messages,
    reactions: new Map(),
    lastAt: opts.at ?? 100,
    hasMine: !!opts.mine,
  };
}

const trust = (over: Partial<TrustLookup> = {}): TrustLookup => ({
  follows: new Set([ANA]),
  scoreOf: (pk) => ({ [BOB]: 0.6, [EVE]: 0.05 })[pk] ?? null,
  flaggedOf: () => false,
  ...over,
});

describe("shelving rooms", () => {
  it("puts follows and rooms you've written in Chats", () => {
    expect(shelfOf(room(ANA), ME, prefs(), trust())).toBe("chat");
    expect(shelfOf(room(EVE, { mine: true }), ME, prefs(), trust())).toBe("chat");
  });

  it("makes strangers requests, low-trust ones low, flagged ones flagged", () => {
    expect(shelfOf(room(BOB), ME, prefs(), trust())).toBe("request");
    expect(shelfOf(room(EVE), ME, prefs(), trust())).toBe("low");
    expect(shelfOf(room(BOB), ME, prefs(), trust({ flaggedOf: (pk) => pk === BOB }))).toBe("flagged");
  });

  it("doesn't call anyone low-trust before their score has loaded", () => {
    expect(shelfOf(room(EVE), ME, prefs(), trust({ scoreOf: () => undefined }))).toBe("request");
  });

  it("honours accepting, the reach setting, and trusted senders", () => {
    expect(shelfOf(room(BOB), ME, prefs({ accepted: [room(BOB).key] }), trust())).toBe("chat");
    expect(shelfOf(room(BOB), ME, prefs({ reach: "trusted" }), trust())).toBe("chat");
    expect(shelfOf(room(EVE), ME, prefs({ reach: "everyone" }), trust())).toBe("chat");
  });

  it("counts unread past the read mark and floor, and badges chats plus new requests", () => {
    const ana = room(ANA, { at: 100, count: 3 });
    expect(unreadIn(ana, ME, prefs())).toBe(3);
    expect(unreadIn(ana, ME, prefs({ read: { [ana.key]: 101 } }))).toBe(1);
    expect(unreadIn(ana, ME, prefs({ readFloor: 200 }))).toBe(0);
    const out = shelve([ana, room(BOB), room(EVE)], ME, prefs(), trust());
    expect(out.badge).toBe(3 + 1);
    expect([out.chats.length, out.requests.length, out.low.length]).toEqual([1, 1, 1]);
  });

  it("hides deleted rooms until something newer arrives, and muted senders always", () => {
    const bob = room(BOB, { at: 100 });
    expect(shelve([bob], ME, prefs({ hidden: { [bob.key]: 100 } }), trust()).requests).toHaveLength(0);
    expect(shelve([room(BOB, { at: 150 })], ME, prefs({ hidden: { [bob.key]: 100 } }), trust()).requests).toHaveLength(
      1,
    );
    expect(shelve([room(ANA)], ME, prefs(), trust({ mutedOf: (pk) => pk === ANA })).chats).toHaveLength(0);
  });

  it("archives chats (a deleted request is just gone), pins to the top, and keeps muted chats off the badge", () => {
    const ana = room(ANA, { at: 100, count: 2 });
    const old = room(BOB, { at: 50, mine: true });
    const archived = shelve([ana, old], ME, prefs({ hidden: { [ana.key]: 101 } }), trust());
    expect(archived.archived.map((r) => r.key)).toEqual([ana.key]);
    expect(archived.chats.map((r) => r.key)).toEqual([old.key]);

    const pinned = shelve([ana, old], ME, prefs({ pinned: [old.key] }), trust());
    expect(pinned.chats.map((r) => r.key)).toEqual([old.key, ana.key]);
    expect(pinned.pinnedCount).toBe(1);

    expect(shelve([ana], ME, prefs({ muted: [ana.key] }), trust()).badge).toBe(0);
  });

  it("keeps a pinned chat in the list, in pin order, when none of its messages are loaded", () => {
    const ana = room(ANA, { at: 100 });
    const bobKey = [ME, BOB].sort().join(",");
    const group = [ME, ANA, BOB].sort().join(",");
    const shelves = shelve([ana], ME, prefs({ pinned: [group, ana.key, bobKey] }), trust());
    expect(shelves.chats.map((r) => r.key)).toEqual([group, ana.key, bobKey]);
    expect(shelves.pinnedCount).toBe(3);
    const bob = shelves.chats[2];
    expect(bob.notLoaded).toBe(true);
    expect(bob.participants).toEqual([ME, BOB].sort());
    expect(bob.messages).toEqual([]);
    expect(shelves.chats[1].notLoaded).toBeUndefined();
    // Nothing to read, so nothing on the badge.
    expect(shelves.badge).toBe(1);
  });

  it("leaves a not-loaded pin out when its people are muted, and archives it when deleted", () => {
    const bobKey = [ME, BOB].sort().join(",");
    expect(shelve([], ME, prefs({ pinned: [bobKey] }), trust({ mutedOf: (pk) => pk === BOB })).chats).toEqual([]);
    const hidden = shelve([], ME, prefs({ pinned: [bobKey], hidden: { [bobKey]: 10 } }), trust());
    expect(hidden.chats).toEqual([]);
    expect(hidden.archived.map((r) => r.key)).toEqual([bobKey]);
  });

  it("ignores a pin that isn't one of the reader's rooms", () => {
    const strangers = [ANA, BOB].sort().join(",");
    expect(shelve([], ME, prefs({ pinned: [strangers] }), trust()).chats).toEqual([]);
  });

  it("skips a malformed synced pin instead of listing a room whose link can't be made", () => {
    const bobKey = [ME, BOB].sort().join(",");
    const unsorted = [BOB, ME].join(",") === bobKey ? [ME, BOB].join(",") : [BOB, ME].join(",");
    const junk = ["", "zz", `${ME},zz`, `${ME},${BOB.toUpperCase()}`, unsorted, `${bobKey},`];
    const shelves = shelve([], ME, prefs({ pinned: [...junk, bobKey] }), trust());
    expect(shelves.chats.map((r) => r.key)).toEqual([bobKey]);
  });

  it("lists a pin repeated in a synced list once, at its first place", () => {
    const bobKey = [ME, BOB].sort().join(",");
    const anaKey = [ME, ANA].sort().join(",");
    const shelves = shelve([], ME, prefs({ pinned: [bobKey, anaKey, bobKey] }), trust());
    expect(shelves.chats.map((r) => r.key)).toEqual([bobKey, anaKey]);
    expect(shelves.pinnedCount).toBe(2);
  });

  it("keeps a not-loaded pin the same object from one shelving to the next", () => {
    const bobKey = [ME, BOB].sort().join(",");
    const a = shelve([room(ANA)], ME, prefs({ pinned: [bobKey] }), trust()).chats[0];
    const b = shelve([room(ANA, { at: 200 })], ME, prefs({ pinned: [bobKey] }), trust()).chats[0];
    expect(a.notLoaded).toBe(true);
    expect(b).toBe(a);
  });

  it("judges a room by who wrote in it, not by who was named", () => {
    // A stranger's group that also names Ana (whom I follow): still a request.
    const key = [ME, ANA, EVE].sort().join(",");
    const r = {
      key,
      participants: key.split(","),
      messages: [{ id: "x", author: EVE, createdAt: 100 }] as DmMessage[],
      reactions: new Map(),
      lastAt: 100,
      hasMine: false,
    } as DmRoom;
    expect(shelfOf(r, ME, prefs(), trust())).toBe("low");
    // Once Ana writes there, it is a chat.
    r.messages.push({ id: "y", author: ANA, createdAt: 101 } as DmMessage);
    expect(shelfOf(r, ME, prefs(), trust())).toBe("chat");
  });
});
