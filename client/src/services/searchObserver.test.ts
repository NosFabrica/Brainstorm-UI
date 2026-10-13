// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, from, throwError } from "rxjs";
import type { Filter, NostrEvent } from "nostr-tools";

let held: NostrEvent[] = [];
let respond: (filters: Filter[]) => Observable<NostrEvent> = (filters) =>
  from(held.filter((e) => filters.some((f) => f.kinds!.includes(e.kind) && f.authors!.includes(e.pubkey))));
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
const TA = "b".repeat(64);
const OTHER_TA = "c".repeat(64);

const event = (kind: number, pubkey: string, tags: string[][] = [], created_at = 1): NostrEvent => ({
  id: `${kind}${pubkey}${created_at}`.padEnd(64, "0").slice(0, 64),
  kind,
  pubkey,
  created_at,
  content: "",
  tags,
  sig: "s",
});

const providerList = (rankService: string, created_at = 1) =>
  event(10040, USER, [["30382:rank", rankService, "wss://scores.example"]], created_at);
const card = () =>
  event(30382, TA, [
    ["d", "d".repeat(64)],
    ["rank", "90"],
  ]);

beforeEach(() => {
  current = relay;
  held = [];
  requests.length = 0;
  respond = (filters) =>
    from(held.filter((e) => filters.some((f) => f.kinds!.includes(e.kind) && f.authors!.includes(e.pubkey))));
});

describe("isSearchObserverOnRelay", () => {
  it("is available when the 10040 names the assistant for rank and the assistant has a card", async () => {
    held = [providerList(TA), card()];
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(true);
  });

  it("asks once, on the search relay, with both reads under include:spam and no observer", async () => {
    held = [providerList(TA), card()];
    await isSearchObserverOnRelay(USER, TA);
    expect(requests).toEqual([
      [
        { kinds: [10040], authors: [USER], limit: 1, search: "include:spam" },
        { kinds: [30382], authors: [TA], limit: 1, search: "include:spam" },
      ],
    ]);
  });

  it("is not available without the user's 10040", async () => {
    held = [card()];
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(false);
  });

  it("is not available when the 10040 names another service for rank", async () => {
    held = [providerList(OTHER_TA), card()];
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(false);
  });

  it("judges by the newest 10040", async () => {
    held = [providerList(TA, 1), providerList(OTHER_TA, 2), card()];
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(false);
    held = [providerList(OTHER_TA, 1), providerList(TA, 2), card()];
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(true);
  });

  it("is not available when the assistant has no cards", async () => {
    held = [providerList(TA)];
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(false);
  });

  it("is not available when the relay errors or times out", async () => {
    held = [providerList(TA), card()];
    respond = () => throwError(() => new Error("Timeout"));
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(false);
  });

  it("is not available without a search relay, and does not ask", async () => {
    current = null;
    expect(await isSearchObserverOnRelay(USER, TA)).toBe(false);
    expect(requests).toEqual([]);
  });
});
