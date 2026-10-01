// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shelfOf, shelve, unreadIn, type TrustLookup } from "./inbox";
import type { DmMessage, DmRoom } from "./store";
import type { DmPrefs } from "./prefs";

const ME = "m".repeat(64);
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
});
