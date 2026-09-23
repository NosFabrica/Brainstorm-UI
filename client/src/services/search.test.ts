// @vitest-environment jsdom
/**
 * The relay-backed search seam. The relay is faked at the transport edge
 * (lib/searchRelay) with a controllable frame stream that reports its own
 * teardown — what these tests assert is behavior the UI depends on:
 * what goes on the wire, how snapshots arrive, and that cancellation is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject, of, throwError } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

interface ReqFrame {
  type: "OPEN" | "EVENT" | "EOSE" | "CLOSED";
  from: string;
  id: string;
  event?: NostrEvent;
  reason?: string;
  filters?: unknown[];
}

const reqMock = vi.fn();
const countMock = vi.fn();
const zapReqMock = vi.fn();
vi.mock("@/lib/zapstoreRelay", () => ({
  zapstoreRelay: () => ({ req: (...args: unknown[]) => zapReqMock(...args) }),
}));
/** The relay's socket state as search.ts reads it — tests move it. */
const relayState = { connected: true, ready: true, lastMessageAt: Date.now() };
const reportSearchFailureMock = vi.fn();
vi.mock("@/lib/serverStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serverStatus")>();
  return { ...actual, reportSearchFailure: () => reportSearchFailureMock() };
});
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({
    get connected() { return relayState.connected; },
    get ready() { return relayState.ready; },
    get lastMessageAt() { return relayState.lastMessageAt; },
    req: (...args: unknown[]) => reqMock(...args),
    count: (...args: unknown[]) => countMock(...args),
  }),
}));
const houseMock = vi.fn(() => Promise.resolve<string | null>("f".repeat(64)));
vi.mock("@/services/trustSource", () => ({
  resolveHouseObserver: () => houseMock(),
}));
const getReplaceableMock = vi.fn<(kind: number, pubkey: string) => NostrEvent | undefined>(() => undefined);
const storeAddMock = vi.fn((event: unknown) => event);
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (kind: number, pubkey: string) => getReplaceableMock(kind, pubkey),
    add: (event: unknown) => storeAddMock(event),
  },
}));

import {
  appAddress,
  fetchAppReviews,
  fetchAppZaps,
  fetchAppEndorsementCounts,
  fetchNoteEngagement,
  fetchAppsByAddress,
  fetchPersonVouches,
  fetchVouchReplies,
  fetchNipPage,
  fetchSpecsForKind,
  fetchPersonSets,
  fetchReleases,
  fetchRepoActivity,
  fetchRepoCounts,
  fetchReleaseAsset,
  zapStoreUrl,
  fetchSimilarApps,
  fetchSimilarListings,
  fetchCommentsByAddress,
  fetchGitStatuses,
  fetchGitCommentCounts,
  fetchRepoForks,
  fetchRepoByAddress,
  fetchEventRsvps,
  searchStream,
  suggestProfiles,
  kindsForTab,
  TAB_KINDS,
  type SearchSnapshot, type SearchHit, type SearchTab } from "./search";
import { __resetAuthorProfileQueue } from "./authorProfileQueue";

const HOUSE = "f".repeat(64);

function controllable() {
  const subject = new Subject<ReqFrame>();
  const torndown = { count: 0 };
  const source = new Observable<ReqFrame>((subscriber) => {
    const inner = subject.subscribe(subscriber);
    return () => {
      torndown.count++;
      inner.unsubscribe();
    };
  });
  reqMock.mockImplementation(() => source);
  return { subject, torndown };
}

function ev(id: string, kind = 0, pubkey = "a".repeat(64), content = "{}"): NostrEvent {
  return { id, kind, pubkey, tags: [], content, created_at: 1, sig: "s" } as NostrEvent;
}

const frame = (event: NostrEvent): ReqFrame => ({ type: "EVENT", from: "wss://x", id: "s", event });
const EOSE: ReqFrame = { type: "EOSE", from: "wss://x", id: "s" };

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * The filters one REQ carried. searchStream now sends a UNION — a `#tag`, a
 * `group:`, a `label:` or a NIP-73 scope asks several questions ORed in one
 * subscription — so `[0]` is the primary filter and the rest are its side
 * questions. Everything else in this file still sends a single filter.
 */
function askedFilters(call = 0): Record<string, unknown>[] {
  const arg = reqMock.mock.calls[call][0];
  return (Array.isArray(arg) ? arg : [arg]) as Record<string, unknown>[];
}
const asked = (call = 0) => askedFilters(call)[0];

beforeEach(() => vi.clearAllMocks());

describe("searchStream", () => {
  it("a typed kind narrows the tab it is on — spec: on Articles asks for specs alone", async () => {
    controllable();

    searchStream("dvm spec:", { tab: "articles", pov: "nosfabrica" }, () => {});
    await tick();

    const filter = asked() as { kinds?: number[]; search: string };
    expect(filter.kinds).toEqual([30817]);
    expect(filter.search).toMatch(/^dvm observer:/);
  });

  /**
   * Recipes are ordinary long-form articles with zap.cooking's tag on them, so
   * a Recipes vertical is not a kind of its own — it is the article kind narrowed
   * by tag on the relay (probed on the search relay, 2026-09-22: the tag alone
   * returns the newest recipes; tag plus words returns "chili, but only recipes").
   */
  it("the Recipes tab asks the relay for articles tagged as recipes, words and all", async () => {
    controllable();

    searchStream("chili", { tab: "recipes", pov: "nosfabrica" }, () => {});
    await tick();

    const filter = asked() as { kinds?: number[]; "#t"?: string[]; search: string };
    expect(filter.kinds).toEqual([30023]);
    expect(filter["#t"]).toEqual(expect.arrayContaining(["zapcooking", "nostrcooking"]));
    expect(filter.search).toMatch(/^chili observer:/);
  });

  /**
   * On the NIPs tab a kind is what a spec COVERS, not what it is: `kind:5905`
   * asks for the specs that define kind 5905, through the `k` tag they carry
   * (probed on the search relay, 2026-09-23: `#k` narrows specs server-side;
   * the relay holds no kind-5905 events at all, so the events meaning would
   * always be empty there). Intersecting the tab's kinds with the typed one
   * left the tab asking nothing.
   */
  it("on NIPs, a typed kind asks for the specs that cover it", async () => {
    controllable();

    searchStream("kind:5905", { tab: "nips", pov: "nosfabrica" }, () => {});
    await tick();

    const filter = asked() as { kinds?: number[]; "#k"?: string[]; search: string };
    expect(filter.kinds).toEqual([30817]);
    expect(filter["#k"]).toEqual(["5905"]);
    expect(filter.search).toMatch(/^observer:/);
  });

  it("streams people hits incrementally, with the house observer on the wire", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];

    searchStream("jack", { tab: "people", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick(); // observer resolution is async — the REQ opens after it

    // The wire: query text passes through verbatim, observer appended, tab → kinds.
    expect(reqMock).toHaveBeenCalledTimes(1);
    const filter = asked() as { kinds?: number[]; search: string; limit: number };
    expect(filter.kinds).toEqual([0]);
    expect(filter.search).toBe(`jack observer:${HOUSE}`);
    expect(filter.limit).toBeGreaterThan(0);

    subject.next(frame(ev("e1", 0, "b".repeat(64), JSON.stringify({ name: "jack" }))));
    await tick();
    expect(snaps.at(-1)!.hits).toHaveLength(1);
    expect(snaps.at(-1)!.eose).toBe(false);
    expect(snaps.at(-1)!.hits[0].author?.name).toBe("jack");

    subject.next(frame(ev("e2", 0, "c".repeat(64))));
    subject.next(EOSE);
    await tick();
    const last = snaps.at(-1)!;
    expect(last.hits.map((h) => h.event.id)).toEqual(["e1", "e2"]);
    expect(last.eose).toBe(true);
    expect(last.error).toBeNull();
  });
});

// One submit on the Everything tab opened eight REQs — and the relay works a
// socket's REQs as a queue, so the slowest section held up the rest (probed
// 2026-09-16: 8 REQs 5,145ms vs one REQ carrying all eight filters 2,514ms,
// same 75 events). Streams that name the same group share one REQ.
// The typeahead guesses who you mean; the People section then asks the search
// the same question. What the search does not return is not a result.
describe("searchStream — a provisional seed", () => {
  const person = (id: string): SearchHit => ({
    event: { id, kind: 0, pubkey: id.padEnd(64, "0"), tags: [], content: "{}", created_at: 5, sig: "s" } as NostrEvent,
    author: null,
    rank: null,
  });

  it("keeps the ones the search returns and drops the ones it does not", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];
    searchStream(
      "vitor",
      { tab: "people", pov: "nosfabrica", seed: [person("guessed"), person("alsoGuessed")], provisionalSeed: true },
      (s) => snaps.push(s),
    );
    await tick();
    // Both show while the relay is still answering — that is the point of them.
    expect(snaps.at(-1)!.hits.map((h) => h.event.id)).toEqual(["guessed", "alsoGuessed"]);

    subject.next(frame(person("guessed").event));
    subject.next(frame(person("fromRelay").event));
    subject.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits.map((h) => h.event.id).sort()).toEqual(["fromRelay", "guessed"]);
  });

  it("leaves an ordinary seed alone — a remembered page is an answer, not a guess", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];
    searchStream("vitor", { tab: "people", pov: "nosfabrica", seed: [person("remembered")] }, (s) => snaps.push(s));
    await tick();
    subject.next(frame(person("fresh").event));
    subject.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits.map((h) => h.event.id).sort()).toEqual(["fresh", "remembered"]);
  });
});

