// @vitest-environment node
/**
 * A reader's Dictionary from the tag hub: the community header, the copies
 * pointing at it, and the items under whichever governs — a copy of an item
 * counted as its original.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const USER = "1".repeat(64);
const TA = "2".repeat(64);
const COMMUNITY = `39998:${AVI}:github-accounts`;
const TA_COPY = `39998:${TA}:github-accounts`;

type Ev = { id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][] };
let n = 0;
const ev = (pubkey: string, kind: number, tags: string[][], created_at = 1_790_000_000): Ev => ({
  id: String(++n).padStart(64, "0"),
  pubkey,
  kind,
  created_at,
  content: "",
  tags,
});

const communityHeader = ev(AVI, 39998, [
  ["d", "github-accounts"],
  ["names", "GitHub Account", "GitHub Accounts"],
  ["required", "github-username"],
]);
const taCopy = ev(TA, 39998, [
  ["d", "github-accounts"],
  ["names", "GitHub Account", "GitHub Accounts"],
  ["required", "github-username"],
  ["b", COMMUNITY, "pointer"],
]);
const original = ev(AVI, 39999, [
  ["d", "vcavallo-1i6dn0p"],
  ["z", COMMUNITY],
  ["github-username", "vcavallo"],
]);

type F = Record<string, unknown>;
const fetchMock = vi.fn(async (_filter: F | F[], _relays: string[]) => [] as Ev[]);
/** Our index (the search relay): empty unless a test fills it — it lags the hub. */
const indexMock = vi.fn(async (_filters: F[], _timeout: number) => [] as Ev[]);
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: (f: F | F[], r: string[]) => fetchMock(f, r),
  fetchFromSearchRelayByFilters: (f: F[], t: number) => indexMock(f, t),
}));
vi.mock("@/config/tagging", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  tagRelays: () => ["wss://hub.example"],
}));
/** The house observer and the Assistant its 10040 names: none unless a test sets them. */
const houseMock = vi.fn(async () => null as string | null);
const trustSourceMock = vi.fn(async (_pk: string) => null as { taPubkey: string; relay: string } | null);
vi.mock("@/services/trustSource", () => ({
  resolveHouseObserver: () => houseMock(),
  resolveTrustSource: (pk: string) => trustSourceMock(pk),
}));

import { distinctItems, itemIdentity, loadConceptItems, loadDictionary, loadListItems } from "./dictionary";

/** Answers each filter the way a relay would, from a fixed corpus. */
/** One filter, as a relay matches it. */
const matches = (f: F, e: Ev) => {
  if (!(f.kinds as number[]).includes(e.kind)) return false;
  if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false;
  for (const key of ["#d", "#b", "#z", "#e"]) {
    const want = f[key] as string[] | undefined;
    if (want && !e.tags.some((t) => t[0] === key.slice(1) && want.includes(t[1]))) return false;
  }
  return true;
};
/** Every filter the app sent, flattened: one subscription may carry several. */
const sentFilters = () => fetchMock.mock.calls.flatMap(([f]) => (Array.isArray(f) ? f : [f]));

