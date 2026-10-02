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

const fetchMock = vi.fn(async (_filter: Record<string, unknown>, _relays: string[]) => [] as Ev[]);
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: (f: Record<string, unknown>, r: string[]) => fetchMock(f, r),
}));
vi.mock("@/config/tagging", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  tagRelays: () => ["wss://hub.example"],
}));

import { distinctItems, itemIdentity, loadDictionary } from "./dictionary";

/** Answers each filter the way a relay would, from a fixed corpus. */
function relayWith(corpus: Ev[]) {
  fetchMock.mockImplementation(async (f) => {
    const kinds = f.kinds as number[];
    return corpus.filter((e) => {
      if (!kinds.includes(e.kind)) return false;
      if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false;
      for (const key of ["#d", "#b", "#z"]) {
        const want = f[key] as string[] | undefined;
        if (want && !e.tags.some((t) => t[0] === key.slice(1) && want.includes(t[1]))) return false;
      }
      return true;
    });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
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
    const copyFilter = fetchMock.mock.calls.map(([f]) => f).find((f) => f["#b"]);
    expect(copyFilter).toMatchObject({ kinds: [39998], authors: [USER, TA], "#b": [COMMUNITY] });
    expect(fetchMock.mock.calls.every(([, relays]) => relays[0] === "wss://hub.example")).toBe(true);
  });

  it("an anonymous reader asks for no copies of their own", async () => {
    relayWith([communityHeader]);
    await loadDictionary({ pubkey: null, taPubkey: null }, [COMMUNITY]);
    expect(fetchMock.mock.calls.some(([f]) => f["#b"])).toBe(false);
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
