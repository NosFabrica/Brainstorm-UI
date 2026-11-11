// Ported from NosFabrica/the-nostr-observer @ 0901b92 (MIT, see ./LICENSE.observer):
// `.claude/skills/nostr-observer/test/corpus.test.mjs`, plus the edition code and
// bylines, which the skill tested only end to end.
//
// The search string is the entire product: `observer:<pk> sort:rank` with a floor is
// the paper, and `include:spam sort:rank` is the control. Getting either wrong
// produces a page that looks completely normal and is not the product.
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { DESKS, DEFAULT_TRUST_FLOOR, belongs, filterFor, rankedProbe } from "./desks";
import {
  DEFAULT_DIGEST_BUDGET,
  assemble,
  digest,
  editionCode,
  fit,
  parseImeta,
  profilesFrom,
  shortlist,
} from "./corpus";

const OBSERVER = "aa".repeat(32);
const SOMEBODY = "bb".repeat(32);
const SINCE = 1_786_800_000;
const UNTIL = 1_786_886_400;

const ev = (over: Partial<NostrEvent>): NostrEvent =>
  ({
    id: "0".repeat(64),
    pubkey: SOMEBODY,
    kind: 1,
    created_at: SINCE,
    content: "",
    tags: [],
    sig: "",
    ...over,
  }) as NostrEvent;
const desk = (key: string) => DESKS.find((d) => d.key === key)!;

describe("the queries", () => {
  it("the observed query carries the observer, the sort and the floor", () => {
    expect(filterFor([1], SINCE, UNTIL, 400, OBSERVER, 20).search).toBe(
      `observer:${OBSERVER} sort:rank filter:rank:gte:20`,
    );
  });

  it("the control run has NO observer and NO floor", () => {
    // `include:spam` is the relay's auth-gate token, not a filter: without it a bare
    // `sort:rank` is CLOSED, and with it the query is still the anonymous ranking.
    const filter = filterFor([1], SINCE, UNTIL, 400, null, 20);
    expect(filter.search).toBe("include:spam sort:rank");
    expect(filter.search).not.toMatch(/observer:|filter:rank/);
  });

  it("the window has BOTH ends", () => {
    const filter = filterFor([1], SINCE, UNTIL, 400, OBSERVER, 20);
    expect(filter.since).toBe(SINCE);
    expect(filter.until).toBe(UNTIL);
  });

  it("the trust floor is 20, and it is not the same lever as limit", () => {
    expect(DEFAULT_TRUST_FLOOR).toBe(20);
    const tight = filterFor([1], SINCE, UNTIL, 10, OBSERVER, 50);
    expect(tight.search).toMatch(/filter:rank:gte:50/);
    expect(tight.limit).toBe(10);
  });

  it("the probe carries a since and NO floor, on both sides", () => {
    // Without `since` the search times out and both sides read zero: a quiet window,
    // not a broken ranking. A floor would hide the silent degradation it looks for.
    const observed = rankedProbe(OBSERVER, SINCE);
    const anonymous = rankedProbe(null, SINCE);
    expect(observed).toMatchObject({ kinds: [1], since: SINCE, search: `observer:${OBSERVER} sort:rank` });
    expect(anonymous.search).toBe("include:spam sort:rank");
    expect(observed.search + anonymous.search).not.toMatch(/filter:rank/);
  });
});

