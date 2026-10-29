/**
 * The items of several lists a search's words find (searchListItems): one REQ
 * with a filter per list, each with its own cap, through the search's lens; the
 * events sorted back to their lists by `z`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { nip19, type NostrEvent } from "nostr-tools";

const HOUSE = "f".repeat(64);
const ME = "1".repeat(64);
const reqMock = vi.fn();
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => ({ req: (...args: unknown[]) => reqMock(...args) }) }));
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => Promise.resolve(HOUSE) }));

import { searchListItems } from "./search";

const PLACES = `39998:${"a".repeat(64)}:places`;
const MY_PLACES = `39998:${ME}:places`;
const EVENTS = `39998:${"a".repeat(64)}:events`;

type Frame = { type: string; event?: NostrEvent };
let relay: Subject<Frame>;
let seq = 0;
const item = (z: string): NostrEvent =>
  ({
    id: (++seq).toString(16).padStart(64, "0"),
    pubkey: ME,
    kind: 39999,
    created_at: 1,
    tags: [["z", z]],
    content: "",
    sig: "",
  }) as NostrEvent;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  relay = new Subject<Frame>();
  reqMock.mockReset().mockImplementation(() => relay);
});

describe("searchListItems", () => {
  it("asks every list in one REQ, each capped on its own, through the house's lens", async () => {
    const pending = searchListItems(
      `fork coin from:${nip19.npubEncode(ME)}`,
      [
        { key: PLACES, headers: [PLACES, MY_PLACES] },
        { key: EVENTS, headers: [EVENTS] },
      ],
      { pov: "nosfabrica", limit: 2 },
    );
    await tick();
    expect(reqMock).toHaveBeenCalledTimes(1);
    const filters = reqMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(filters.map((f) => f["#z"])).toEqual([[PLACES, MY_PLACES], [EVENTS]]);
    for (const f of filters) {
      expect(f).toMatchObject({ kinds: [39999, 9999], limit: 2, authors: [ME], search: `fork coin observer:${HOUSE}` });
    }
    relay.next({ type: "EOSE" });
    await pending;
  });

  it("asks a list named alone for its items through the lens, without the words", async () => {
    const pending = searchListItems(
      "books sort:recent",
      [
        { key: PLACES, headers: [PLACES] },
        { key: EVENTS, headers: [EVENTS], whole: true },
      ],
      { pov: "nosfabrica" },
    );
    await tick();
    const filters = reqMock.mock.calls[0][0] as { search: string }[];
    expect(filters.map((f) => f.search)).toEqual([`books sort:recent observer:${HOUSE}`, `observer:${HOUSE}`]);
    relay.next({ type: "EOSE" });
    await pending;
  });

  it("sorts what comes back to its lists by `z`, and says which list the cap stopped", async () => {
    const pending = searchListItems(
      "austin",
      [
        { key: PLACES, headers: [PLACES, MY_PLACES] },
        { key: EVENTS, headers: [EVENTS] },
      ],
      { pov: "mywot", userPubkey: ME, limit: 2 },
    );
    await tick();
    expect((reqMock.mock.calls[0][0] as { search: string }[])[0].search).toBe(`austin observer:${ME}`);
    const [a, b, c] = [item(PLACES), item(MY_PLACES), item(EVENTS)];
    for (const event of [a, b, c, a]) relay.next({ type: "EVENT", event });
    relay.next({ type: "EOSE" });
    const answers = await pending;
    expect(answers.get(PLACES)).toEqual({ events: [a, b], full: true });
    expect(answers.get(EVENTS)).toEqual({ events: [c], full: false });
  });

  it("asks nothing of a query with no words, a hashtag, or a kind that isn't a list item", async () => {
    const lists = [{ key: PLACES, headers: [PLACES] }];
    for (const query of ["", "sort:recent", "#bitcoin austin", "kind:1 austin"]) {
      const answers = await searchListItems(query, lists, { pov: "nosfabrica" });
      expect(answers.get(PLACES)).toEqual({ events: [], full: false });
    }
    expect(reqMock).not.toHaveBeenCalled();
  });

  it("settles with what arrived when the relay closes or fails", async () => {
    const pending = searchListItems("austin", [{ key: EVENTS, headers: [EVENTS] }], { pov: "nosfabrica" });
    await tick();
    const c = item(EVENTS);
    relay.next({ type: "EVENT", event: c });
    relay.error(new Error("closed"));
    expect((await pending).get(EVENTS)!.events).toEqual([c]);
  });
});
