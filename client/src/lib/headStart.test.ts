// @vitest-environment jsdom
/**
 * The head start: what index.html's inline script collected before the bundle
 * arrived, handed to the app once and once only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NostrEvent } from "nostr-tools";
import { takeHeadStart, __resetHeadStart } from "./headStart";
import { TAB_KINDS } from "@/services/search";
import { EVERYTHING_SECTIONS } from "@/components/search/ComposedResults";

const added: NostrEvent[] = [];
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: (e: NostrEvent) => added.push(e) } }));

const ev = (id: string, kind: number): NostrEvent =>
  ({ id, kind, pubkey: "a".repeat(64), tags: [], content: "", created_at: 1, sig: "s" }) as NostrEvent;

function park(query: string, events: NostrEvent[]) {
  const socket = { close: vi.fn() };
  (window as unknown as { __headStart?: unknown }).__headStart = { query, events, eose: true, socket };
  return socket;
}

beforeEach(() => {
  added.length = 0;
  __resetHeadStart();
});
afterEach(() => {
  delete (window as unknown as { __headStart?: unknown }).__headStart;
});

describe("takeHeadStart", () => {
  it("hands over what it collected, puts it in the store, and lets the socket go", () => {
    const socket = park("bitcoin", [ev("a", 1), ev("b", 0)]);
    const events = takeHeadStart("bitcoin");
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(added.map((e) => e.id)).toEqual(["a", "b"]);
    expect(socket.close).toHaveBeenCalled();
  });

  it("gives them up only once — a later mount searches for itself", () => {
    park("bitcoin", [ev("a", 1)]);
    expect(takeHeadStart("bitcoin")).toHaveLength(1);
    expect(takeHeadStart("bitcoin")).toHaveLength(0);
  });

  it("keeps nothing for a different question", () => {
    const socket = park("bitcoin", [ev("a", 1)]);
    expect(takeHeadStart("nostr")).toHaveLength(0);
    // …and the socket still goes: nobody is coming for that answer now.
    expect(socket.close).toHaveBeenCalled();
  });

  it("is quiet when there was no head start at all", () => {
    expect(takeHeadStart("bitcoin")).toEqual([]);
  });
});

describe("the inline script in index.html", () => {
  const html = readFileSync(join(__dirname, "../../index.html"), "utf8");
  const asked = [...html.matchAll(/\{ kinds: \[([\d, ]+)\], search: (q|fresh) \+ perspective, limit: (\d+) \}/g)].map((m) => ({
    kinds: m[1].split(",").map((n) => Number(n.trim())),
    recent: m[2] === "fresh",
    limit: Number(m[3]),
  }));

  it("asks each section exactly what the composed page asks it", () => {
    const tabs = ["people", "notes", "articles", "events", "live", "media", "music", "shop"] as const;
    expect(asked).toEqual(
      tabs.map((tab) => ({
        kinds: [...TAB_KINDS[tab]],
        recent: EVERYTHING_SECTIONS[tab].recent,
        limit: EVERYTHING_SECTIONS[tab].limit,
      })),
    );
  });

  it("keeps the house observer where services/trustSource looks for it", () => {
    // The key is spelled in two places — here and in trustSource — because an
    // inline script cannot import. If they drift, each pays its own round trip.
    expect(html).toContain('"brainstorm_house_observer"');
  });

  it("stays out of the way of a reader who is signed in", () => {
    // Their Perspective is their own; the house's answer is not theirs, so the
    // app would discard it (ComposedResults) — better not to ask at all.
    expect(html).toMatch(/localStorage\.getItem\("brainstorm_active_account"\)/);
  });

  it("stays out of the way of a query carrying search grammar", () => {
    // A #tag or from: query changes what some sections ask for; the head start
    // asks the plain-words question only.
    expect(html).toMatch(/\/\[:#\]\/\.test\(q\)/);
  });
});
