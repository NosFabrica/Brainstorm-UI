// @vitest-environment jsdom
/**
 * The relay-backed search seam. The relay is faked at the transport edge
 * (lib/searchRelay) with a controllable frame stream that reports its own
 * teardown — what these tests assert is behavior the UI depends on:
 * what goes on the wire, how snapshots arrive, and that cancellation is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject, of } from "rxjs";
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
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({
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
  fetchPersonVouches,
  fetchVouchReplies,
  fetchNipPage,
  fetchPersonSets,
  fetchReleases,
  fetchRepoActivity,
  fetchRepoCounts,
  fetchReleaseAsset,
  zapStoreUrl,
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
  it("counts issues and patches for the address, through the lens", async () => {
    const addr = "30617:" + "b".repeat(64) + ":ngit";
    countMock.mockImplementation((filter: { kinds: number[] }) =>
      of({ count: filter.kinds[0] === 1621 ? 3 : 1 }),
    );
    const res = await fetchRepoCounts(addr);
    expect(res).toEqual({ issues: 3, patches: 1 });
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

  // Vitor's split: "Code & git" mixed content types (and probing showed its
  // snippet kind was ~90% JSON junk). Apps = Zap Store listings; Repos = the
  // genuinely git-shaped kinds. Kind 1337 leaves the tabs entirely.
  it("splits the old code tab into Apps and Repos, junk kind dropped", () => {
    expect(kindsForTab("apps")).toEqual([32267]);
    expect(kindsForTab("repos")).toEqual([30617, 1617, 1618, 1621]);
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