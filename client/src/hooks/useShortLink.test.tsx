/** The one place a shareable URL is decided, for any entity a code can stand for. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createShortUrl = vi.fn();
vi.mock("@/services/api", () => ({ apiClient: { createShortUrl: (...a: unknown[]) => createShortUrl(...a) } }));

import {
  eventShortLink,
  hashtagShortLink,
  mintShortLink,
  profileShortLink,
  tagShortLink,
  useMintShortLink,
  useShortLink,
} from "./useShortLink";

const NPUB = "npub17ngcvm59n9trc5kwam03rs5ts4n7gewxax53m7f2m4f464ls92cqr5qjta";
const HEX = "f4d1866e8599563c52ceeedf11c28b8567e465c6e9a91df92add535d57f02ab0";
const ORIGIN = window.location.origin;
const LONG = `${ORIGIN}/p/${NPUB}`;
const SHORT = `${ORIGIN}/s/AB3XK9QZ`;
const minted = { shortCode: "AB3XK9QZ", kind: "profile", key: HEX, relays: [], path: `/p/${NPUB}` };

let queryClient: QueryClient;
let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

beforeEach(() => {
  createShortUrl.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
});

describe("useShortLink", () => {
  it("returns the canonical url immediately, before minting resolves", () => {
    createShortUrl.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useShortLink({ ...profileShortLink(NPUB), enabled: true }), { wrapper });

    expect(result.current).toBe(LONG);
  });

  it("swaps in the short link once it arrives", async () => {
    createShortUrl.mockResolvedValue(minted);

    const { result } = renderHook(() => useShortLink({ ...profileShortLink(NPUB), enabled: true }), { wrapper });

    await waitFor(() => expect(result.current).toBe(SHORT));
  });

  it("keeps the canonical url when the shortener fails", async () => {
    createShortUrl.mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useShortLink({ ...profileShortLink(NPUB), enabled: true }), { wrapper });

    await waitFor(() => expect(createShortUrl).toHaveBeenCalled());
    expect(result.current).toBe(LONG);
  });

  it("does not mint until the sheet is open", () => {
    renderHook(() => useShortLink({ ...profileShortLink(NPUB), enabled: false }), { wrapper });

    expect(createShortUrl).not.toHaveBeenCalled();
  });

  it("asks for a profile by the hex pubkey, not the npub", async () => {
    createShortUrl.mockResolvedValue(minted);

    renderHook(() => useShortLink({ ...profileShortLink(NPUB), enabled: true }), { wrapper });

    await waitFor(() => expect(createShortUrl).toHaveBeenCalledWith({ kind: "profile", key: HEX, relays: [] }));
  });

  it("caps relay hints at what the server will store", async () => {
    createShortUrl.mockResolvedValue(minted);
    const many = Array.from({ length: 10 }, (_, i) => `wss://r${i}.example`);

    renderHook(() => useShortLink({ ...profileShortLink(NPUB, many), enabled: true }), { wrapper });

    await waitFor(() => expect(createShortUrl).toHaveBeenCalled());
    expect(createShortUrl.mock.calls[0][0].relays).toHaveLength(7);
  });

  it("returns nothing to share when there is no npub", () => {
    const { result } = renderHook(() => useShortLink({ ...profileShortLink(""), enabled: true }), { wrapper });

    expect(result.current).toBe("");
    expect(createShortUrl).not.toHaveBeenCalled();
  });

  it("shortens any kind, falling back to the url the caller is on", async () => {
    createShortUrl.mockResolvedValue({ ...minted, kind: "hashtag", key: "nostr", path: "/t/nostr" });

    const { result } = renderHook(
      () => useShortLink({ kind: "hashtag", key: "nostr", canonicalUrl: `${ORIGIN}/t/nostr`, enabled: true }),
      { wrapper },
    );

    expect(result.current).toBe(`${ORIGIN}/t/nostr`);
    await waitFor(() => expect(result.current).toBe(SHORT));
    expect(createShortUrl).toHaveBeenCalledWith({ kind: "hashtag", key: "nostr", relays: [] });
  });
});

describe("mintShortLink", () => {
  it("resolves to the short url", async () => {
    createShortUrl.mockResolvedValue(minted);

    await expect(mintShortLink(queryClient, { kind: "profile", key: HEX })).resolves.toBe(SHORT);
  });

  it("shares the hook's cache, so a sheet opened after a tap doesn't mint again", async () => {
    createShortUrl.mockResolvedValue(minted);
    await mintShortLink(queryClient, { kind: "profile", key: HEX });

    const { result } = renderHook(() => useShortLink({ ...profileShortLink(NPUB), enabled: true }), { wrapper });

    expect(result.current).toBe(SHORT);
    expect(createShortUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects when the shortener fails, leaving the fallback to the caller", async () => {
    createShortUrl.mockRejectedValue(new Error("429"));

    await expect(mintShortLink(queryClient, { kind: "profile", key: HEX })).rejects.toThrow();
  });
});

describe("useMintShortLink", () => {
  it("mints the entity on call, through the hook's cache", async () => {
    createShortUrl.mockResolvedValue(minted);
    const { result } = renderHook(() => useMintShortLink(profileShortLink(NPUB)), { wrapper });

    expect(createShortUrl).not.toHaveBeenCalled();
    await expect(result.current()).resolves.toBe(SHORT);
    await expect(result.current()).resolves.toBe(SHORT);
    expect(createShortUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects without asking when there is nothing to shorten", async () => {
    const { result } = renderHook(() => useMintShortLink(profileShortLink("")), { wrapper });

    await expect(result.current()).rejects.toThrow();
    expect(createShortUrl).not.toHaveBeenCalled();
  });
});

describe("eventShortLink", () => {
  const ID = "A".repeat(64);
  const PK = "B".repeat(64);
  const note = { id: ID, pubkey: PK, kind: 1, tags: [] as string[][] };

  it("keys a note by its lowercase id, with no hints when the page found it on its own", () => {
    expect(eventShortLink(note)).toEqual({ kind: "event", key: "a".repeat(64), relays: [] });
  });

  it("keeps the hints the page loaded it from, never the search relay", () => {
    const relays = ["wss://relay.example", "wss://search.brainstorm.world/", "wss://relay.example/"];
    expect(eventShortLink(note, { relays }).relays).toEqual(["wss://relay.example/"]);
  });

  it("keys an article, and a kind linked by address, by its coordinate", () => {
    for (const kind of [30023, 31922, 34236]) {
      expect(eventShortLink({ ...note, kind, tags: [["d", "a:b"]] })).toEqual({
        kind: "address",
        key: `${kind}:${"b".repeat(64)}:a:b`,
        relays: [],
      });
    }
  });

  it("keys any addressable kind by its coordinate, however the page was reached", () => {
    const listing = { ...note, kind: 30402, tags: [["d", "x"]] };
    expect(eventShortLink(listing)).toEqual({ kind: "address", key: `30402:${"b".repeat(64)}:x`, relays: [] });
  });

  it("keys an addressable kind without a d tag by its id", () => {
    expect(eventShortLink({ ...note, kind: 30402 }).kind).toBe("event");
  });

  it("sends the tag hub as a DList item's hints, since its id doesn't say it is one", () => {
    for (const kind of [9998, 9999]) {
      expect(eventShortLink({ ...note, kind }, { relays: ["wss://relay.example"] }).relays).toEqual([
        "wss://dcosl.brainstorm.world/",
        "wss://relay.example/",
      ]);
    }
  });

  it("sends no hints for an addressable DList item: the server adds the tag hub", () => {
    for (const kind of [39998, 39999]) {
      expect(eventShortLink({ ...note, kind, tags: [["d", "x"]] }, { relays: ["wss://relay.example"] })).toEqual({
        kind: "address",
        key: `${kind}:${"b".repeat(64)}:x`,
        relays: [],
      });
    }
  });
});

describe("profileShortLink", () => {
  it("never hints the search relay", () => {
    expect(profileShortLink(NPUB, ["WSS://search.brainstorm.world", "wss://relay.example"]).relays).toEqual([
      "wss://relay.example/",
    ]);
  });
});

describe("hashtagShortLink", () => {
  it("keys the word as the server stores it, linking its encoded page", () => {
    expect(hashtagShortLink("c++")).toEqual({ kind: "hashtag", key: "c++", canonicalUrl: `${ORIGIN}/t/c%2B%2B` });
    expect(hashtagShortLink(" #MempoolMadness").key).toBe("mempoolmadness");
  });

  it("has no key for a plain word of up to 12 characters, which reads better as its page", () => {
    expect(hashtagShortLink("#Bitcoin").key).toBe("");
    expect(hashtagShortLink("championship").key).toBe("");
    expect(hashtagShortLink("bitcoin-2026").key).toBe("");
    expect(hashtagShortLink("international").key).toBe("international");
    expect(hashtagShortLink("日本").key).toBe("日本");
  });

  it("has no key for a word longer than the server takes", () => {
    expect(hashtagShortLink("x".repeat(64)).key).toBe("x".repeat(64));
    expect(hashtagShortLink("x".repeat(65)).key).toBe("");
  });
});

describe("tagShortLink", () => {
  it("keys a tag by its author hex and slug, linking its page", () => {
    expect(tagShortLink(HEX.toUpperCase(), "a b/c")).toEqual({
      kind: "tag",
      key: `${HEX}:a b/c`,
      canonicalUrl: `${ORIGIN}/tags/${NPUB}/a%20b%2Fc`,
    });
  });

  it("has no key without an author or slug", () => {
    expect(tagShortLink("", "x").key).toBe("");
    expect(tagShortLink(HEX, "").key).toBe("");
  });
});
