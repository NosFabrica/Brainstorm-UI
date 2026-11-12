/**
 * The AI keys belong to one account: after a switch, the last account's keys must
 * never read as this one's, and an unlock asked for one account isn't the next one's.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const current = vi.hoisted(() => ({ account: undefined as { pubkey: string } | undefined, settled: true }));
const decrypt = vi.fn();
const silently = vi.fn();

vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => current.account }));
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: (_kind: number, pubkey: string | undefined) => ({
    event: pubkey ? { id: `event-${pubkey}`, pubkey, kind: 12000, content: "x", tags: [] } : undefined,
    settled: current.settled,
  }),
}));
vi.mock("@/accounts/signing", () => ({ canSignSilently: (...a: unknown[]) => silently(...a) }));
// The hook reads through `readAgentKeyTags`; these tests say what the decrypt gave.
vi.mock("@/services/agentKeys", () => ({
  readAgentKeyTags: async (...a: unknown[]) => {
    const tags = await decrypt(...a);
    return tags && typeof tags === "object" && "status" in tags
      ? tags
      : tags
        ? { status: "ready", tags }
        : { status: "unreadable" };
  },
  loadAgentKeys: vi.fn(),
}));

import { useAgentKeys } from "./useAgentKeys";

const A = { pubkey: "aa".repeat(32) };
const B = { pubkey: "bb".repeat(32) };

describe("useAgentKeys", () => {
  it("reads as loading after a switch until the new account's keys are decrypted", async () => {
    silently.mockResolvedValue(true);
    decrypt.mockImplementation(async (account: { pubkey: string }) =>
      account === A ? [["key", "sk-a-secret-0000", "https://a.example/v1"]] : new Promise(() => {}),
    );
    current.account = A;
    const { result, rerender } = renderHook(() => useAgentKeys());
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));

    current.account = B;
    rerender();
    expect(result.current.status).toBe("loading");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.status).toBe("loading");
    expect(JSON.stringify(result.current)).not.toContain("sk-a-secret");
  });

  it("doesn't carry one account's unlock to the next", async () => {
    silently.mockResolvedValue(false);
    decrypt.mockResolvedValue([]);
    current.account = A;
    const { result, rerender } = renderHook(() => useAgentKeys());
    await vi.waitFor(() => expect(result.current.status).toBe("locked"));
    act(() => result.current.reveal());
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));

    current.account = B;
    rerender();
    await vi.waitFor(() => expect(result.current.status).toBe("locked"));
  });

  it("decrypts once when the ask settles while the decrypt is out", async () => {
    // A reviewer's repro: the effect keyed on `settled`, so an EOSE landing while an
    // extension's prompt was open asked for a second decrypt.
    silently.mockResolvedValue(true);
    let finish: (tags: string[][]) => void = () => {};
    decrypt.mockReset().mockImplementation(() => new Promise((r) => (finish = r)));
    current.account = A;
    current.settled = false;
    const { result, rerender } = renderHook(() => useAgentKeys());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    current.settled = true;
    rerender();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => finish([]));
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));
    expect(decrypt).toHaveBeenCalledTimes(1);
    current.settled = true;
  });
});

describe("a signer failure (audit, 2026-11-12)", () => {
  it("is failed, with a retry, not unreadable", async () => {
    silently.mockResolvedValue(true);
    decrypt.mockReset().mockResolvedValueOnce({ status: "failed", error: "Your signer didn't answer." });
    current.account = { pubkey: "cc".repeat(32) };
    current.settled = true;
    const { result } = renderHook(() => useAgentKeys());
    await vi.waitFor(() => expect(result.current.status).toBe("failed"));
    decrypt.mockResolvedValueOnce([["key", "sk-x", "https://x.example/v1"]]);
    act(() => result.current.reveal());
    await vi.waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
