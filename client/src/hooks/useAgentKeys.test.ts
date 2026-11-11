/**
 * The AI keys belong to one account: after a switch, the last account's keys must
 * never read as this one's, and an unlock asked for one account isn't the next one's.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const current = vi.hoisted(() => ({ account: undefined as { pubkey: string } | undefined }));
const decrypt = vi.fn();
const silently = vi.fn();

vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => current.account }));
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: (_kind: number, pubkey: string | undefined) => ({
    event: pubkey ? { id: `event-${pubkey}`, pubkey, kind: 12000, content: "x", tags: [] } : undefined,
    settled: true,
  }),
}));
vi.mock("@/accounts/signing", () => ({ canSignSilently: (...a: unknown[]) => silently(...a) }));
vi.mock("@/services/agentKeys", () => ({
  decryptAgentKeyTags: (...a: unknown[]) => decrypt(...a),
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
});
