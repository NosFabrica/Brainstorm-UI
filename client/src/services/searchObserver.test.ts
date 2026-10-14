// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEVER, Observable, from, throwError } from "rxjs";
import type { Filter, NostrEvent } from "nostr-tools";

let held: NostrEvent[] = [];
const fromHeld = (filters: Filter[]) => from(held.filter((e) => filters.some((f) => f.kinds!.includes(e.kind))));
let respond: (filters: Filter[]) => Observable<NostrEvent> = fromHeld;
const requests: Filter[][] = [];
const relay = {
  url: "wss://search.example/",
  request: (filters: Filter[]) => {
    requests.push(filters);
    return respond(filters);
  },
};
let current: typeof relay | null = relay;
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => current }));

import { isSearchObserverOnRelay } from "./searchObserver";

const USER = "a".repeat(64);
const SOMEONE = "f".repeat(64);

const profile = (pubkey: string): NostrEvent => ({
  id: pubkey.split("").reverse().join(""),
  kind: 0,
  pubkey,
  created_at: 1,
  content: "{}",
  tags: [],
  sig: "s",
});

beforeEach(() => {
  current = relay;
  held = [];
  requests.length = 0;
  respond = fromHeld;
});

describe("isSearchObserverOnRelay", () => {
  it("is available when a profile comes back through the Account's lens", async () => {
    held = [profile(SOMEONE)];
    expect(await isSearchObserverOnRelay(USER)).toBe(true);
  });

  it("asks once, on the search relay, for one profile through the Account's observer lens", async () => {
    await isSearchObserverOnRelay(USER);
    expect(requests).toEqual([[{ kinds: [0], limit: 1, search: `observer:${USER}` }]]);
  });

  it("is not available when nothing comes back (no projected ranks yet)", async () => {
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
  });

  it("is not available when the relay errors", async () => {
    respond = () => throwError(() => new Error("closed"));
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
  });

  it("is not available when the relay never completes", async () => {
    vi.useFakeTimers();
    respond = () => NEVER;
    const answer = isSearchObserverOnRelay(USER);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await answer).toBe(false);
    vi.useRealTimers();
  });

  it("is not available without a search relay, and does not ask", async () => {
    current = null;
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
    expect(requests).toEqual([]);
  });
});