describe("searchStream — grouped", () => {
  const note = (id: string, created_at = 1): NostrEvent =>
    ({ id, kind: 1, pubkey: "a".repeat(64), tags: [], content: id, created_at, sig: "s" }) as NostrEvent;
  /** Microtasks plus the batching window the group waits out. */
  const settle = async () => {
    await tick();
    await new Promise((r) => setTimeout(r, 1));
    await tick();
  };

  it("opens one REQ carrying a filter per member", async () => {
    controllable();
    searchStream("bitcoin sort:recent", { tab: "notes", pov: "nosfabrica", limit: 10, group: "search-everything" }, () => {});
    searchStream("bitcoin", { tab: "people", pov: "nosfabrica", limit: 8, group: "search-everything" }, () => {});
    await settle();

    expect(reqMock).toHaveBeenCalledTimes(1);
    const filters = reqMock.mock.calls[0][0] as { kinds?: number[]; search: string; limit: number }[];
    expect(filters).toHaveLength(2);
    expect(filters[0].kinds).toEqual(TAB_KINDS.notes);
    expect(filters[0].search).toBe(`bitcoin sort:recent observer:${HOUSE}`);
    expect(filters[0].limit).toBe(10);
    expect(filters[1].kinds).toEqual([0]);
    expect(filters[1].search).toBe(`bitcoin observer:${HOUSE}`);
    expect(filters[1].limit).toBe(8);
  });

  /**
   * Everything is one request with a filter per section, each routed by kind.
   * A typed kind must narrow each section, not replace its kinds — or Latest,
   * Happening and Media all ask for specs and every section fills with them
   * (seen live, 2026-09-22). A section left with no kinds asks nothing and
   * finishes empty.
   */
  it("on Everything, a typed kind narrows each section, and empties the ones it doesn't fit", async () => {
    controllable();
    const notes: SearchSnapshot[] = [];

    searchStream("dvm spec:", { tab: "notes", pov: "nosfabrica", limit: 10, group: "search-everything" }, (s) => notes.push(s));
    searchStream("dvm spec:", { tab: "articles", pov: "nosfabrica", limit: 5, group: "search-everything" }, () => {});
    await settle();

    const filters = reqMock.mock.calls[0][0] as { kinds?: number[] }[];
    expect(filters.map((f) => f.kinds)).toEqual([[30817]]); // Articles alone asked
    expect(notes.at(-1)).toMatchObject({ hits: [], eose: true });
  });


  it("gives each member only the events its filter asked for, and settles them together", async () => {
    const { subject } = controllable();
    const notes: SearchSnapshot[] = [];
    const people: SearchSnapshot[] = [];
    searchStream("bitcoin sort:recent", { tab: "notes", pov: "nosfabrica", limit: 10, group: "search-everything" }, (s) => notes.push(s));
    searchStream("bitcoin", { tab: "people", pov: "nosfabrica", limit: 8, group: "search-everything" }, (s) => people.push(s));
    await settle();

    subject.next(frame(ev("p1", 0, "b".repeat(64), JSON.stringify({ name: "jack" }))));
    subject.next(frame(note("n1")));
    await settle();
    expect(notes.at(-1)!.hits.map((h) => h.event.id)).toEqual(["n1"]);
    expect(people.at(-1)!.hits.map((h) => h.event.id)).toEqual(["p1"]);

    subject.next(EOSE);
    await settle();
    expect(notes.at(-1)!.eose).toBe(true);
    expect(people.at(-1)!.eose).toBe(true);
  });

  it("keeps the others streaming when one member goes, and tears the REQ down with the last", async () => {
    const { subject, torndown } = controllable();
    const notes: SearchSnapshot[] = [];
    const people: SearchSnapshot[] = [];
    const stopNotes = searchStream("bitcoin sort:recent", { tab: "notes", pov: "nosfabrica", limit: 10, group: "search-everything" }, (s) => notes.push(s));
    const stopPeople = searchStream("bitcoin", { tab: "people", pov: "nosfabrica", limit: 8, group: "search-everything" }, (s) => people.push(s));
    await settle();

    stopNotes();
    const seenByNotes = notes.length;
    subject.next(frame(note("n2")));
    subject.next(frame(ev("p2", 0, "c".repeat(64))));
    await settle();
    expect(notes).toHaveLength(seenByNotes);
    expect(people.at(-1)!.hits.map((h) => h.event.id)).toEqual(["p2"]);
    expect(torndown.count).toBe(0);

    stopPeople();
    expect(torndown.count).toBe(1);
  });

  it("tells every member when the shared REQ fails", async () => {
    const { subject } = controllable();
    const notes: SearchSnapshot[] = [];
    const people: SearchSnapshot[] = [];
    searchStream("bitcoin sort:recent", { tab: "notes", pov: "nosfabrica", limit: 10, group: "search-everything" }, (s) => notes.push(s));
    searchStream("bitcoin", { tab: "people", pov: "nosfabrica", limit: 8, group: "search-everything" }, (s) => people.push(s));
    await settle();

    subject.error(new Error("socket gone"));
    await settle();
    expect(notes.at(-1)!.error).toBeTruthy();
    expect(people.at(-1)!.error).toBeTruthy();
  });

  it("does not let two members of a group ask for the same kind — the second gets its own REQ", async () => {
    controllable();
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica", group: "search-everything" }, () => {});
    searchStream("bitcoin", { tab: "people", pov: "nosfabrica", group: "search-everything" }, () => {});
    // A second notes stream would be handed the first one's events by the
    // kind routing, so it is put on a REQ of its own instead.
    searchStream("nostr", { tab: "notes", pov: "nosfabrica", group: "search-everything" }, () => {});
    await settle();

    expect(reqMock).toHaveBeenCalledTimes(2);
    const shared = reqMock.mock.calls[0][0] as { kinds?: number[] }[];
    expect(shared.map((f) => f.kinds)).toEqual([TAB_KINDS.notes, [0]]);
    const alone = reqMock.mock.calls[1][0] as { kinds?: number[] }[];
    expect(alone).toHaveLength(1);
    expect(alone[0].kinds).toEqual(TAB_KINDS.notes);
  });

  it("leaves a kindless stream out of the group — it would swallow every event", async () => {
    controllable();
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica", group: "search-everything" }, () => {});
    searchStream("bitcoin", { tab: "everything", pov: "nosfabrica", group: "search-everything" }, () => {});
    await settle();
    expect(reqMock).toHaveBeenCalledTimes(2);
    expect((reqMock.mock.calls[0][0] as unknown[]).length ?? 1).toBe(1);
  });

  it("leaves an ungrouped stream on its own REQ", async () => {
    controllable();
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica", group: "search-everything" }, () => {});
    searchStream("bitcoin", { tab: "people", pov: "nosfabrica" }, () => {});
    await settle();
    expect(reqMock).toHaveBeenCalledTimes(2);
  });
});

// Benjamin (2026-09-09): "right now search pages are getting capped" — one
// page of a hundred and a wall. Probed the relay the same day: with
// sort:recent a second REQ with `until` at the oldest seen returns the next
// hundred older, no overlap — time is the cursor. The handle's `more` turns
// that page.
describe("searchStream — more", () => {
  /** One controllable subject per REQ, in the order the stream opens them. */
  function pages(n: number) {
    const subjects = Array.from({ length: n }, () => new Subject<ReqFrame>());
    reqMock.mockImplementation(() => {
      const idx = reqMock.mock.calls.length - 1;
      return new Observable<ReqFrame>((subscriber) => {
        const inner = subjects[idx].subscribe(subscriber);
        return () => inner.unsubscribe();
      });
    });
    return subjects;
  }
  const note = (id: string, created_at: number): NostrEvent => ({ id, kind: 1, pubkey: "a".repeat(64), tags: [], content: id, created_at, sig: "s" }) as NostrEvent;

  it("asked for more, a recent-sorted stream requests the page older than what it has and appends it", async () => {
    const [first, second] = pages(2);
    const snaps: SearchSnapshot[] = [];
    const handle = searchStream("sort:recent", { tab: "notes", pov: "nosfabrica", limit: 3 }, (s) => snaps.push(s));
    await tick();
    first.next(frame(note("n1", 3000)));
    first.next(frame(note("n2", 2000)));
    first.next(frame(note("n3", 1000)));
    first.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.eose).toBe(true);

    handle.more();
    await tick();
    expect(reqMock).toHaveBeenCalledTimes(2);
    const page2 = asked(1) as { until?: number; limit: number; search: string; kinds?: number[] };
    expect(page2.until).toBe(1000);
    expect(page2.limit).toBe(3);
    expect(page2.search).toBe((asked() as { search: string }).search);
    expect(page2.kinds).toEqual((asked() as { kinds?: number[] }).kinds);

    second.next(frame(note("n3", 1000))); // the boundary second comes back — once
    second.next(frame(note("n4", 900)));
    second.next(frame(note("n5", 800)));
    second.next(EOSE);
    await tick();
    const last = snaps.at(-1)!;
    expect(last.hits.map((h) => h.event.id)).toEqual(["n1", "n2", "n3", "n4", "n5"]);
    expect(last.eose).toBe(true);
    handle();
  });

  it("a short page is the last: the stream says so, and a further more() opens nothing", async () => {
    const [first, second] = pages(3);
    const snaps: SearchSnapshot[] = [];
    const handle = searchStream("sort:recent", { tab: "notes", pov: "nosfabrica", limit: 3 }, (s) => snaps.push(s));
    await tick();
    first.next(frame(note("n1", 3000)));
    first.next(frame(note("n2", 2000)));
    first.next(frame(note("n3", 1000)));
    first.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.exhausted).toBe(false);
    handle.more();
    await tick();
    expect(snaps.at(-1)!.loadingMore).toBe(true);
    second.next(frame(note("n4", 900)));
    second.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits).toHaveLength(4);
    expect(snaps.at(-1)!.loadingMore).toBe(false);
    expect(snaps.at(-1)!.exhausted).toBe(true);
    handle.more();
    await tick();
    expect(reqMock).toHaveBeenCalledTimes(2);
    handle();
  });

  // Best match has no time cursor: the relay's ranking is stable as the
  // limit grows (200 is the 100 plus a tail), so more is a bigger ask and
  // only the tail is new.
  it("a best-match stream asks again with a bigger page and keeps only the tail it had not seen", async () => {
    const [first, second] = pages(2);
    const snaps: SearchSnapshot[] = [];
    const handle = searchStream("bitcoin", { tab: "notes", pov: "nosfabrica", limit: 3 }, (s) => snaps.push(s));
    await tick();
    for (const [id, at] of [["r1", 5], ["r2", 9], ["r3", 2]] as const) first.next(frame(note(id, at)));
    first.next(EOSE);
    await tick();
    handle.more();
    await tick();
    const page2 = asked(1) as { until?: number; limit: number };
    expect(page2.until).toBeUndefined();
    expect(page2.limit).toBe(6);
    for (const [id, at] of [["r1", 5], ["r2", 9], ["r3", 2], ["r4", 7], ["r5", 1]] as const) second.next(frame(note(id, at)));
    second.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits.map((h) => h.event.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(snaps.at(-1)!.exhausted).toBe(true);
    handle();
  });

  // Probed 2026-09-09: the relay sends MORE than `limit` (asked 600, got
  // 1003; asked 2000, got 2469). A bigger ask each page would pull thousands
  // on a long scroll, so best match stops asking past a ceiling — and the
  // page never reads as short, so "nothing new" is the end.
  it("best match stops turning pages past a ceiling, without a request", async () => {
    const [first] = pages(2);
    const snaps: SearchSnapshot[] = [];
    const handle = searchStream("bitcoin", { tab: "notes", pov: "nosfabrica", limit: 350 }, (s) => snaps.push(s));
    await tick();
    for (let i = 0; i < 350; i++) first.next(frame(note(`b${i}`, 10_000 - i)));
    first.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.exhausted).toBe(false);
    handle.more(); // would ask for 700
    await tick();
    expect(reqMock).toHaveBeenCalledTimes(1);
    expect(snaps.at(-1)!.exhausted).toBe(true);
    expect(snaps.at(-1)!.loadingMore).toBe(false);
    handle();
  });

  it("a relay that sends more than asked still ends the paging when nothing new arrives", async () => {
    const [first, second] = pages(2);
    const snaps: SearchSnapshot[] = [];
    const handle = searchStream("bitcoin", { tab: "notes", pov: "nosfabrica", limit: 2 }, (s) => snaps.push(s));
    await tick();
    for (const id of ["a1", "a2", "a3"]) first.next(frame(note(id, 5))); // three for a limit of two
    first.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.exhausted).toBe(false);
    handle.more();
    await tick();
    for (const id of ["a1", "a2", "a3", "a2", "a1"]) second.next(frame(note(id, 5))); // five, nothing new
    second.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits).toHaveLength(3);
    expect(snaps.at(-1)!.exhausted).toBe(true);
    handle();
  });
});