/** Answers each request the way a relay would — any of its filters — from a fixed corpus. */
function relayWith(corpus: Ev[]) {
  fetchMock.mockImplementation(async (f) => {
    const filters = Array.isArray(f) ? f : [f];
    return corpus.filter((e) => filters.some((one) => matches(one, e)));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
  indexMock.mockReset();
  indexMock.mockResolvedValue([]);
  houseMock.mockReset();
  houseMock.mockResolvedValue(null);
  trustSourceMock.mockReset();
  trustSourceMock.mockResolvedValue(null);
});

describe("loadDictionary", () => {
  it("with no copy, shows the community concept — not in the reader's Dictionary", async () => {
    relayWith([communityHeader, original]);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY]);
    expect(entry.resolved?.source).toBe("community");
    expect(entry.inDictionary).toBe(false);
    expect(entry.items.map((i) => i.id)).toEqual([original.id]);
  });

  it("the Assistant's copy puts it in the Dictionary, and governs", async () => {
    relayWith([communityHeader, taCopy, original]);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY]);
    expect(entry.inDictionary).toBe(true);
    expect(entry.resolved?.source).toBe("assistant");
    expect(entry.resolved?.governing.coordinate).toBe(TA_COPY);
    expect(entry.resolved?.agreement).toBe("agrees");
  });

  it("asks for copies by the reader and their Assistant, pointing at the concept", async () => {
    relayWith([]);
    await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY]);
    const copyFilter = sentFilters().find((f) => f["#b"]);
    expect(copyFilter).toMatchObject({ kinds: [39998], authors: [USER, TA], "#b": [COMMUNITY] });
    expect(fetchMock.mock.calls.every(([, relays]) => relays[0] === "wss://hub.example")).toBe(true);
  });

  it("an anonymous reader asks for no copies of their own", async () => {
    relayWith([communityHeader]);
    await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY]);
    expect(sentFilters().some((f) => f["#b"])).toBe(false);
  });

  it("counts a curation copy under the Assistant's header as its original", async () => {
    const copy = ev(
      TA,
      39999,
      [
        ["d", "copy-abc"],
        ["z", TA_COPY],
        ["github-username", "vcavallo"],
        ["q", `39999:${AVI}:vcavallo-1i6dn0p`, "wss://hub.example"],
        ["q", original.id, "wss://hub.example", AVI],
      ],
      1_790_000_100,
    );
    relayWith([communityHeader, taCopy, original, copy]);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY]);
    expect(entry.items).toHaveLength(1);
    expect(entry.items[0].id).toBe(copy.id); // the newer of the two
  });

  it("a hub that fails is an empty entry, not an error", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY]);
    expect(entry).toEqual({ communityCoordinate: COMMUNITY, resolved: null, inDictionary: false, items: [] });
  });

  it("ignores a header that isn't a list item under any z it asked for", async () => {
    const stray = ev(AVI, 39999, [
      ["d", "x"],
      ["z", "list"],
    ]); // a header in 39999 clothing
    relayWith([communityHeader, original, stray]);
    const [entry] = await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY]);
    expect(entry.items.map((i) => i.id)).toEqual([original.id]);
  });
});

describe("the house", () => {
  const HOUSE = "3".repeat(64);
  const HOUSE_TA = "4".repeat(64);
  const copyBy = (pubkey: string) =>
    ev(pubkey, 39998, [
      ["d", "github-accounts"],
      ["names", "GitHub Account", "GitHub Accounts"],
      ["required", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);

  it("a reader with no copy of their own, signed in or not, sees the house's", async () => {
    houseMock.mockResolvedValue(HOUSE);
    relayWith([communityHeader, copyBy(HOUSE)]);
    for (const reader of [
      { pubkey: null, taPubkey: null },
      { pubkey: USER, taPubkey: TA },
    ]) {
      const [entry] = await loadDictionary(reader, [COMMUNITY], undefined, { items: false });
      expect(entry.resolved?.source).toBe("house");
      expect(entry.resolved?.governing.coordinate).toBe(`39998:${HOUSE}:github-accounts`);
      expect(entry.inDictionary).toBe(false); // Brainstorm's, not theirs
    }
  });

  it("asks for the house's copies and its Assistant's, after the reader's", async () => {
    houseMock.mockResolvedValue(HOUSE);
    trustSourceMock.mockResolvedValue({ taPubkey: HOUSE_TA, relay: "wss://scores.example" });
    relayWith([]);
    await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(trustSourceMock).toHaveBeenCalledWith(HOUSE);
    expect(sentFilters().find((f) => f["#b"])).toMatchObject({ authors: [USER, TA, HOUSE, HOUSE_TA] });
  });

  it("the house's Assistant's copy is the house's", async () => {
    houseMock.mockResolvedValue(HOUSE);
    trustSourceMock.mockResolvedValue({ taPubkey: HOUSE_TA, relay: "wss://scores.example" });
    relayWith([communityHeader, copyBy(HOUSE_TA)]);
    const [entry] = await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY], undefined, { items: false });
    expect(entry.resolved?.source).toBe("house");
  });

  it("the reader's Assistant's copy comes before the house's", async () => {
    houseMock.mockResolvedValue(HOUSE);
    relayWith([communityHeader, copyBy(HOUSE), taCopy]);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(entry.resolved?.source).toBe("assistant");
  });

  it("no house found: the community's definition governs", async () => {
    houseMock.mockRejectedValue(new Error("offline"));
    relayWith([communityHeader]);
    const [entry] = await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY], undefined, { items: false });
    expect(entry.resolved?.source).toBe("community");
  });
});

describe("item identity", () => {
  it("an addressable item is its coordinate: a republish replaces it", () => {
    const v2 = { ...original, id: "f".repeat(64), created_at: original.created_at + 5 };
    expect(itemIdentity(v2)).toBe(itemIdentity(original));
    expect(distinctItems([original, v2]).map((i) => i.id)).toEqual([v2.id]);
  });

  it("a kind-9999 item is its id", () => {
    const regular = ev(AVI, 9999, [["z", COMMUNITY]]);
    expect(itemIdentity(regular)).toBe(regular.id);
  });
});

