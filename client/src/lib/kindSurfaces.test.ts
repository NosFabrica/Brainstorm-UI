/**
 * One case per row of the registry: an event the row is for, the hero its page
 * draws and the shape a quote of it is drawn as — and what the table promises
 * of itself: rows in the page's order, and no kind quoted by two rows.
 */
import { describe, expect, it } from "vitest";
import { KIND_SURFACES, embedShapeOf, heroFor, pageSurfaceOf } from "@/lib/kindSurfaces";
import { DLIST_REGISTRY } from "@/lib/dlists";
import type { MinimalEvent } from "@/lib/noteRefs";

const PK = "4".repeat(64);
const ALICE = "a".repeat(64);
const NOTE = "1".repeat(64);
let n = 0;
const ev = (kind: number, tags: string[][] = [], content = "", pubkey = PK): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey,
  created_at: 1_790_000_000,
  tags,
  content,
});

const [, LIST_AUTHOR, LIST_D] = DLIST_REGISTRY[0].coordinate.split(":");

/** Per row: an event it is for; the hero its page draws (when it has one); its quote's shape (when it has one). */
const ROWS: Record<string, { event: MinimalEvent; asDictionaryItem?: boolean; hero?: string; embed?: string }> = {
  dlist: { event: ev(39998, [["d", LIST_D]], "", LIST_AUTHOR), hero: "dlist" },
  "dlist-header": { event: ev(9998, [["d", "things"]]), hero: "dlist-header" },
  "dictionary-item": { event: ev(39999, [["d", "x"]]), asDictionaryItem: true, hero: "dictionary-item" },
  "git-item": { event: ev(1621, [["subject", "It breaks"]]), hero: "git-item" },
  live: {
    event: ev(30311, [
      ["d", "s"],
      ["title", "Live coding"],
    ]),
    hero: "live",
    embed: "live",
  },
  meeting: {
    event: ev(30312, [
      ["d", "r"],
      ["room", "Main hall"],
    ]),
    hero: "meeting",
  },
  "relay-list": { event: ev(10002, [["r", "wss://r.example"]]), hero: "relay-list", embed: "relay-list" },
  "user-status": { event: ev(30315, [["d", "general"]], "Working"), hero: "user-status", embed: "status" },
  "web-bookmark": {
    event: ev(39701, [
      ["d", "example.com/a"],
      ["title", "A page"],
    ]),
    hero: "web-bookmark",
  },
  app: {
    event: ev(32267, [
      ["d", "com.x"],
      ["name", "X"],
    ]),
    hero: "app",
    embed: "app",
  },
  file: {
    event: ev(1063, [
      ["url", "https://img.example/f.png"],
      ["m", "image/png"],
    ]),
    hero: "file",
    embed: "picture",
  },
  repo: {
    event: ev(30617, [
      ["d", "ngit"],
      ["name", "ngit"],
    ]),
    hero: "repo",
    embed: "repo",
  },
  "git-status": { event: ev(1631, [["e", NOTE, "", "root"]]), hero: "git-status", embed: "git-status" },
  "repo-state": {
    event: ev(30618, [
      ["d", "ngit"],
      ["HEAD", "ref: refs/heads/main"],
      ["refs/heads/main", "a".repeat(40)],
    ]),
    hero: "repo-state",
    embed: "repo-state",
  },
  "git-reply": { event: ev(1622, [["e", NOTE, "", "root"]], "LGTM"), hero: "git-reply" },
  release: {
    event: ev(30063, [
      ["d", "app@1"],
      ["e", NOTE],
    ]),
    hero: "release",
    embed: "release",
  },
  "follow-set": {
    event: ev(30000, [
      ["d", "f"],
      ["p", ALICE],
    ]),
    hero: "follow-set",
    embed: "people-list",
  },
  "trusted-list": {
    event: ev(30392, [
      ["d", "t"],
      ["p", ALICE],
    ]),
    hero: "trusted-list",
  },
  designation: { event: ev(10040, [["30382:rank", ALICE, "wss://r.example"]]), hero: "designation" },
  "item-list": { event: ev(10003, [["e", NOTE]]), hero: "item-list", embed: "item-list" },
  audio: {
    event: ev(1222, [["imeta", "url https://a.example/v.m4a", "m audio/mp4"]], "https://a.example/v.m4a"),
    hero: "audio",
  },
  track: {
    event: ev(31337, [
      ["d", "t"],
      ["title", "A song"],
      ["imeta", "url https://a.example/s.mp3", "m audio/mpeg"],
    ]),
    embed: "track",
  },
  voice: {
    event: ev(1222, [["imeta", "url https://a.example/v.m4a", "m audio/mp4"]], "https://a.example/v.m4a"),
    embed: "audio",
  },
  listing: {
    event: ev(30402, [
      ["d", "bike"],
      ["title", "A bike"],
      ["price", "15", "EUR"],
    ]),
    hero: "listing",
    embed: "listing",
  },
  calendar: {
    event: ev(31922, [
      ["d", "c"],
      ["title", "Meetup"],
      ["start", "2026-12-01"],
    ]),
    hero: "calendar",
    embed: "calendar-event",
  },
  activity: {
    event: ev(
      7,
      [
        ["e", NOTE],
        ["p", ALICE],
      ],
      "+",
    ),
    hero: "activity",
    embed: "activity",
  },
  thing: {
    event: ev(34550, [
      ["d", "cooking"],
      ["name", "Cooking"],
    ]),
    hero: "thing",
    embed: "thing",
  },
  video: {
    event: ev(21, [
      ["title", "Clip"],
      ["imeta", "url https://v.example/c.mp4", "m video/mp4"],
    ]),
    hero: "video",
    embed: "video",
  },
  highlight: {
    event: ev(9802, [["r", "https://source.example/essay", "source"]], "the words they marked"),
    hero: "highlight",
    embed: "highlight",
  },
  note: { event: ev(1, [], "Hello"), hero: "note" },
  article: {
    event: ev(
      30023,
      [
        ["d", "essay"],
        ["title", "An essay"],
      ],
      "Words.",
    ),
    embed: "article",
  },
  picture: { event: ev(20, [["imeta", "url https://img.example/s.jpg", "m image/jpeg"]], "Morning"), embed: "picture" },
};