// Benjamin (2026-09-09), over mar's scoped Live tab: "this user has
// replays, but when I search by that user I'm not seeing any under Live".
// A NIP-53 stream is published by the streaming platform's key with the
// streamer as its `p` host, so "mar's streams" are the ones she HOSTS —
// probed: 161 ended streams under her own key, none with a recording; 300
// under the platform's, 67 with replays. A person scope on the Live tab
// asks by host.
// Opening a result and coming back used to restart the search at page one
// (2026-09-09): a reader ten pages deep landed at the top with nothing
// below. A stream can be seeded with the pages a previous life had — they
// show at once, the first page refreshes in front of them, and the next
// page turns from the seed's end.
describe("searchStream — seeded from a previous life", () => {
  function pages(n: number) {
    const subjects = Array.from({ length: n }, () => new Subject<ReqFrame>());
    reqMock.mockImplementation(() => {
      const idx = reqMock.mock.calls.length - 1;
      return new Observable<ReqFrame>((subscriber) => {
        const inner = subjects[idx].subscribe(subscriber);
        return () => inner.unsubscribe();
      });
    });
    return subjects;
  }
  const note = (id: string, created_at: number): NostrEvent => ({ id, kind: 1, pubkey: "a".repeat(64), tags: [], content: id, created_at, sig: "s" }) as NostrEvent;
  const hit = (id: string, created_at: number): SearchHit => ({ event: note(id, created_at), author: null, rank: null });

  it("shows the seed at once, refreshes the first page in front of it, and turns the next page from its end", async () => {
    const [first, second] = pages(2);
    const snaps: SearchSnapshot[] = [];
    const seed = [hit("n1", 3000), hit("n2", 2000), hit("n3", 1000)];
    const handle = searchStream("sort:recent", { tab: "notes", pov: "nosfabrica", limit: 3, seed }, (s) => snaps.push(s));
    expect(snaps.at(-1)!.hits.map((h) => h.event.id)).toEqual(["n1", "n2", "n3"]);
    expect(snaps.at(-1)!.eose).toBe(false);
    await tick();
    first.next(frame(note("n0", 4000)));
    first.next(frame(note("n1", 3000)));
    first.next(frame(note("n2", 2000)));
    first.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits.map((h) => h.event.id)).toEqual(["n0", "n1", "n2", "n3"]);
    expect(snaps.at(-1)!.eose).toBe(true);
    handle.more();
    await tick();
    expect((asked(1) as { until?: number }).until).toBe(1000);
    second.next(frame(note("n4", 900)));
    second.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits.map((h) => h.event.id)).toEqual(["n0", "n1", "n2", "n3", "n4"]);
    handle();
  });
});

describe("searchStream — a person's live streams", () => {
  const MAR = "c7acabf1fed201a53185e4dc5e0c6bae2bc5db19d73abf840535f305d8f05180";
  const MAR_NPUB = "npub1c7k2hu076gq62vv9unw9urrt4c4utkce6uatlpq9xhestk8s2xqql8qh4c";

  it("a person scope on the Live tab asks the relay for streams they host, not streams they authored", async () => {
    controllable();
    searchStream(`from:${MAR_NPUB} sort:recent`, { tab: "live", pov: "nosfabrica" }, () => {});
    await tick();
    const filter = asked() as { kinds?: number[]; authors?: string[]; "#p"?: string[] };
    expect(filter.kinds).toEqual([30311, 30312, 30313]);
    expect(filter["#p"]).toEqual([MAR]);
    expect(filter.authors).toBeUndefined();
  });

  // `#p` matches any role. A stream she hosted is hers; one where she was a
  // guest speaker belongs to whoever hosted it.
  it("keeps the streams they host and drops the ones they only spoke on", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];
    searchStream(`from:${MAR_NPUB} sort:recent`, { tab: "live", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick();
    const stream = (id: string, role: string | null) => ({ id, kind: 30311, pubkey: "d".repeat(64), tags: [["d", id], ["status", "ended"], role === null ? ["p", MAR] : ["p", MAR, "", role]], content: "", created_at: 10, sig: "s" }) as NostrEvent;
    subject.next(frame(stream("hosted", "host")));
    subject.next(frame(stream("unroled", null)));
    subject.next(frame(stream("guest", "speaker")));
    subject.next(EOSE);
    await tick();
    expect(snaps.at(-1)!.hits.map((h) => h.event.id)).toEqual(["hosted", "unroled"]);
  });
});