describe("the header read", () => {
  it("asks for the community header and the copies in one subscription", async () => {
    relayWith([communityHeader, taCopy]);
    await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toHaveLength(2);
  });

  it("a reader with no copies is read once — an empty copies answer is normal", async () => {
    relayWith([communityHeader]);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(entry.resolved?.source).toBe("community");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a read with no community header failed: retried once, and the copy is found", async () => {
    relayWith([communityHeader, taCopy]);
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(async () => []); // a relay at its subscription limit
    fetchMock.mockImplementation(answer);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(entry.resolved?.source).toBe("assistant");
  });

  it("retries only once", async () => {
    fetchMock.mockResolvedValue([]);
    await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("our index and the hub", () => {
  it("asks both at once and merges them", async () => {
    relayWith([taCopy]); // the hub has the copy…
    indexMock.mockResolvedValue([communityHeader]); // …the index has the community header
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(entry.resolved?.source).toBe("assistant");
    expect(entry.resolved?.community?.coordinate).toBe(COMMUNITY);
    expect(indexMock).toHaveBeenCalledTimes(1);
  });

  it("a copy the index hasn't caught up with still governs, from the hub", async () => {
    indexMock.mockResolvedValue([communityHeader]); // the index is days behind: no copy yet
    relayWith([communityHeader, taCopy]);
    const [entry] = await loadDictionary({ pubkey: USER, taPubkey: TA }, [COMMUNITY], undefined, { items: false });
    expect(entry.inDictionary).toBe(true);
  });

  it("the same event from both is one", async () => {
    indexMock.mockResolvedValue([communityHeader, original]);
    relayWith([communityHeader, original]);
    const [entry] = await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY]);
    expect(entry.items).toHaveLength(1);
  });
});

describe("at scale", () => {
  it("reads headers a hundred concepts at a time", async () => {
    const many = Array.from({ length: 150 }, (_, i) => `39998:${AVI}:concept-${i}`);
    relayWith([]);
    await loadDictionary({ pubkey: null, taPubkey: null }, many, undefined, { items: false });
    // Two chunks, each retried once for want of a community header (none exist here).
    const headerReads = fetchMock.mock.calls.filter(([f]) => JSON.stringify(f).includes('"#d"'));
    expect(headerReads.map(([f]) => ((f as F[])[0]["#d"] as string[]).length)).toEqual([100, 100, 50, 50]);
  });

  it("items: false reads no items; loadConceptItems reads only the headers it's given", async () => {
    relayWith([communityHeader, original]);
    await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY], undefined, { items: false });
    expect(sentFilters().some((f) => f["#z"])).toBe(false);
    const items = await loadConceptItems([COMMUNITY]);
    expect(items.map((i) => i.id)).toEqual([original.id]);
    expect(sentFilters().find((f) => f["#z"])).toMatchObject({ "#z": [COMMUNITY] });
  });
});

describe("loadListItems", () => {
  it("reads a 9998 list's items by its id, whether they name it with z or, lacking one, with e", async () => {
    const header = ev(AVI, 9998, [["names", "Thing", "Things"]]);
    const byZ = ev(USER, 9999, [
      ["z", header.id],
      ["name", "one"],
    ]);
    const byE = ev(USER, 9999, [
      ["e", header.id],
      ["name", "two"],
    ]);
    // A z elsewhere wins over an e here: it's filed under the other list.
    const elsewhere = ev(USER, 9999, [
      ["z", COMMUNITY],
      ["e", header.id],
    ]);
    relayWith([header, byZ, byE, elsewhere]);
    const { items, truncated } = await loadListItems([header.id]);
    expect(items.map((i) => i.id).sort()).toEqual([byZ.id, byE.id].sort());
    expect(truncated).toBe(false);
  });

  it("asks by e only for ids, never for a coordinate", async () => {
    relayWith([communityHeader, original]);
    await loadListItems([COMMUNITY]);
    expect(sentFilters().some((f) => f["#e"])).toBe(false);
  });

  it("says when a read reached its limit, so more may exist than were read", async () => {
    // 500 events that are versions of only 3 items: the count is small, the list isn't.
    relayWith(
      Array.from({ length: 500 }, (_, i) =>
        ev(
          AVI,
          39999,
          [
            ["d", `item-${i % 3}`],
            ["z", COMMUNITY],
          ],
          1_790_000_000 + i,
        ),
      ),
    );
    const { items, truncated } = await loadListItems([COMMUNITY]);
    expect(items).toHaveLength(3);
    expect(truncated).toBe(true);
  });
});
