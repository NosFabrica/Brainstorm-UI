/**
 * The one place a shareable profile URL is decided.
 *
 * Issue: .scratch/shorturl/issues/04-share-short-link.md
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { queryWrapper } from "@/test/utils";

const createShortUrl = vi.fn();
vi.mock("@/services/api", () => ({ apiClient: { createShortUrl: (...a: unknown[]) => createShortUrl(...a) } }));

import { useShareUrl } from "./useShareUrl";

const NPUB = "npub17ngcvm59n9trc5kwam03rs5ts4n7gewxax53m7f2m4f464ls92cqr5qjta";
const HEX = "f4d1866e8599563c52ceeedf11c28b8567e465c6e9a91df92add535d57f02ab0";
const LONG = `${window.location.origin}/p/${NPUB}`;

let wrapper: ReturnType<typeof queryWrapper>;

beforeEach(() => {
  createShortUrl.mockReset();
  wrapper = queryWrapper();
});

describe("useShareUrl", () => {
  it("returns the canonical url immediately, before minting resolves", () => {
    createShortUrl.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useShareUrl({ npub: NPUB, enabled: true }), { wrapper });

    expect(result.current).toBe(LONG);
  });

  it("swaps in the short link once it arrives", async () => {
    createShortUrl.mockResolvedValue("AB3XK9QZ");

    const { result } = renderHook(() => useShareUrl({ npub: NPUB, enabled: true }), { wrapper });

    await waitFor(() =>
      expect(result.current).toBe(`${window.location.origin}/s/AB3XK9QZ`),
    );
  });

  it("keeps the canonical url when the shortener fails", async () => {
    createShortUrl.mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useShareUrl({ npub: NPUB, enabled: true }), { wrapper });

    await waitFor(() => expect(createShortUrl).toHaveBeenCalled());
    expect(result.current).toBe(LONG);
  });

  it("does not mint until the sheet is open", () => {
    renderHook(() => useShareUrl({ npub: NPUB, enabled: false }), { wrapper });

    expect(createShortUrl).not.toHaveBeenCalled();
  });

  it("asks with the hex pubkey the API expects, not the npub", async () => {
    createShortUrl.mockResolvedValue("AB3XK9QZ");

    renderHook(() => useShareUrl({ npub: NPUB, enabled: true }), { wrapper });

    await waitFor(() => expect(createShortUrl).toHaveBeenCalledWith(HEX, []));
  });

  it("caps relay hints at what the server will store", async () => {
    createShortUrl.mockResolvedValue("AB3XK9QZ");
    const many = Array.from({ length: 10 }, (_, i) => `wss://r${i}.example`);

    renderHook(() => useShareUrl({ npub: NPUB, relays: many, enabled: true }), { wrapper });

    await waitFor(() => expect(createShortUrl).toHaveBeenCalled());
    expect(createShortUrl.mock.calls[0][1]).toHaveLength(7);
  });

  it("returns nothing to share when there is no npub", () => {
    const { result } = renderHook(() => useShareUrl({ npub: "", enabled: true }), { wrapper });

    expect(result.current).toBe("");
    expect(createShortUrl).not.toHaveBeenCalled();
  });
});