// A dead relay used to be an eternal skeleton: the request errored into an
// uncaught rxjs throw, or hung, and the snapshot never changed. Now the
// stream says so, and tells the server-status store when the socket is the
// reason (2026-09-09: the sorry page).
describe("searchStream — when the relay fails", () => {
  beforeEach(() => {
    relayState.connected = true;
    relayState.ready = true;
    relayState.lastMessageAt = Date.now();
  });

  it("a request that errors while the socket is down says so and tells the store; a rate limit is a friendly line and nothing more", async () => {
    const { RelayClosedError } = await import("applesauce-relay");
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];
    relayState.connected = false;
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick();
    subject.error(new Event("error"));
    await tick();
    expect(snaps.at(-1)!.error).toMatch(/running behind/i);
    expect(reportSearchFailureMock).toHaveBeenCalledTimes(1);

    reportSearchFailureMock.mockClear();
    relayState.connected = true;
    const second = controllable();
    const snaps2: SearchSnapshot[] = [];
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => snaps2.push(s));
    await tick();
    second.subject.error(new RelayClosedError("rate-limited: too many concurrent subscriptions (max 50)"));
    await tick();
    expect(snaps2.at(-1)!.error).toMatch(/too many searches/i);
    expect(reportSearchFailureMock).not.toHaveBeenCalled();
  });

  it("a request nothing answers for ten seconds while the socket is down tells the store", async () => {
    vi.useFakeTimers();
    try {
      controllable();
      const snaps: SearchSnapshot[] = [];
      relayState.connected = false;
      relayState.ready = false;
      const handle = searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
      await vi.advanceTimersByTimeAsync(0);
      expect(reportSearchFailureMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reportSearchFailureMock).toHaveBeenCalledTimes(1);
      expect(snaps.at(-1)!.error).toMatch(/running behind/i);
      handle();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("browse mode — no keyword at all", () => {
  // Benjamin's ask: "what if they just want to see all the live events?"
  // A keyword can only NARROW. An empty query with a kinds set is a valid
  // browse — the lens still rides the search field (probed live: 8 streams
  // in 423ms).
  it("streams a vertical with no text — just the lens on the wire", async () => {
    controllable();
    searchStream("", { tab: "live", pov: "nosfabrica" }, () => {});
    await tick();
    const filter = asked() as { kinds?: number[]; search: string };
    expect(filter.kinds).toEqual(TAB_KINDS.live);
    expect(filter.search).toBe(`observer:${HOUSE}`);
  });
});

describe("token lifting", () => {
  // The relay never sees from:/to:/#tag/since:/until:/group:/label:/the NIP-73
  // scopes — they become NIP-01 filter fields (probed: sending them through
  // matches nothing). A tag asks more than one question, so what goes on the
  // wire is a union ORed in one subscription, exactly as the relay's own
  // operator page builds it.
  it("lifts from: into the authors field before the wire", async () => {
    controllable();
    const alice = "a".repeat(64);
    searchStream(`gm from:${alice}`, { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    const filter = asked();
    expect(filter.authors).toEqual([alice]);
    expect(filter.search).toBe(`gm observer:${HOUSE}`);
  });

  it("a #tag asks #t, #l and the NIP-22 comments written on it, every casing", async () => {
    controllable();
    searchStream("gm #Nostr", { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    const union = askedFilters();
    expect(union.map((f) => Object.keys(f).find((k) => k.startsWith("#")))).toEqual(["#t", "#l", "#I", "#i"]);
    // Normalised to lowercase first, then asked in every casing the store may hold.
    expect(union[0]["#t"]).toEqual(["nostr", "Nostr", "NOSTR"]);
    // The words, the lens and the tab ride every filter of the union.
    for (const f of union) expect(f.search).toBe(`gm observer:${HOUSE}`);
  });

  it("a group: asks #h, and does not drag the group's metadata into the results", async () => {
    controllable();
    searchStream("group:abc", { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    const union = askedFilters();
    expect(union).toHaveLength(1);
    expect(union[0]["#h"]).toEqual(["abc"]);
  });

  it("a NIP-73 scope asks the comments written on that thing, in every spelling", async () => {
    controllable();
    searchStream("isbn:978-0593330005", { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    const union = askedFilters();
    expect(union.every((f) => (f.kinds as number[])[0] === 1111)).toBe(true);
    expect(union[0]["#I"]).toEqual(["isbn:9780593330005", "isbn:978-0593330005"]);
  });

  it("a to: pointer becomes the #e question about that event", async () => {
    controllable();
    const note = nip19.noteEncode("b".repeat(64));
    searchStream(`to:${note}`, { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    expect(asked()["#e"]).toEqual(["b".repeat(64)]);
  });
});

// A union cannot be paged by walking `until` back. `oldest` is the oldest second ANY filter
// returned, so rewinding them all to it skips whatever a filter held between its own oldest
// and that one — silently, and for good.
describe("paging a union", () => {
  function pages(n: number) {
    const subjects = Array.from({ length: n }, () => new Subject<ReqFrame>());
    reqMock.mockImplementation(() => {
      const idx = reqMock.mock.calls.length - 1;
      return new Observable<ReqFrame>((subscriber) => {
        const inner = subjects[idx].subscribe(subscriber);
        return () => inner.unsubscribe();
      });
    });
    return subjects;
  }
  const note = (id: string, created_at: number, tags: string[][] = []): NostrEvent =>
    ({ id, kind: 1, pubkey: "a".repeat(64), tags, content: id, created_at, sig: "s" }) as NostrEvent;

  it("grows its limits instead of rewinding every filter to the oldest second any of them saw", async () => {
    const [first] = pages(2);
    const handle = searchStream("#nostr sort:recent", { tab: "notes", pov: "nosfabrica", limit: 4 }, () => {});
    await tick();
    const page1 = askedFilters();
    expect(page1.length).toBeGreaterThan(1);
    // `#t` reaches far back; a side filter stops early. The old cursor would have rewound
    // `#t` to 900 and lost everything it had between 900 and its own oldest.
    first.next(frame(note("a", 5000)));
    first.next(frame(note("b", 900)));
    first.next(EOSE);
    await tick();

    handle.more();
    await tick();
    const page2 = askedFilters(1);
    for (const f of page2) expect(f.until).toBeUndefined();
    // Every filter grew in proportion, side questions included.
    expect(page2.map((f) => f.limit)).toEqual(page1.map((f) => (f.limit as number) * 2));
  });

  it("a single filter still walks back — that is what `until` is for", async () => {
    const [first] = pages(2);
    const handle = searchStream("gm sort:recent", { tab: "notes", pov: "nosfabrica", limit: 2 }, () => {});
    await tick();
    expect(askedFilters()).toHaveLength(1);
    first.next(frame(note("a", 5000)));
    first.next(frame(note("b", 900)));
    first.next(EOSE);
    await tick();
    handle.more();
    await tick();
    expect(asked(1).until).toBe(900);
  });

  it("a union is exhausted when a page brings nothing new, not when its total runs short", async () => {
    const [first] = pages(3);
    const snaps: SearchSnapshot[] = [];
    const handle = searchStream("#nostr sort:recent", { tab: "notes", pov: "nosfabrica", limit: 4 }, (s) => snaps.push(s));
    await tick();
    // Fewer events than the union's limits add up to — one filter simply had nothing. That
    // must not read as "the whole search is done".
    first.next(frame(note("a", 5000)));
    first.next(EOSE);
    await tick();
    handle.more();
    await tick();
    expect(reqMock).toHaveBeenCalledTimes(2);
  });
});

describe("hits reach the event store", () => {
  // The search relay indexes a wider corpus than the general content relays —
  // Benjamin clicked a result and the /e page said "couldn't find this note"
  // because it only asked relays that never had it. We HAVE the event the
  // moment it streams in: store it, and the click renders from the store.
  it("adds every streamed hit to the event store", async () => {
    const { subject } = controllable();
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    const note = ev("n1", 1, "a".repeat(64), "found only on the search relay");
    subject.next(frame(note));
    await tick();
    expect(storeAddMock).toHaveBeenCalledWith(note);
  });
});

describe("cancellation", () => {
  it("tears the REQ down and never calls back after cancel", async () => {
    const { subject, torndown } = controllable();
    const snaps: SearchSnapshot[] = [];

    const cancel = searchStream("jack", { tab: "people", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick();
    subject.next(frame(ev("e1")));
    await tick();
    const before = snaps.length;

    cancel();
    expect(torndown.count).toBe(1);
    subject.next(frame(ev("e2")));
    subject.next(EOSE);
    await tick();
    expect(snaps.length).toBe(before);
  });

  it("cancelling before the observer resolves opens no REQ at all", async () => {
    controllable();
    const cancel = searchStream("jack", { tab: "people", pov: "nosfabrica" }, () => {});
    cancel(); // synchronously, before the async observer resolution finishes
    await tick();
    expect(reqMock).not.toHaveBeenCalled();
  });
});

describe("the observer lens", () => {
  it("uses the user's own pubkey for mywot", async () => {
    controllable();
    const me = "1".repeat(64);
    searchStream("jack", { tab: "people", pov: "mywot", userPubkey: me }, () => {});
    await tick();
    expect((asked() as { search: string }).search).toBe(`jack observer:${me}`);
  });

  it("never double-tags a query that already names a lens", async () => {
    controllable();
    searchStream("jack observer:" + "2".repeat(64), { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    searchStream("jack include:spam", { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    expect((asked() as { search: string }).search).toBe("jack observer:" + "2".repeat(64));
    expect((asked(1) as { search: string }).search).toBe("jack include:spam");
  });

  it("falls back to include:spam when no observer can be resolved", async () => {
    // The relay refuses lens-less reads outright — a missing house observer
    // must degrade to the unranked corpus, not a dead search box.
    houseMock.mockResolvedValueOnce(null);
    controllable();
    searchStream("jack", { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    expect((asked() as { search: string }).search).toBe("jack include:spam");
  });
});

describe("failure surfaces honestly", () => {
  it("a CLOSED reason lands in the snapshot error", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];
    searchStream("x", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick();
    subject.next({ type: "CLOSED", from: "wss://x", id: "s", reason: "auth-required: no lens" });
    await tick();
    expect(snaps.at(-1)!.error).toContain("auth-required");
  });
});

describe("suggestProfiles", () => {
  it("resolves at EOSE with deduped profiles, capped at the limit", async () => {
    const { subject } = controllable();
    const pending = suggestProfiles("ja", { pov: "nosfabrica" }, { limit: 2 });
    await tick();
    subject.next(frame(ev("p1", 0, "a".repeat(64), JSON.stringify({ name: "jack" }))));
    subject.next(frame(ev("p1b", 0, "a".repeat(64), JSON.stringify({ name: "jack dupe" }))));
    subject.next(frame(ev("p2", 0, "b".repeat(64), JSON.stringify({ name: "jane" }))));
    subject.next(frame(ev("p3", 0, "c".repeat(64), JSON.stringify({ name: "jam" }))));
    subject.next(EOSE);
    const results = await pending;
    expect(results.map((r) => r.name)).toEqual(["jack", "jane"]);
  });

  it("closes its relay subscription as soon as the caller aborts", async () => {
    const { torndown } = controllable();
    const controller = new AbortController();
    const pending = suggestProfiles("vito", { pov: "nosfabrica" }, { signal: controller.signal, timeoutMs: 60_000 });
    await tick();
    expect(torndown.count).toBe(0);
    controller.abort();
    expect(await pending).toEqual([]);
    expect(torndown.count).toBe(1);
  });

  it("opens nothing when the caller already aborted", async () => {
    controllable();
    const controller = new AbortController();
    controller.abort();
    expect(await suggestProfiles("vito", { pov: "nosfabrica" }, { signal: controller.signal, timeoutMs: 60_000 })).toEqual([]);
    expect(reqMock).not.toHaveBeenCalled();
  });
});

/** Multi-REQ fake: every req() call gets its own subject; filters recorded. */
function multiReq() {
  const calls: { filter: Record<string, unknown>; subject: Subject<ReqFrame>; closed: boolean }[] = [];
  reqMock.mockImplementation((filter: Record<string, unknown>) => {
    const call = { filter, subject: new Subject<ReqFrame>(), closed: false };
    calls.push(call);
    return new Observable<ReqFrame>((subscriber) => {
      const inner = call.subject.subscribe(subscriber);
      return () => {
        call.closed = true;
        inner.unsubscribe();
      };
    });
  });
  return calls;
}

describe("author hydration", () => {
  it("batches unknown authors into one kind-0 REQ and re-emits with profiles", async () => {
    vi.useFakeTimers();
    __resetAuthorProfileQueue();
    try {
      const calls = multiReq();
      const snaps: SearchSnapshot[] = [];
      const alice = "a".repeat(64);
      const bob = "b".repeat(64);
      // Bob's profile is already in the event store — he must NOT be re-fetched.
      getReplaceableMock.mockImplementation((_k, pubkey) =>
        pubkey === bob ? ev("known", 0, bob, JSON.stringify({ name: "bob (cached)" })) : undefined,
      );

      searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
      await tick();
      calls[0].subject.next(frame(ev("n1", 1, alice, "note by alice")));
      calls[0].subject.next(frame(ev("n2", 1, bob, "note by bob")));
      calls[0].subject.next({ type: "EOSE", from: "wss://x", id: "s" });
      await tick();

      // Bob resolved synchronously from the store; alice pending.
      const atEose = snaps.at(-1)!;
      expect(atEose.hits.find((h) => h.event.id === "n2")!.author?.name).toBe("bob (cached)");
      expect(atEose.hits.find((h) => h.event.id === "n1")!.author).toBeNull();

      await vi.advanceTimersByTimeAsync(200); // hydration debounce elapses
      expect(calls).toHaveLength(2);
      expect(calls[1].filter.kinds).toEqual([0]);
      expect(calls[1].filter.authors).toEqual([alice]);
      expect(calls[1].filter.search).toBe("include:spam"); // the relay refuses lens-less reads

      calls[1].subject.next(frame(ev("prof", 0, alice, JSON.stringify({ name: "alice" }))));
      calls[1].subject.next({ type: "EOSE", from: "wss://x", id: "h" });
      await tick();
      expect(snaps.at(-1)!.hits.find((h) => h.event.id === "n1")!.author?.name).toBe("alice");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("author hydration on a slow relay", () => {
  const EOSE_FRAME: ReqFrame = { type: "EOSE", from: "wss://x", id: "h" };
  const author = (i: number) => i.toString(16).padStart(64, "0");
  const profile = (pk: string, name: string) => frame(ev(`p-${name}`, 0, pk, JSON.stringify({ name })));
  const hydrations = (calls: ReturnType<typeof multiReq>) => calls.filter((c) => (c.filter.kinds as number[] | undefined)?.[0] === 0);
  const openLookups = (calls: ReturnType<typeof multiReq>) => hydrations(calls).filter((c) => !c.closed);
  const authorName = (snaps: SearchSnapshot[], id: string) => snaps.at(-1)!.hits.find((h) => h.event.id === id)!.author?.name;

  beforeEach(() => {
    vi.useFakeTimers();
    __resetAuthorProfileQueue();
    getReplaceableMock.mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function streamNotes(calls: ReturnType<typeof multiReq>, snaps: SearchSnapshot[]) {
    const handle = searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => snaps.push(s));
    await vi.advanceTimersByTimeAsync(0);
    return { handle, page: calls[0] };
  }

  it("gives every author their profile when answers arrive after the next lookup started", async () => {
    const calls = multiReq();
    const snaps: SearchSnapshot[] = [];
    const { page } = await streamNotes(calls, snaps);
    const [alice, bob] = [author(1), author(2)];

    page.subject.next(frame(ev("n1", 1, alice)));
    await vi.advanceTimersByTimeAsync(200);
    page.subject.next(frame(ev("n2", 1, bob)));
    await vi.advanceTimersByTimeAsync(200);
    const [first, second] = hydrations(calls);
    expect(first.closed).toBe(false);

    first.subject.next(profile(alice, "alice"));
    first.subject.next(EOSE_FRAME);
    second.subject.next(profile(bob, "bob"));
    second.subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);

    expect(authorName(snaps, "n1")).toBe("alice");
    expect(authorName(snaps, "n2")).toBe("bob");
  });

  it("closes each profile lookup once the relay has answered it", async () => {
    const calls = multiReq();
    const { page } = await streamNotes(calls, []);
    page.subject.next(frame(ev("n1", 1, author(1))));
    await vi.advanceTimersByTimeAsync(200);
    const [lookup] = hydrations(calls);
    lookup.subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);
    expect(lookup.closed).toBe(true);
  });

  it("closes every open profile lookup when the search is cancelled", async () => {
    const calls = multiReq();
    const { handle, page } = await streamNotes(calls, []);
    for (let i = 1; i <= 3; i++) {
      page.subject.next(frame(ev(`n${i}`, 1, author(i))));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(hydrations(calls)).toHaveLength(3);
    handle();
    expect(hydrations(calls).every((c) => c.closed)).toBe(true);
  });

  it("looks an author up once for every section that shows them", async () => {
    const calls = multiReq();
    const notes: SearchSnapshot[] = [];
    const media: SearchSnapshot[] = [];
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => notes.push(s));
    searchStream("bitcoin", { tab: "media", pov: "nosfabrica" }, (s) => media.push(s));
    await vi.advanceTimersByTimeAsync(0);
    const alice = author(1);
    calls[0].subject.next(frame(ev("n1", 1, alice)));
    calls[1].subject.next(frame(ev("m1", 20, alice)));
    await vi.advanceTimersByTimeAsync(200);

    const lookups = hydrations(calls);
    expect(lookups).toHaveLength(1);
    lookups[0].subject.next(profile(alice, "alice"));
    lookups[0].subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);
    expect(authorName(notes, "n1")).toBe("alice");
    expect(authorName(media, "m1")).toBe("alice");
  });

  it("keeps the limit of 4 open lookups across every section", async () => {
    const calls = multiReq();
    const sections: [SearchTab, number][] = [["notes", 1], ["media", 20], ["articles", 30023]];
    for (const [tab] of sections) searchStream("bitcoin", { tab, pov: "nosfabrica" }, () => {});
    await vi.advanceTimersByTimeAsync(0);
    // One new author per flush window, rotating through the sections.
    for (let n = 1; n <= 6; n++) {
      const i = (n - 1) % sections.length;
      calls[i].subject.next(frame(ev(`e${n}`, sections[i][1], author(n))));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(openLookups(calls)).toHaveLength(4);

    hydrations(calls)[0].subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);
    expect(openLookups(calls)).toHaveLength(4);
    expect(openLookups(calls).at(-1)!.filter.authors).toEqual([author(5), author(6)]);
  });

  it("doesn't ask again for an author whose lookup is already out", async () => {
    const calls = multiReq();
    const first: SearchSnapshot[] = [];
    const second: SearchSnapshot[] = [];
    searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, (s) => first.push(s));
    searchStream("bitcoin", { tab: "media", pov: "nosfabrica" }, (s) => second.push(s));
    await vi.advanceTimersByTimeAsync(0);
    const alice = author(1);
    calls[0].subject.next(frame(ev("n1", 1, alice)));
    await vi.advanceTimersByTimeAsync(200);
    calls[1].subject.next(frame(ev("m1", 20, alice)));
    await vi.advanceTimersByTimeAsync(200);

    const lookups = hydrations(calls);
    expect(lookups).toHaveLength(1);
    lookups[0].subject.next(profile(alice, "alice"));
    lookups[0].subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);
    expect(authorName(second, "m1")).toBe("alice");
  });

  it("still gives the profile to a section that's waiting when another one stops", async () => {
    const calls = multiReq();
    const staying: SearchSnapshot[] = [];
    const leaving = searchStream("bitcoin", { tab: "notes", pov: "nosfabrica" }, () => {});
    searchStream("bitcoin", { tab: "media", pov: "nosfabrica" }, (s) => staying.push(s));
    await vi.advanceTimersByTimeAsync(0);
    const alice = author(1);
    calls[0].subject.next(frame(ev("n1", 1, alice)));
    calls[1].subject.next(frame(ev("m1", 20, alice)));
    await vi.advanceTimersByTimeAsync(200);

    leaving();
    const [lookup] = hydrations(calls);
    expect(lookup.closed).toBe(false);
    lookup.subject.next(profile(alice, "alice"));
    lookup.subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);
    expect(authorName(staying, "m1")).toBe("alice");
  });

  it("doesn't retry an author the relay has no profile for — until a few minutes later", async () => {
    const calls = multiReq();
    const alice = author(1);
    const showAlice = async (id: string, tab: SearchTab, kind: number) => {
      searchStream("bitcoin", { tab, pov: "nosfabrica" }, () => {});
      await vi.advanceTimersByTimeAsync(0);
      calls.filter((c) => (c.filter.kinds as number[] | undefined)?.[0] !== 0).at(-1)!.subject.next(frame(ev(id, kind, alice)));
      await vi.advanceTimersByTimeAsync(200);
    };

    await showAlice("n1", "notes", 1);
    hydrations(calls)[0].subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(0);

    await showAlice("m1", "media", 20);
    expect(hydrations(calls)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await showAlice("a1", "articles", 30023);
    expect(hydrations(calls)).toHaveLength(2);
  });

  it("asks once more for authors whose lookup the relay never finished", async () => {
    const calls = multiReq();
    const { page } = await streamNotes(calls, []);
    page.subject.next(frame(ev("n1", 1, author(1))));
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(200);
    expect(hydrations(calls)).toHaveLength(2);
    expect(hydrations(calls)[1].filter.authors).toEqual([author(1)]);

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(200);
    expect(hydrations(calls)).toHaveLength(2);
  });

  it("gives up on a lookup the relay never finishes, freeing its slot", async () => {
    const calls = multiReq();
    const { page } = await streamNotes(calls, []);
    page.subject.next(frame(ev("n1", 1, author(1))));
    await vi.advanceTimersByTimeAsync(200);
    const [lookup] = hydrations(calls);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lookup.closed).toBe(true);
  });

  it("keeps at most 4 profile lookups open and sends waiting authors when one finishes", async () => {
    const calls = multiReq();
    const { page } = await streamNotes(calls, []);
    for (let i = 1; i <= 6; i++) {
      page.subject.next(frame(ev(`n${i}`, 1, author(i))));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(openLookups(calls)).toHaveLength(4);

    hydrations(calls)[0].subject.next(EOSE_FRAME);
    await vi.advanceTimersByTimeAsync(200);
    const open = openLookups(calls);
    expect(open).toHaveLength(4);
    expect(open.at(-1)!.filter.authors).toEqual([author(5), author(6)]);
  });
});

describe("fetchSpecsForKind", () => {
  // A structural event's page names the spec that defines its kind — the
  // relay narrows specs by the `k` tags they carry (probed 2026-09-23).
  it("asks for the specs whose k tags name the kind, and resolves them", async () => {
    const { subject } = controllable();
    const pending = fetchSpecsForKind(10040);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([30817]);
    expect(filter["#k"]).toEqual(["10040"]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame({ id: "s1", kind: 30817, pubkey: "b".repeat(64), tags: [["d", "trusted-assertions"], ["title", "Trusted Assertions"], ["k", "10040"]], content: "# TA", created_at: 1, sig: "s" } as NostrEvent));
    subject.next(EOSE);
    expect((await pending).map((e) => e.id)).toEqual(["s1"]);
  });

  it("resolves empty when no spec covers the kind", async () => {
    const { subject } = controllable();
    const pending = fetchSpecsForKind(99999);
    await tick();
    subject.next(EOSE);
    expect(await pending).toEqual([]);
  });
});

describe("fetchNipPage", () => {
  // Wiki NIP pages are kind 30818 with d = "nip-46". Several authors publish
  // competing versions (probed live: fiatjaf's real 10KB page next to a
  // 7-character stub) — the page with the most substance wins the panel.
  const page = (pk: string, content: string): NostrEvent =>
    ({ id: pk.slice(0, 8), kind: 30818, pubkey: pk, tags: [["d", "nip-46"], ["title", "nip-46"]], content, created_at: 1, sig: "s" }) as NostrEvent;

  it("looks the d-tags up and returns the most substantial page", async () => {
    const { subject } = controllable();
    const pending = fetchNipPage(["nip-46"]);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([30818]);
    expect(filter["#d"]).toEqual(["nip-46"]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame(page("b".repeat(64), "stub")));
    subject.next(frame(page("c".repeat(64), "# NIP-46\n\nNostr Connect lets a remote signer ".repeat(5))));
    subject.next(EOSE);
    const best = await pending;
    expect(best?.pubkey).toBe("c".repeat(64));
  });

  it("resolves null when nobody wrote the page", async () => {
    const { subject } = controllable();
    const pending = fetchNipPage(["nip-999"]);
    await tick();
    subject.next(EOSE);
    expect(await pending).toBeNull();
  });
});

describe("fetchRepoActivity", () => {
  // NIP-34: issues (1621) and patches (1617) reference the repo by an
  // "a" tag of 30617:<pubkey>:<d> (probed live). One REQ answers the repo
  // page's activity feed, newest first.
  const ADDR = "30617:" + "b".repeat(64) + ":ngit";
  const item = (id: string, kind: number, at: number): NostrEvent =>
    ({ id, kind, pubkey: "c".repeat(64), tags: [["a", ADDR], ["subject", `subject ${id}`]], content: "", created_at: at, sig: "s" }) as NostrEvent;

  it("returns the repo's issues and patches newest first", async () => {
    const { subject } = controllable();
    const pending = fetchRepoActivity(ADDR);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([1621, 1617, 1618]); // issues, patches, pull requests
    expect(filter["#a"]).toEqual([ADDR]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame(item("old-issue", 1621, 100)));
    subject.next(frame(item("new-patch", 1617, 300)));
    subject.next(frame(item("mid-issue", 1621, 200)));
    subject.next(EOSE);
    const activity = await pending;
    expect(activity.map((e) => e.id)).toEqual(["new-patch", "mid-issue", "old-issue"]);
  });
});

describe("fetchPersonSets", () => {
  // Staging's best idea, our twist: a person's follow-set memberships as
  // social proof — "Verified Human · 3" means THREE exporters' webs of
  // trust vouch for them under that tag.
  const ME = "a".repeat(64);
  const set = (id: string, exporter: string, title: string): NostrEvent =>
    ({ id, kind: 30000, pubkey: exporter, tags: [["d", `tl-pin-${id}`], ["title", title], ["p", ME]], content: "", created_at: 1, sig: "s" }) as NostrEvent;

  it("groups memberships by title and counts distinct exporters", async () => {
    const { subject } = controllable();
    const pending = fetchPersonSets(ME);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([30000]);
    expect(filter["#p"]).toEqual([ME]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame(set("s1", "1".repeat(64), "Verified Human")));
    subject.next(frame(set("s2", "2".repeat(64), "Verified Human")));
    subject.next(frame(set("s3", "3".repeat(64), "Verified Human")));
    subject.next(frame(set("s4", "1".repeat(64), "AOS 2026 Participant")));
    subject.next(frame({ ...set("s5", "4".repeat(64), ""), tags: [["d", "x"], ["p", ME]] } as NostrEvent)); // untitled — out
    subject.next(EOSE);
    // The sets themselves ride along (id + publisher) so a badge can open a
    // specific list's page — the most trusted publisher's — not a search.
    expect(await pending).toEqual([
      {
        title: "Verified Human",
        exporters: 3,
        exporterPubkeys: ["1".repeat(64), "2".repeat(64), "3".repeat(64)],
        sets: [
          { id: "s1", pubkey: "1".repeat(64) },
          { id: "s2", pubkey: "2".repeat(64) },
          { id: "s3", pubkey: "3".repeat(64) },
        ],
      },
      { title: "AOS 2026 Participant", exporters: 1, exporterPubkeys: ["1".repeat(64)], sets: [{ id: "s4", pubkey: "1".repeat(64) }] },
    ]);
  });
});

describe("fetchRepoCounts", () => {
  // NIP-45 COUNT for the repo's issues (1621) and patches (1617), keyed by the
  // repo address. A count is a number off the wire, not a page of events — the
  // right tool for the "is this repo alive?" card signal.
  it("counts issues and patches for the address, through the lens — and reads who contributed and when it was last touched", async () => {
    const addr = "30617:" + "b".repeat(64) + ":ngit";
    countMock.mockImplementation((filter: { kinds: number[] }) =>
      of({ count: filter.kinds[0] === 1621 ? 3 : 1 }),
    );
    const { subject } = controllable();
    const item = (id: string, kind: number, pk: string, at: number): NostrEvent =>
      ({ id: id.padEnd(64, "0"), kind, pubkey: pk, tags: [["a", addr]], content: "", created_at: at, sig: "s" }) as NostrEvent;
    const pending = fetchRepoCounts(addr);
    await tick();
    const page = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(page.kinds).toEqual([1617, 1618, 1621]);
    expect(page["#a"]).toEqual([addr]);
    expect(page.search).toBe("include:spam");
    subject.next(frame(item("p1", 1617, "1".repeat(64), 500)));
    subject.next(frame(item("p2", 1618, "2".repeat(64), 700)));
    subject.next(frame(item("p3", 1617, "1".repeat(64), 300))); // the same contributor again
    subject.next(frame(item("i1", 1621, "3".repeat(64), 900))); // an issue: activity, not a contribution
    subject.next(EOSE);
    const res = await pending;
    expect(res.issues).toBe(3);
    expect(res.patches).toBe(1);
    expect(res.contributors).toEqual(["1".repeat(64), "2".repeat(64)]);
    expect(res.lastAt).toBe(900);
    const filters = countMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(filters.every((f) => (f["#a"] as string[])[0] === addr && f.search === "include:spam")).toBe(true);
    expect(filters.map((f) => (f.kinds as number[])[0]).sort()).toEqual([1617, 1621]);
  });
});

describe("fetchAppReviews", () => {
  // Zap Store reviews are NIP-22 comments (kind 1111, plus a few legacy kind-1
  // notes) whose #a is the listing address. Probed 2026-09-03: 845 of them
  // corpus-wide, none with a rating tag — but each carries `v`, the version the
  // reviewer was running. Fetched through include:spam on purpose: the observer
  // lens is a set FILTER (jack's perspective drops 14 → 0), not a ranker, and
  // trust order is decided on-device where it can be labeled.
  it("returns the listing's comments with the version reviewed", async () => {
    const { subject } = controllable();
    const addr = "32267:" + "b".repeat(64) + ":com.vitorpamplona.amethyst";
    const pending = fetchAppReviews(addr);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([1111, 1]);
    expect(filter["#a"]).toEqual([addr]);
    expect(filter.search).toBe("include:spam");
    expect(filter.limit).toBe(50);

    subject.next(
      frame({
        id: "r1", kind: 1111, pubkey: "c".repeat(64), created_at: 200, sig: "s",
        content: "love Amethyst. is my daily driver",
        tags: [["a", addr], ["k", "32267"], ["v", "1.13.1"]],
      } as NostrEvent),
    );
    subject.next(frame({ id: "r2", kind: 1, pubkey: "d".repeat(64), created_at: 100, sig: "s", content: "Perfect APP!", tags: [["a", addr]] } as NostrEvent));
    subject.next(EOSE);

    expect(await pending).toEqual([
      { id: "r1", pubkey: "c".repeat(64), text: "love Amethyst. is my daily driver", at: 200, version: "1.13.1", k: "32267", kind: 1111 },
      { id: "r2", pubkey: "d".repeat(64), text: "Perfect APP!", at: 100, version: null, k: null, kind: 1 },
    ]);
  });

  it("resolves empty at EOSE when nobody has commented", async () => {
    const { subject } = controllable();
    const pending = fetchAppReviews("32267:" + "b".repeat(64) + ":x");
    await tick();
    subject.next(EOSE);
    expect(await pending).toEqual([]);
  });
});

describe("fetchPersonVouches", () => {
  // Trust reviews of a person: Relay Outpost's kind-31871 vouches — addressable
  // on the subject (d = p = subject), t = vouch | identity, s = vouched, prose
  // content. Probed 2026-09-03: the same kind carries ~131 WalletScrutiny
  // attestations with a different schema, so only events that say s=vouched
  // (or a vouch/identity t) count. One voice per author: the event is
  // addressable per author+subject, so the newest wins.
  it("reads the vouches about a person, dropping foreign kind-31871 events", async () => {
    const { subject } = controllable();
    const SUBJECT = "0461".padEnd(64, "0");
    const AUTHOR = "dabe".padEnd(64, "0");
    const pending = fetchPersonVouches(SUBJECT);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([31871]);
    expect(filter["#p"]).toEqual([SUBJECT]);
    expect(filter.search).toBe("include:spam");

    const vouch = (id: string, pubkey: string, tags: string[][], content: string, at: number): NostrEvent =>
      ({ id, kind: 31871, pubkey, tags, content, created_at: at, sig: "s" }) as NostrEvent;
    subject.next(frame(vouch("v-old", AUTHOR, [["d", SUBJECT], ["p", SUBJECT], ["t", "vouch"], ["s", "vouched"]], "early words", 100)));
    subject.next(frame(vouch("v-new", AUTHOR, [["d", SUBJECT], ["p", SUBJECT], ["t", "identity"], ["s", "vouched"]], "✅ This account is the real Alex Gleason.", 200)));
    subject.next(frame(vouch("ws", "9".repeat(64), [["d", `npub1x:${"e".repeat(64)}`], ["p", SUBJECT], ["validity", "valid"], ["c", "walletscrutiny"]], "", 300)));
    subject.next(frame(vouch("untyped", "8".repeat(64), [["d", SUBJECT], ["p", SUBJECT], ["s", "vouched"]], "solid dev", 150)));
    subject.next(EOSE);

    expect(await pending).toEqual([
      { id: "v-new", pubkey: AUTHOR, type: "identity", text: "✅ This account is the real Alex Gleason.", at: 200 },
      { id: "untyped", pubkey: "8".repeat(64), type: "vouch", text: "solid dev", at: 150 },
    ]);
  });
});

describe("fetchVouchReplies", () => {
  // The reviewed person may answer a vouch publicly: a NIP-22 comment (kind
  // 1111) pointing at the vouch with K=31871. Latest reply per vouch.
  it("returns the newest reply per vouch id", async () => {
    const { subject } = controllable();
    const pending = fetchVouchReplies(["v1", "v2"]);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([1111]);
    expect(filter["#e"]).toEqual(["v1", "v2"]);
    expect(filter["#K"]).toEqual(["31871"]);
    const reply = (id: string, e: string, content: string, at: number): NostrEvent =>
      ({ id, kind: 1111, pubkey: "c".repeat(64), tags: [["E", e], ["e", e], ["K", "31871"], ["k", "31871"]], content, created_at: at, sig: "s" }) as NostrEvent;
    subject.next(frame(reply("r1", "v1", "thanks!", 10)));
    subject.next(frame(reply("r2", "v1", "thanks again!", 20)));
    subject.next(EOSE);
    const replies = await pending;
    expect(replies.get("v1")).toEqual({ id: "r2", pubkey: "c".repeat(64), text: "thanks again!", at: 20 });
    expect(replies.has("v2")).toBe(false);
  });

  it("asks nothing for no vouches", async () => {
    expect((await fetchVouchReplies([])).size).toBe(0);
    expect(reqMock).not.toHaveBeenCalled();
  });
});

describe("fetchAppZaps", () => {
  // Zaps to an app (kind 9735, #a = listing address; Amethyst has 101). The
  // zapper is the receipt's `P` tag — older receipts only carry it inside the
  // embedded zap request (`description`). Many carry a memo ("love amethyst")
  // in the request content, which makes a zap a micro-review. The receipt's
  // `e` points at the APK's file-metadata event, not the release — ignored.
  it("parses zapper and memo, falling back to the embedded zap request", async () => {
    const { subject } = controllable();
    const addr = "32267:" + "b".repeat(64) + ":com.vitorpamplona.amethyst";
    const pending = fetchAppZaps(addr);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([9735]);
    expect(filter["#a"]).toEqual([addr]);
    expect(filter.search).toBe("include:spam");

    const zapper = "c".repeat(64);
    const other = "d".repeat(64);
    const request = (pubkey: string, content: string) => JSON.stringify({ kind: 9734, pubkey, content, tags: [] });
    subject.next(frame({ id: "z1", kind: 9735, pubkey: "e".repeat(64), created_at: 300, sig: "s", content: "", tags: [["a", addr], ["P", zapper], ["description", request(other, "love amethyst how it is")]] } as NostrEvent));
    subject.next(frame({ id: "z2", kind: 9735, pubkey: "e".repeat(64), created_at: 200, sig: "s", content: "", tags: [["a", addr], ["description", request(other, "")]] } as NostrEvent));
    subject.next(frame({ id: "z3", kind: 9735, pubkey: "e".repeat(64), created_at: 100, sig: "s", content: "", tags: [["a", addr], ["description", "not json"]] } as NostrEvent));
    subject.next(EOSE);

    expect(await pending).toEqual([
      { id: "z1", pubkey: zapper, memo: "love amethyst how it is", at: 300 },
      { id: "z2", pubkey: other, memo: "", at: 200 },
      { id: "z3", pubkey: null, memo: "", at: 100 },
    ]);
  });
});

describe("fetchAppEndorsementCounts", () => {
  // The numbers on an app card — reviews, zaps, and how many curated app
  // collections (kind 30267) feature it — as three NIP-45 COUNTs keyed by the
  // listing address. Counts, not pages: a card must not pay for events.
  it("counts reviews, zaps and collections for the address", async () => {
    const addr = "32267:" + "b".repeat(64) + ":com.vitorpamplona.amethyst";
    const byKind: Record<number, number> = { 1111: 14, 9735: 101, 30267: 46 };
    countMock.mockImplementation((filter: { kinds: number[] }) => of({ count: byKind[filter.kinds[0]] ?? 0 }));
    const res = await fetchAppEndorsementCounts(addr);
    expect(res).toEqual({ reviews: 14, zaps: 101, collections: 46 });
    const filters = countMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(filters).toHaveLength(3);
    expect(filters.every((f) => (f["#a"] as string[])[0] === addr && f.search === "include:spam")).toBe(true);
    expect(filters.map((f) => f.kinds as number[])).toEqual(expect.arrayContaining([[1111, 1], [9735], [30267]]));
  });
});

// The home feed: "what's happening now" means the last 24 hours, to the
// second — not the day-precision since:YYYY-MM-DD the query grammar offers.
describe("searchStream since", () => {
  it("passes an epoch `since` straight into the NIP-01 filter", async () => {
    searchStream("", { tab: "notes", pov: "nosfabrica", since: 1_760_000_000 }, () => {});
    await vi.waitFor(() => expect(reqMock).toHaveBeenCalledTimes(1));
    const filter = asked() as { since?: number; search: string };
    expect(filter.since).toBe(1_760_000_000);
    expect(filter.search).toBe("observer:" + "f".repeat(64));
  });
});

// Engagement the relay can count today (probed 2026-09-03): zaps (kind 9735)
// and replies (kinds 1 / 1111) that `e`-tag the note. Reactions and reposts
// aren't indexed — RELAY-ASKS. Two COUNTs per note, never a page of events.
describe("fetchNoteEngagement", () => {
  it("counts zaps and replies for a note", async () => {
    const id = "e".repeat(64);
    countMock.mockImplementation((filter: { kinds: number[] }) => of({ count: filter.kinds[0] === 9735 ? 12 : 4 }));
    const res = await fetchNoteEngagement(id);
    expect(res).toEqual({ zaps: 12, replies: 4 });
    const filters = countMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(filters).toHaveLength(2);
    expect(filters.every((f) => (f["#e"] as string[])[0] === id && f.search === "include:spam")).toBe(true);
    expect(filters.map((f) => f.kinds as number[])).toEqual(expect.arrayContaining([[9735], [1, 1111]]));
  });

  it("a failed COUNT reads as zero, never a rejection", async () => {
    countMock.mockImplementation(() => throwError(() => new Error("relay closed")));
    await expect(fetchNoteEngagement("e".repeat(64))).resolves.toEqual({ zaps: 0, replies: 0 });
  });
});

// The home feed's New releases band: one REQ for the listings behind the
// week's releases, keyed by address, newest version of each listing kept.
describe("fetchAppsByAddress", () => {
  it("asks for the listings by author + d in one REQ and keys them by address", async () => {
    const pk = "b".repeat(64);
    const listing = { id: "L1", kind: 32267, pubkey: pk, created_at: 5, content: "", sig: "s", tags: [["d", "net.primal.android"], ["name", "Primal"]] } as NostrEvent;
    const older = { ...listing, id: "L0", created_at: 1 } as NostrEvent;
    reqMock.mockImplementation(() => of(frame(older), frame(listing), { type: "EOSE", from: "wss://x", id: "s" } as ReqFrame));
    const map = await fetchAppsByAddress([`32267:${pk}:net.primal.android`, "junk"]);
    expect([...map.keys()]).toEqual([`32267:${pk}:net.primal.android`]);
    expect(map.get(`32267:${pk}:net.primal.android`)?.id).toBe("L1");
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter).toMatchObject({ kinds: [32267], authors: [pk], "#d": ["net.primal.android"], search: "include:spam" });
  });
});

describe("zapStoreUrl", () => {
  // Where you actually GET an app: Zap Store's page for the listing, keyed by
  // its naddr (probed: zapstore.dev/apps/<naddr> → 200). Zap Store verifies
  // the APK signature against the developer's Nostr key — the trust story.
  it("builds the Zap Store page for a listing", () => {
    const listing = { kind: 32267, pubkey: "b".repeat(64), tags: [["d", "net.primal.android"]] } as NostrEvent;
    const url = zapStoreUrl(listing)!;
    expect(url.startsWith("https://zapstore.dev/apps/naddr1")).toBe(true);
    const decoded = nip19.decode(url.slice("https://zapstore.dev/apps/".length));
    expect(decoded.type).toBe("naddr");
    expect((decoded.data as { identifier: string; kind: number }).identifier).toBe("net.primal.android");
    expect((decoded.data as { kind: number }).kind).toBe(32267);
  });

  it("is null for a listing without a d identifier", () => {
    expect(zapStoreUrl({ kind: 32267, pubkey: "b".repeat(64), tags: [] } as NostrEvent)).toBeNull();
  });
});

describe("fetchReleaseAsset", () => {
  // The APK lives in a kind-3063 asset event on the Zap Store relay (probed
  // live: Primal's carried url, m, size 160171130, version, x). One REQ by
  // the release's e-tag ids, parsed into the download link the page shows.
  it("resolves the release's asset — url, mime, size, version, hash", async () => {
    const subject = new Subject<ReqFrame>();
    zapReqMock.mockImplementation(() => subject.asObservable());
    const pending = fetchReleaseAsset(["asset-1"]);
    await tick();
    expect(zapReqMock).toHaveBeenCalledTimes(1);
    expect((zapReqMock.mock.calls[0][0] as { ids: string[] }).ids).toEqual(["asset-1"]);

    subject.next(frame({
      id: "asset-1", kind: 3063, pubkey: "b".repeat(64), created_at: 1, sig: "s", content: "",
      tags: [
        ["url", "https://github.com/PrimalHQ/primal-android-app/releases/download/3.5.25/primal-3.5.25.apk"],
        ["m", "application/vnd.android.package-archive"],
        ["size", "160171130"],
        ["version", "3.5.25"],
        ["x", "6f5b89be7abb"],
      ],
    } as NostrEvent));
    subject.next(EOSE);
    expect(await pending).toEqual({
      url: "https://github.com/PrimalHQ/primal-android-app/releases/download/3.5.25/primal-3.5.25.apk",
      mime: "application/vnd.android.package-archive",
      size: 160171130,
      version: "3.5.25",
      hash: "6f5b89be7abb",
    });
  });

  it("is null when the relay has no asset for those ids", async () => {
    const subject = new Subject<ReqFrame>();
    zapReqMock.mockImplementation(() => subject.asObservable());
    const pending = fetchReleaseAsset(["nope"]);
    await tick();
    subject.next(EOSE);
    expect(await pending).toBeNull();
  });

  it("asks for nothing when the release has no assets", async () => {
    expect(await fetchReleaseAsset([])).toBeNull();
    expect(zapReqMock).not.toHaveBeenCalled();
  });
});

describe("fetchSimilarApps", () => {
  // Category t-tags → sibling listings. Self excluded, replaceable dupes
  // collapsed by address, best tag-overlap first.
  const app = (pk: string, d: string, tags: string[], at = 1): NostrEvent =>
    ({ id: d, kind: 32267, pubkey: pk, tags: [["d", d], ["name", d], ...tags.map((t) => ["t", t])], content: "", created_at: at, sig: "s" }) as NostrEvent;

  it("returns tag-mates, deduped by address, without the app itself", async () => {
    const { subject } = controllable();
    const self = app("a".repeat(64), "net.primal.android", ["nostr-client"]);
    const pending = fetchSimilarApps(["nostr-client", "android"], appAddress(self));
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([32267]);
    expect(filter["#t"]).toEqual(["nostr-client", "android"]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame(self)); // the app's own listing — dropped
    subject.next(frame(app("c".repeat(64), "com.amethyst", ["nostr-client", "android"])));
    subject.next(frame(app("d".repeat(64), "com.wisp", ["android"])));
    subject.next(frame(app("c".repeat(64), "com.amethyst", ["nostr-client", "android"], 2))); // dupe addr
    subject.next(EOSE);
    const similar = await pending;
    // Two shared tags beat one; self and the duplicate are gone.
    expect(similar.map((e) => e.tags.find((t) => t[0] === "d")?.[1])).toEqual(["com.amethyst", "com.wisp"]);
  });
});

describe("fetchSimilarListings", () => {
  // A listing's categories → other sellers' listings in them. The seller's
  // own items have their own row on the page, so they stay out; edits of
  // one listing collapse to the newest; best category overlap first.
  const listing = (pk: string, d: string, tags: string[], at = 1): NostrEvent =>
    ({ id: `${d}-${at}`, kind: 30402, pubkey: pk, tags: [["d", d], ["title", d], ["price", "10", "USD"], ...tags.map((t) => ["t", t])], content: "", created_at: at, sig: "s" }) as NostrEvent;

  it("returns other sellers' listings sharing a category, best overlap first — never the listing itself or its seller's", async () => {
    const { subject } = controllable();
    const me = "a".repeat(64);
    const pending = fetchSimilarListings(["mugs", "bitcoin"], `30402:${me}:mug-1`, { excludePubkey: me });
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([30402]);
    expect(filter["#t"]).toEqual(["mugs", "bitcoin"]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame(listing(me, "mug-1", ["mugs", "bitcoin"]))); // the listing itself
    subject.next(frame(listing(me, "mug-2", ["mugs", "bitcoin"]))); // same seller — has its own row
    subject.next(frame(listing("c".repeat(64), "cup", ["mugs"])));
    subject.next(frame(listing("d".repeat(64), "stein", ["mugs", "bitcoin"])));
    subject.next(frame(listing("d".repeat(64), "stein", ["mugs", "bitcoin"], 2))); // a newer edit of the same listing
    subject.next(EOSE);
    const similar = await pending;
    expect(similar.map((e) => e.tags.find((t) => t[0] === "d")?.[1])).toEqual(["stein", "cup"]);
    expect(similar[0].created_at).toBe(2);
  });
});

describe("fetchCommentsByAddress", () => {
  // NIP-22 comments name their root by coordinate (#A / #a) or id (#E / #e).
  // The search relay indexes them but refuses a filter without a lens, so
  // every request rides include:spam. One comment, however many ways it was
  // tagged, is one comment.
  const comment = (id: string, tags: string[][]): NostrEvent =>
    ({ id: id.padEnd(64, "0"), kind: 1111, pubkey: "c".repeat(64), tags, content: `c-${id}`, created_at: 1, sig: "s" }) as NostrEvent;

  it("asks by coordinate and by id, under the lens, and dedupes", async () => {
    const { subject } = controllable();
    const addr = "30402:" + "b".repeat(64) + ":obscura-vpn";
    const rootId = "e".repeat(64);
    const pending = fetchCommentsByAddress(addr, rootId);
    await tick();
    const filters = reqMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(filters).toHaveLength(4);
    expect(filters.every((f) => f.search === "include:spam")).toBe(true);
    expect(filters.find((f) => f["#A"])?.["#A"]).toEqual([addr]);
    expect(filters.find((f) => f["#a"])?.["#a"]).toEqual([addr]);
    expect(filters.find((f) => f["#E"])?.["#E"]).toEqual([rootId]);
    expect(filters.find((f) => f["#e"])?.["#e"]).toEqual([rootId]);

    subject.next(frame(comment("q1", [["A", addr], ["K", "30402"]])));
    subject.next(frame(comment("q1", [["A", addr], ["K", "30402"]]))); // the same comment, arriving again
    subject.next(frame(comment("q2", [["E", rootId], ["e", rootId]])));
    subject.next(EOSE);
    const comments = await pending;
    expect(comments.map((c) => c.content).sort()).toEqual(["c-q1", "c-q2"]);
  });
});

describe("fetchGitStatuses", () => {
  // One request for a page of issues and patches: status events reference
  // their item by a root e-tag; the newest per item wins.
  const status = (id: string, kind: number, target: string, at: number): NostrEvent =>
    ({ id: id.padEnd(64, "0"), kind, pubkey: "m".repeat(64), tags: [["e", target, "wss://x", "root"], ["a", "30617:" + "a".repeat(64) + ":repo"]], content: "", created_at: at, sig: "s" }) as NostrEvent;

  it("asks for every status kind by the items' ids, under the lens, and keeps the newest per item", async () => {
    const { subject } = controllable();
    const issue = "1".repeat(64), patch = "2".repeat(64), quiet = "3".repeat(64);
    const pending = fetchGitStatuses([issue, patch, quiet]);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([1630, 1631, 1632, 1633]);
    expect(filter["#e"]).toEqual([issue, patch, quiet]);
    expect(filter.search).toBe("include:spam");

    subject.next(frame(status("s1", 1630, issue, 100)));
    subject.next(frame(status("s2", 1632, issue, 200))); // closed later — wins
    subject.next(frame(status("s3", 1631, patch, 150)));
    subject.next(frame(status("s0", 1630, issue, 50))); // an older reopen, ignored
    subject.next(EOSE);
    const statuses = await pending;
    expect(statuses.get(issue)).toEqual({ kind: 1632, at: 200 });
    expect(statuses.get(patch)).toEqual({ kind: 1631, at: 150 });
    expect(statuses.has(quiet)).toBe(false);
  });

  it("asks nothing for an empty page", async () => {
    controllable();
    expect((await fetchGitStatuses([])).size).toBe(0);
    expect(reqMock).not.toHaveBeenCalled();
  });
});

describe("fetchGitCommentCounts", () => {
  // NIP-22 comments on an issue name it in an uppercase E (root) tag; one
  // request per page tallies them per issue.
  const comment = (id: string, root: string): NostrEvent =>
    ({ id: id.padEnd(64, "0"), kind: 1111, pubkey: "c".repeat(64), tags: [["E", root, "", "root"], ["K", "1621"], ["e", root], ["k", "1621"]], content: "…", created_at: 1, sig: "s" }) as NostrEvent;

  it("asks by the issues' ids under the lens and counts comments per issue, once each", async () => {
    const { subject } = controllable();
    const a = "1".repeat(64), b = "2".repeat(64), quiet = "3".repeat(64);
    const pending = fetchGitCommentCounts([a, b, quiet]);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([1111]);
    expect(filter["#E"]).toEqual([a, b, quiet]);
    expect(filter.search).toBe("include:spam");
    subject.next(frame(comment("c1", a)));
    subject.next(frame(comment("c2", a)));
    subject.next(frame(comment("c2", a))); // the same comment again
    subject.next(frame(comment("c3", b)));
    subject.next(EOSE);
    const counts = await pending;
    expect(counts.get(a)).toBe(2);
    expect(counts.get(b)).toBe(1);
    expect(counts.get(quiet)).toBeUndefined();
  });
});

describe("fetchRepoForks", () => {
  // Announcements sharing an earliest unique commit are one codebase. The
  // relay answers a #r filter on the commit; the repo itself is left out and
  // one announcement per maintainer counts once.
  const repo = (pk: string, d: string, euc: string, at = 1): NostrEvent =>
    ({ id: `${d}-${at}`.padEnd(64, "0"), kind: 30617, pubkey: pk, tags: [["d", d], ["name", d], ["r", euc, "euc"]], content: "", created_at: at, sig: "s" }) as NostrEvent;

  it("returns the other announcements of the same codebase, deduped by maintainer", async () => {
    const { subject } = controllable();
    const euc = "2cfca0e64c2270bf7f1086c66db810c453fea187";
    const me = "a".repeat(64);
    const pending = fetchRepoForks(euc, `30617:${me}:gitnostr`);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([30617]);
    expect(filter["#r"]).toEqual([euc]);
    expect(filter.search).toBe("include:spam");
    subject.next(frame(repo(me, "gitnostr", euc)));           // itself
    subject.next(frame(repo("b".repeat(64), "gitnostr", euc, 1)));
    subject.next(frame(repo("b".repeat(64), "gitnostr", euc, 2))); // a newer edit by the same maintainer
    subject.next(frame(repo("c".repeat(64), "gitnostr-fork", euc)));
    subject.next(EOSE);
    const forks = await pending;
    expect(forks.map((f) => f.pubkey.slice(0, 1))).toEqual(["b", "c"]);
    expect(forks[0].created_at).toBe(2);
  });
});

describe("fetchRepoByAddress", () => {
  it("resolves a 30617 coordinate to its newest announcement, or null", async () => {
    const { subject } = controllable();
    const pk = "b".repeat(64);
    const pending = fetchRepoByAddress(`30617:${pk}:ngit`);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([30617]);
    expect(filter.authors).toEqual([pk]);
    expect(filter["#d"]).toEqual(["ngit"]);
    expect(filter.search).toBe("include:spam");
    subject.next(frame({ id: "1".repeat(64), kind: 30617, pubkey: pk, tags: [["d", "ngit"]], content: "", created_at: 1, sig: "s" } as NostrEvent));
    subject.next(frame({ id: "2".repeat(64), kind: 30617, pubkey: pk, tags: [["d", "ngit"]], content: "", created_at: 5, sig: "s" } as NostrEvent));
    subject.next(EOSE);
    expect((await pending)?.id).toBe("2".repeat(64));
    expect(await fetchRepoByAddress("not-a-coordinate")).toBeNull();
  });
});

describe("fetchEventRsvps", () => {
  // NIP-52 RSVPs (kind 31925) name their event by coordinate and carry a
  // status. One request per page; a person's newest answer is the one that
  // counts; "going" is the accepted ones, faces newest first.
  const rsvp = (id: string, addr: string, pk: string, status: string, at: number): NostrEvent =>
    ({ id: id.padEnd(64, "0"), kind: 31925, pubkey: pk, tags: [["a", addr], ["status", status], ["d", id]], content: "", created_at: at, sig: "s" }) as NostrEvent;

  it("counts who is going per event, a person's latest answer winning", async () => {
    const { subject } = controllable();
    const A = "31923:" + "a".repeat(64) + ":meetup", B = "31923:" + "b".repeat(64) + ":talk";
    const pending = fetchEventRsvps([A, B]);
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.kinds).toEqual([31925]);
    expect(filter["#a"]).toEqual([A, B]);
    expect(filter.search).toBe("include:spam");
    subject.next(frame(rsvp("r1", A, "1".repeat(64), "accepted", 100)));
    subject.next(frame(rsvp("r2", A, "2".repeat(64), "accepted", 110)));
    subject.next(frame(rsvp("r3", A, "2".repeat(64), "declined", 120))); // changed their mind
    subject.next(frame(rsvp("r4", A, "3".repeat(64), "tentative", 130)));
    subject.next(frame(rsvp("r5", B, "4".repeat(64), "accepted", 140)));
    subject.next(EOSE);
    const byEvent = await pending;
    expect(byEvent.get(A)).toEqual({ going: 1, faces: ["1".repeat(64)] });
    expect(byEvent.get(B)).toEqual({ going: 1, faces: ["4".repeat(64)] });
  });

  it("asks nothing for an empty page", async () => {
    controllable();
    expect((await fetchEventRsvps([])).size).toBe(0);
    expect(reqMock).not.toHaveBeenCalled();
  });
});

describe("fetchReleases", () => {
  // The app page's release story: Zap Store releases are kind 30063 whose
  // d-tag is "<app-d>@<version>" — the same publisher's releases for this
  // app, newest first. [0] is the "What's new" release; the rest are the
  // version history.
  it("returns the app's releases newest-first, ignoring other apps", async () => {
    const { subject } = controllable();
    const publisher = "b".repeat(64);
    const release = (d: string, at: number): NostrEvent =>
      ({ id: d, kind: 30063, pubkey: publisher, tags: [["d", d], ["e", `asset-${d}`]], content: `notes for ${d}`, created_at: at, sig: "s" }) as NostrEvent;

    const pending = fetchReleases("place.poster.app", publisher);
    await tick();
    const filter = reqMock.mock.calls[0][0] as { kinds: number[]; authors: string[]; search: string };
    expect(filter.kinds).toEqual([30063]);
    expect(filter.authors).toEqual([publisher]);
    expect(filter.search).toBe("include:spam"); // lens required, rank irrelevant

    subject.next(frame(release("place.poster.app@1.0.2132", 100)));
    subject.next(frame(release("other.app@9.9.9", 300))); // different app — ignored
    subject.next(frame(release("place.poster.app@1.0.2133", 200)));
    subject.next(EOSE);

    const releases = await pending;
    // Newest first; the release's content IS the "What's new" text, and its
    // e-tags are the asset events (the APK) the app page can resolve.
    expect(releases).toEqual([
      { version: "1.0.2133", at: 200, notes: "notes for place.poster.app@1.0.2133", assetIds: ["asset-place.poster.app@1.0.2133"] },
      { version: "1.0.2132", at: 100, notes: "notes for place.poster.app@1.0.2132", assetIds: ["asset-place.poster.app@1.0.2132"] },
    ]);
  });

  it("resolves empty when the app has no releases", async () => {
    const { subject } = controllable();
    const pending = fetchReleases("no.releases.app", "c".repeat(64));
    await tick();
    subject.next(EOSE);
    expect(await pending).toEqual([]);
  });
});

describe("kindsForTab", () => {
  it("maps every vertical and leaves Everything unconstrained", () => {
    expect(kindsForTab("people")).toEqual([0]);
    expect(kindsForTab("notes")).toEqual(TAB_KINDS.notes);
    expect(kindsForTab("everything")).toBeUndefined();
  });

  // Option A for NIPs in search: a spec (kind 30817, Markdown, addressable —
  // what the search relay already indexes) is read like an article.
  it("Articles asks for specs too", () => {
    expect(kindsForTab("articles")).toContain(30817);
  });

  // Benjamin (2026-09-23): for adoption, NIPs get their own entry under More
  // — the word people actually search — while staying labelled inside Articles.
  it("NIPs is a vertical of its own: specs alone", () => {
    expect(kindsForTab("nips")).toEqual([30817]);
  });

  // Vitor's split: "Code & git" mixed content types (and probing showed its
  // snippet kind was ~90% JSON junk). Apps = Zap Store listings; Repos = the
  // genuinely git-shaped kinds. Kind 1337 leaves the tabs entirely.
  it("splits the old code tab into Apps, Repos, Issues and PRs, junk kind dropped", () => {
    expect(kindsForTab("apps")).toEqual([32267]);
    expect(kindsForTab("repos")).toEqual([30617]);
    expect(kindsForTab("issues")).toEqual([1621]);
    expect(kindsForTab("prs")).toEqual([1617, 1618]);
    expect("code" in TAB_KINDS).toBe(false);
    expect(Object.values(TAB_KINDS).flat()).not.toContain(1337);
  });

  // Benjamin: "we should be able to filter by events also". NIP-52 calendar
  // events get their own vertical; Live keeps the NIP-53 streams. Kind 31924
  // (a calendar — a container of events) leaves the tabs; Everything still
  // reaches it.
  it("splits calendar events out of Live into their own Events vertical", () => {
    expect(kindsForTab("events")).toEqual([31922, 31923]);
    expect(kindsForTab("live")).toEqual([30311, 30312, 30313]);
  });
});