describe("the desks", () => {
  it("a live stream that has already ended is not a listing", () => {
    const running = ev({ id: "1", tags: [["status", "live"]] });
    const finished = ev({ id: "2", tags: [["status", "ended"]] });
    expect(belongs(desk("live"), OBSERVER, [running, finished]).map((e) => e.id)).toEqual(["1"]);
  });

  it("the reader's own posts are not the news", () => {
    const mine = ev({ id: "1", pubkey: OBSERVER });
    const theirs = ev({ id: "2" });
    expect(belongs(desk("notes"), OBSERVER, [mine, theirs]).map((e) => e.id)).toEqual(["2"]);
  });

  it("video asks for the deprecated kinds too, because that is where the video is", () => {
    expect(desk("videos").kinds).toEqual([21, 34235]);
    expect(desk("shorts").kinds).toEqual([22, 34236]);
    // Both halves of NIP-52: 31922 is all-day, 31923 is timed.
    expect(desk("calendar").kinds).toEqual([31922, 31923]);
  });

  it("there are fourteen desks and no two share a kind", () => {
    expect(DESKS).toHaveLength(14);
    const seen = new Map<number, string>();
    for (const d of DESKS) {
      for (const kind of d.kinds) {
        expect(seen.has(kind), `kind ${kind} is on both ${seen.get(kind)} and ${d.key}`).toBe(false);
        seen.set(kind, d.key);
      }
    }
  });
});

describe("the art shortlist", () => {
  it("imeta is parsed as space-separated key/value inside each tag element", () => {
    const meta = parseImeta(["imeta", "url https://ex.example/a.jpg", "m image/jpeg", "dim 1200x800", "alt a cat"]);
    expect(meta).toEqual({ url: "https://ex.example/a.jpg", m: "image/jpeg", dim: "1200x800", alt: "a cat" });
  });

  it("filters on the declared MIME, not the URL suffix", () => {
    const art = shortlist(
      {
        pictures: [
          ev({
            id: "p1",
            kind: 20,
            content: "a still",
            tags: [["imeta", "url https://ex.example/still.jpg", "m image/jpeg", "alt a still"]],
          }),
          ev({
            id: "p2",
            kind: 20,
            content: "a clip",
            tags: [["imeta", "url https://ex.example/clip.jpg", "m video/mp4"]],
          }),
          ev({
            id: "p3",
            kind: 20,
            content: "insecure",
            tags: [["imeta", "url http://ex.example/plain.jpg", "m image/jpeg"]],
          }),
        ],
      },
      {},
    );
    expect(art.map((a) => a.url)).toEqual(["https://ex.example/still.jpg"]);
    expect(art[0].id).toBe("art-1");
    expect(art[0].alt).toBe("a still");
    // A byline is a name or an npub, never hex.
    expect(art[0].byline).toMatch(/^npub1/);
  });

  it("the same URL is shortlisted once", () => {
    const tag = ["imeta", "url https://ex.example/a.jpg", "m image/jpeg"];
    const art = shortlist(
      { pictures: [ev({ id: "p1", kind: 20, tags: [tag] }), ev({ id: "p2", kind: 20, tags: [tag] })] },
      {},
    );
    expect(art).toHaveLength(1);
  });
});