describe("every row of the registry", () => {
  it("has a case here, and a case is a row", () => {
    expect(Object.keys(ROWS).sort()).toEqual(KIND_SURFACES.map((row) => row.id).sort());
  });

  it.each(KIND_SURFACES.map((row) => [row.id, row] as const))("%s draws its event as itself", (id, row) => {
    const c = ROWS[id];
    if (row.page) {
      expect(c.hero).toBe(row.page.hero);
      expect(heroFor(c.event, !!c.asDictionaryItem)).toBe(row.page.hero);
    } else expect(c.hero).toBeUndefined();
    if (row.embed) {
      expect(row.embed.kinds.has(c.event.kind)).toBe(true);
      expect(embedShapeOf(c.event)).toBe(c.embed);
    } else expect(c.embed).toBeUndefined();
  });
});

describe("the table", () => {
  it("quotes each kind by one row", () => {
    const seen = new Map<number, string>();
    for (const row of KIND_SURFACES)
      for (const kind of row.embed?.kinds ?? []) {
        expect(seen.get(kind), `kind ${kind}`).toBeUndefined();
        seen.set(kind, row.id);
      }
  });

  it("names each hero once", () => {
    const heroes = KIND_SURFACES.flatMap((row) => (row.page ? [row.page.hero] : []));
    expect(new Set(heroes).size).toBe(heroes.length);
  });

  it("reads the page's rows in order: a registry list header is its list before it is a header", () => {
    expect(heroFor(ROWS.dlist.event, false)).toBe("dlist");
    // A header outranks the page's Dictionary reading.
    expect(heroFor(ev(9998, [["d", "x"]]), true)).toBe("dlist-header");
  });

  it("falls through a row whose event cannot fill it", () => {
    // A space with no name to say is not a meeting; a listing with no title is not for sale.
    expect(heroFor(ev(30312, [["d", "room-slug"]]), false)).toBeNull();
    expect(heroFor(ev(30402, [["d", "x"]]), false)).toBeNull();
    expect(embedShapeOf(ev(30311, [["d", "x"]]))).toBe("note");
  });

  it("quotes an unknown kind, and a blanked one, as its words", () => {
    expect(embedShapeOf(ev(4242, [], "words"))).toBe("note");
    expect(
      embedShapeOf(
        ev(
          30023,
          [
            ["d", "x"],
            ["title", "An essay"],
          ],
          "Words.",
        ),
      ),
    ).toBe("article");
    expect(
      embedShapeOf(
        ev(
          30023,
          [
            ["d", "x"],
            ["deleted", "true"],
          ],
          "",
        ),
      ),
    ).toBe("note");
  });
});

describe("the generic page", () => {
  it("asks for the refs of the words it draws, and none for a structural card", () => {
    expect(pageSurfaceOf(ev(4242, [], "words"), { asDictionaryItem: false, hasMedia: false })).toMatchObject({
      hero: null,
      dedicated: false,
      structural: false,
      collectsRefs: true,
    });
    expect(pageSurfaceOf(ev(4242, [], ""), { asDictionaryItem: false, hasMedia: false })).toMatchObject({
      structural: true,
      collectsRefs: false,
    });
    expect(pageSurfaceOf(ev(4242, [], ""), { asDictionaryItem: false, hasMedia: true }).structural).toBe(false);
  });

  it("keeps an activity's page to its hero", () => {
    expect(pageSurfaceOf(ROWS.activity.event, { asDictionaryItem: false, hasMedia: false })).toMatchObject({
      threads: false,
      conversation: false,
      collectsRefs: false,
    });
  });
});
