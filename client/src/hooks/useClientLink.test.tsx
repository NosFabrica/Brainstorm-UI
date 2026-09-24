// @vitest-environment jsdom
/**
 * A component's view of a Primal link's resolution: idle for no ref, loading
 * while the lookup runs, done with the entity (or null) after — and, for a
 * ref the session already settled, done on the first render so a re-mounted
 * note never flashes a chip where a card was.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ClientLinkEntity } from "@/services/clientLinks";

const resolveMock = vi.fn<(ref: unknown) => Promise<ClientLinkEntity | null>>();
const peekMock = vi.fn<(ref: unknown) => ClientLinkEntity | null | undefined>(() => undefined);
vi.mock("@/services/clientLinks", () => ({ resolveClientLink: (r: unknown) => resolveMock(r), peekClientLink: (r: unknown) => peekMock(r) }));

import { useClientLink } from "./useClientLink";

const ref = { kind: "profile" as const, name: "alice" };
const entity: ClientLinkEntity = { kind: "profile", pubkey: "a".repeat(64), npub: "npub1x" };

beforeEach(() => {
  vi.clearAllMocks();
  peekMock.mockReturnValue(undefined);
});

describe("useClientLink", () => {
  it("is idle for no ref, and asks nothing", () => {
    const { result } = renderHook(() => useClientLink(null));
    expect(result.current).toEqual({ status: "idle", entity: null });
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("loads, then is done with the entity", async () => {
    resolveMock.mockResolvedValueOnce(entity);
    const { result } = renderHook(() => useClientLink(ref));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current).toEqual({ status: "done", entity }));
  });

  it("is done at once for a ref the session already settled", () => {
    peekMock.mockReturnValue(entity);
    const { result } = renderHook(() => useClientLink(ref));
    expect(result.current).toEqual({ status: "done", entity });
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("lets go when unmounted before the answer", async () => {
    let settle: (e: ClientLinkEntity | null) => void = () => {};
    resolveMock.mockReturnValueOnce(new Promise((r) => { settle = r; }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useClientLink(ref));
    unmount();
    settle(entity);
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
