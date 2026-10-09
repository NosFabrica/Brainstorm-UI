// @vitest-environment jsdom
/**
 * The head start: what index.html's inline script collected before the bundle
 * arrived, handed to the app once and once only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NostrEvent } from "nostr-tools";
import { followHeadStart, takeHeadStart, __resetHeadStart, type PageMessage } from "./headStart";
import { DEFAULT_LIMIT, bandKindsForTab } from "@/services/search";
import { TOP_SECTIONS } from "@/components/search/ComposedResults";

const added: NostrEvent[] = [];
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: (e: NostrEvent) => added.push(e) } }));

const ev = (id: string, kind: number): NostrEvent =>
  ({ id, kind, pubkey: "a".repeat(64), tags: [], content: "", created_at: 1, sig: "s" }) as NostrEvent;

function park(query: string, events: NostrEvent[], complete = true) {
  const socket = { close: vi.fn() };
  (window as unknown as { __headStart?: unknown }).__headStart = { query, events, eose: true, complete, socket };
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
    const { events } = takeHeadStart("bitcoin");
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(added.map((e) => e.id)).toEqual(["a", "b"]);
    expect(socket.close).toHaveBeenCalled();
  });

  it("gives them up only once — a later mount searches for itself", () => {
    park("bitcoin", [ev("a", 1)]);
    expect(takeHeadStart("bitcoin").events).toHaveLength(1);
    expect(takeHeadStart("bitcoin").events).toHaveLength(0);
  });

  it("keeps nothing for a different question", () => {
    const socket = park("bitcoin", [ev("a", 1)]);
    expect(takeHeadStart("nostr").events).toHaveLength(0);
    // …and the socket still goes: nobody is coming for that answer now.
    expect(socket.close).toHaveBeenCalled();
  });

  it("says whether the relay finished — only then can a section ask for what came since", () => {
    park("bitcoin", [ev("a", 1)], true);
    expect(takeHeadStart("bitcoin").complete).toBe(true);
    __resetHeadStart();
    park("bitcoin", [ev("a", 1)], false);
    expect(takeHeadStart("bitcoin").complete).toBe(false);
  });

  it("is quiet when there was no head start at all", () => {
    expect(takeHeadStart("bitcoin")).toEqual({ events: [], complete: false });
  });
});

/** All's head start, as the inline script parks it: still listening, or ended. */
function parkAll(
  query: string,
  events: NostrEvent[],
  state: { eose?: boolean; complete?: boolean; failed?: boolean } = {},
) {
  const socket = { close: vi.fn() };
  const head = {
    query,
    tab: "all",
    events,
    eose: !!state.eose,
    complete: !!state.complete,
    failed: !!state.failed,
    listeners: [] as ((frame: unknown[]) => void)[],
    socket,
  };
  (window as unknown as { __headStart?: unknown }).__headStart = head;
  return { head, socket };
}
const follow = (query: string) => {
  const got: PageMessage[] = [];
  const errors: unknown[] = [];
  const page = followHeadStart(query);
  const sub = page?.({ next: (m) => got.push(m), error: (e) => errors.push(e) });
  return { page, sub, got, errors };
};

// All's first page takes the relay seconds — longer than the bundle — so the app follows
// the head start's request rather than closing it and asking the same question again.
describe("followHeadStart", () => {
  it("hands over what came, then what comes, then the end — and lets the socket go", () => {
    const { head, socket } = parkAll("bitcoin", [ev("a", 1)]);
    const { got } = follow("bitcoin");
    expect(got.map((m) => m.event?.id ?? m.type)).toEqual(["a"]);
    head.listeners.forEach((l) => l(["EVENT", "head", ev("b", 1)]));
    expect(socket.close).not.toHaveBeenCalled();
    head.listeners.forEach((l) => l(["EOSE", "head"]));
    expect(got.map((m) => m.event?.id ?? m.type)).toEqual(["a", "b", "EOSE"]);
    expect(socket.close).toHaveBeenCalled();
    expect(head.listeners).toHaveLength(0);
  });

  it("replays a finished answer at once", () => {
    parkAll("bitcoin", [ev("a", 1)], { eose: true, complete: true });
    expect(follow("bitcoin").got.map((m) => m.event?.id ?? m.type)).toEqual(["a", "EOSE"]);
  });

  it("errors when the head start ends without an answer — the caller asks the relay", () => {
    const { head } = parkAll("bitcoin", []);
    const { errors } = follow("bitcoin");
    head.listeners.forEach((l) => l(["CLOSED", "head", "rate-limited"]));
    expect(errors).toHaveLength(1);
  });

  it("is nothing for a failed one, a different question, or Top's", () => {
    const failed = parkAll("bitcoin", [], { eose: true, failed: true });
    expect(followHeadStart("bitcoin")).toBeNull();
    expect(failed.socket.close).toHaveBeenCalled();
    __resetHeadStart();
    parkAll("bitcoin", []);
    expect(followHeadStart("nostr")).toBeNull();
    __resetHeadStart();
    park("bitcoin", [ev("a", 1)]);
    expect(followHeadStart("bitcoin")).toBeNull();
  });

  // A search cancelled before its first page opened never subscribes: nobody would close it.
  it("lets an unfollowed head start go when released, and a followed one only by its own end", () => {
    const first = parkAll("bitcoin", []);
    followHeadStart("bitcoin")!.release();
    expect(first.socket.close).toHaveBeenCalledTimes(1);
    __resetHeadStart();
    const second = parkAll("bitcoin", []);
    const page = followHeadStart("bitcoin")!;
    page({ next: () => {}, error: () => {} });
    page.release();
    expect(second.socket.close).not.toHaveBeenCalled();
  });

  it("stops listening when the page is left, and closes the socket", () => {
    const { head, socket } = parkAll("bitcoin", []);
    const { sub } = follow("bitcoin");
    sub!.unsubscribe();
    expect(head.listeners).toHaveLength(0);
    expect(socket.close).toHaveBeenCalled();
  });
});

describe("the inline script in index.html", () => {
  const html = readFileSync(join(__dirname, "../../index.html"), "utf8");
  const asked = [...html.matchAll(/\{ kinds: \[([\d, ]+)\], search: (q|fresh) \+ perspective, limit: (\d+) \}/g)].map(
    (m) => ({
      kinds: m[1].split(",").map((n) => Number(n.trim())),
      recent: m[2] === "fresh",
      limit: Number(m[3]),
    }),
  );

  it("asks each section exactly what the composed page asks it", () => {
    const tabs = ["people", "notes", "articles", "events", "live", "media", "music", "shop"] as const;
    expect(asked).toEqual(
      tabs.map((tab) => ({
        kinds: [...(bandKindsForTab(tab) ?? [])],
        recent: TOP_SECTIONS[tab].recent,
        limit: TOP_SECTIONS[tab].limit,
      })),
    );
  });

  it("leaves a socket the app is following to the app, past its 30s cleanup", () => {
    expect(html).toMatch(/setTimeout\(function \(\) \{\s*if \(head\.listeners\.length\) return;/);
  });

  it("asks All's one search exactly as the tab asks it: no kinds, best match, a page deep", () => {
    expect(html).toContain(`["REQ", "head", { search: q + perspective, limit: ${DEFAULT_LIMIT} }]`);
  });

  it("leaves All's head start out on a slow link, judged as lib/connection judges one", () => {
    // A hundred results of any kind compete with the bundle on a thin link (Fast 3G: ~4s later).
    expect(html).toMatch(/net\.saveData === true \|\| \/\(\^\|-\)2g\$\|\^3g\$\/\.test\(net\.effectiveType/);
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
