// @vitest-environment jsdom
/**
 * The relay-backed search seam. The relay is faked at the transport edge
 * (lib/searchRelay) with a controllable frame stream that reports its own
 * teardown — what these tests assert is behavior the UI depends on:
 * what goes on the wire, how snapshots arrive, and that cancellation is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

interface ReqFrame {
  type: "OPEN" | "EVENT" | "EOSE" | "CLOSED";
  from: string;
  id: string;
  event?: NostrEvent;
  reason?: string;
  filters?: unknown[];
}

const reqMock = vi.fn();
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({ req: (...args: unknown[]) => reqMock(...args) }),
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
  fetchNipPage,
  fetchPersonSets,
  fetchReleases,
  fetchRepoActivity,
  fetchSimilarApps,
  searchStream,
  suggestProfiles,
  kindsForTab,
  TAB_KINDS,
  type SearchSnapshot,
} from "./search";

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

beforeEach(() => vi.clearAllMocks());

describe("searchStream", () => {
  it("streams people hits incrementally, with the house observer on the wire", async () => {
    const { subject } = controllable();
    const snaps: SearchSnapshot[] = [];

    searchStream("jack", { tab: "people", pov: "nosfabrica" }, (s) => snaps.push(s));
    await tick(); // observer resolution is async — the REQ opens after it

    // The wire: query text passes through verbatim, observer appended, tab → kinds.
    expect(reqMock).toHaveBeenCalledTimes(1);
    const filter = reqMock.mock.calls[0][0] as { kinds?: number[]; search: string; limit: number };
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

describe("browse mode — no keyword at all", () => {
  // Benjamin's ask: "what if they just want to see all the live events?"
  // A keyword can only NARROW. An empty query with a kinds set is a valid
  // browse — the lens still rides the search field (probed live: 8 streams
  // in 423ms).
  it("streams a vertical with no text — just the lens on the wire", async () => {
    controllable();
    searchStream("", { tab: "live", pov: "nosfabrica" }, () => {});
    await tick();
    const filter = reqMock.mock.calls[0][0] as { kinds?: number[]; search: string };
    expect(filter.kinds).toEqual(TAB_KINDS.live);
    expect(filter.search).toBe(`observer:${HOUSE}`);
  });
});

describe("token lifting", () => {
  // The relay never sees from:/to:/#tag/since:/until: — they become NIP-01
  // filter fields (probed: sending them through matches nothing).
  it("lifts from: into the authors field before the wire", async () => {
    controllable();
    const alice = "a".repeat(64);
    searchStream(`gm from:${alice} #Nostr`, { tab: "notes", pov: "nosfabrica" }, () => {});
    await tick();
    const filter = reqMock.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.authors).toEqual([alice]);
    expect(filter["#t"]).toEqual(["nostr"]);
    expect(filter.search).toBe(`gm observer:${HOUSE}`);
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
    expect((reqMock.mock.calls[0][0] as { search: string }).search).toBe(`jack observer:${me}`);
  });

  it("never double-tags a query that already names a lens", async () => {
    controllable();
    searchStream("jack observer:" + "2".repeat(64), { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    searchStream("jack include:spam", { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    expect((reqMock.mock.calls[0][0] as { search: string }).search).toBe("jack observer:" + "2".repeat(64));
    expect((reqMock.mock.calls[1][0] as { search: string }).search).toBe("jack include:spam");
  });

  it("falls back to include:spam when no observer can be resolved", async () => {
    // The relay refuses lens-less reads outright — a missing house observer
    // must degrade to the unranked corpus, not a dead search box.
    houseMock.mockResolvedValueOnce(null);
    controllable();
    searchStream("jack", { tab: "people", pov: "nosfabrica" }, () => {});
    await tick();
    expect((reqMock.mock.calls[0][0] as { search: string }).search).toBe("jack include:spam");
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
});

/** Multi-REQ fake: every req() call gets its own subject; filters recorded. */
function multiReq() {
  const calls: { filter: Record<string, unknown>; subject: Subject<ReqFrame> }[] = [];
  reqMock.mockImplementation((filter: Record<string, unknown>) => {
    const subject = new Subject<ReqFrame>();
    calls.push({ filter, subject });
    return new Observable<ReqFrame>((subscriber) => {
      const inner = subject.subscribe(subscriber);
      return () => inner.unsubscribe();
    });
  });
  return calls;
}

describe("author hydration", () => {
  it("batches unknown authors into one kind-0 REQ and re-emits with profiles", async () => {
    vi.useFakeTimers();
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
    expect(filter.kinds).toEqual([1621, 1617]);
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
    expect(await pending).toEqual([
      { title: "Verified Human", exporters: 3 },
      { title: "AOS 2026 Participant", exporters: 1 },
    ]);
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

describe("fetchReleases", () => {
  // The app page's release story: Zap Store releases are kind 30063 whose
  // d-tag is "<app-d>@<version>" — the same publisher's releases for this
  // app, newest first. [0] is the "What's new" release; the rest are the
  // version history.
  it("returns the app's releases newest-first, ignoring other apps", async () => {
    const { subject } = controllable();
    const publisher = "b".repeat(64);
    const release = (d: string, at: number): NostrEvent =>
      ({ id: d, kind: 30063, pubkey: publisher, tags: [["d", d]], content: `notes for ${d}`, created_at: at, sig: "s" }) as NostrEvent;

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
    // Newest first; the release's content IS the "What's new" text.
    expect(releases).toEqual([
      { version: "1.0.2133", at: 200, notes: "notes for place.poster.app@1.0.2133" },
      { version: "1.0.2132", at: 100, notes: "notes for place.poster.app@1.0.2132" },
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

  // Vitor's split: "Code & git" mixed content types (and probing showed its
  // snippet kind was ~90% JSON junk). Apps = Zap Store listings; Repos = the
  // genuinely git-shaped kinds. Kind 1337 leaves the tabs entirely.
  it("splits the old code tab into Apps and Repos, junk kind dropped", () => {
    expect(kindsForTab("apps")).toEqual([32267]);
    expect(kindsForTab("repos")).toEqual([30617, 1617, 1618, 1621]);
    expect("code" in TAB_KINDS).toBe(false);
    expect(Object.values(TAB_KINDS).flat()).not.toContain(1337);
  });
});