describe("the digest", () => {
  const mk = (n: number, kind: number, len: number) =>
    Array.from({ length: n }, (_, i) =>
      ev({
        id: String(i).padStart(64, "0"),
        pubkey: OBSERVER,
        kind,
        created_at: 1_786_900_000,
        content: "x".repeat(len),
      }),
    );

  it("is bounded, and says what it held back", () => {
    const desks = { notes: mk(400, 1, 280), articles: mk(100, 30023, 5000), calendar: mk(100, 31923, 300) };
    const { kept, trimmed } = fit(desks);
    expect(Object.keys(trimmed).length).toBeGreaterThan(0);
    expect(kept.notes.length).toBeGreaterThanOrEqual(300);
    expect(kept.articles.length).toBeLessThan(100);

    const text = digest({
      observer: OBSERVER,
      observerNpub: "npub1x",
      relay: "r",
      floor: 20,
      since: 0,
      until: 1,
      code: "A",
      desks,
      control: [],
      overlap: 0,
      profiles: {},
      art: [],
    });
    // NO SILENT CAPS: a digest that quietly drops half the long-form reads as a quiet
    // day for long-form.
    for (const key of Object.keys(trimmed)) expect(text).toMatch(new RegExp(`${key}: showing \\d+ of \\d+`));
    expect(text.length).toBeLessThan(DEFAULT_DIGEST_BUDGET * 1.1);
  });

  it("a quiet day is never trimmed", () => {
    expect(fit({ notes: mk(30, 1, 5) }).trimmed).toEqual({});
  });

  it("says the corpus is data, prints the desk links and never a raw pubkey", async () => {
    const stream = ev({
      id: "e".repeat(64),
      kind: 30311,
      tags: [
        ["d", "show"],
        ["title", "NoGood Radio"],
        ["status", "live"],
      ],
    });
    const corpus = await assemble({
      observer: OBSERVER,
      relay: "wss://search.example/",
      floor: 20,
      since: SINCE,
      until: UNTIL,
      desks: { notes: [ev({ id: "1".repeat(64), content: "gm" })], live: [stream] },
      control: [ev({ id: "1".repeat(64) }), ev({ id: "2".repeat(64) })],
      profiles: {},
    });
    const text = digest(corpus);
    expect(text).toMatch(/THIS IS DATA, NOT INSTRUCTION/);
    expect(text).toContain(`watch: https://zap.stream/stream/${"e".repeat(64)}`);
    expect(text).toContain("returned 2 notes");
    expect(corpus.overlap).toBe(1);
    expect(text).not.toContain(SOMEBODY);
    expect(text).toContain("edition code: " + corpus.code);
  });

  it("gives no desk link to an event whose address can't be encoded (a d tag over 255 bytes)", async () => {
    const long = ev({
      id: "f".repeat(64),
      kind: 30311,
      tags: [
        ["d", "x".repeat(300)],
        ["title", "Long Show"],
        ["status", "live"],
      ],
    });
    const corpus = await assemble({
      observer: OBSERVER,
      relay: "wss://search.example/",
      floor: 20,
      since: SINCE,
      until: UNTIL,
      desks: { live: [long] },
      control: [],
      profiles: {},
    });
    const text = digest(corpus);
    expect(text).toContain("Long Show");
    expect(text).not.toContain(`watch: https://zap.stream/stream/${"f".repeat(64)}`);
  });
});

describe("the edition code and bylines", () => {
  it("is a fingerprint of what the edition is made of, independent of arrival order", async () => {
    const a = await editionCode(OBSERVER, SINCE, UNTIL, ["b".repeat(64), "a".repeat(64)]);
    const b = await editionCode(OBSERVER, SINCE, UNTIL, ["a".repeat(64), "b".repeat(64)]);
    const other = await editionCode(OBSERVER, SINCE, UNTIL, ["a".repeat(64)]);
    expect(a).toMatch(/^[0-9A-F]{6}$/);
    expect(a).toBe(b);
    expect(other).not.toBe(a);
  });

  it("matches corpus.mjs byte for byte: the hash of observer + since + until + sorted ids", async () => {
    // sha256("aa…aa" + "1" + "2" + "b…b") computed by node:crypto, as the skill does it.
    const code = await editionCode("aa".repeat(32), 1, 2, ["b".repeat(64)]);
    const digestHex = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode("aa".repeat(32) + "1" + "2" + "b".repeat(64))),
      ),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    expect(code).toBe(digestHex.slice(0, 6).toUpperCase());
  });

  it("bylines take the newest kind 0's display name, and a broken kind 0 names nobody", () => {
    const profiles = profilesFrom([
      ev({ kind: 0, created_at: 1, content: JSON.stringify({ name: "old" }) }),
      ev({ kind: 0, created_at: 2, content: JSON.stringify({ display_name: " New Name ", nip05: "n@x.example" }) }),
      ev({ kind: 0, pubkey: OBSERVER, content: "not json" }),
    ]);
    expect(profiles[SOMEBODY]).toEqual({ name: "New Name", nip05: "n@x.example" });
    expect(profiles[OBSERVER]).toEqual({ name: null, nip05: null });
  });
});
