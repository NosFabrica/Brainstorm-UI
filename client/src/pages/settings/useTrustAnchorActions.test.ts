// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TrustAnchorPublishResult } from "@/services/trustAnchor";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const publish = vi.fn();
const deactivate = vi.fn();
vi.mock("@/services/trustAnchor", () => ({
  publishBrainstormTrustAnchor: (...args: unknown[]) => publish(...args),
  deactivateBrainstormTrustAnchor: (...args: unknown[]) => deactivate(...args),
}));

import { useTrustAnchorActions } from "./useTrustAnchorActions";

const ME = "a".repeat(64);
const TA = "b".repeat(64);

beforeEach(() => {
  vi.useFakeTimers();
  toast.mockClear();
  publish.mockReset();
  deactivate.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useTrustAnchorActions", () => {
  it("won't republish without an account or before the service key loads", async () => {
    const { result, rerender } = renderHook(({ me, ta }) => useTrustAnchorActions(me, ta), {
      initialProps: { me: undefined as string | undefined, ta: TA as string | null },
    });
    await act(() => result.current.handleRepublishNip85());
    expect(result.current.republishState).toBe("error");
    expect(result.current.republishError).toBe("Not logged in.");

    rerender({ me: ME, ta: null });
    await act(() => result.current.handleRepublishNip85());
    expect(result.current.republishError).toMatch(/Service key not available/);
    expect(publish).not.toHaveBeenCalled();
  });

  it("goes signing → publishing → success, then back to idle", async () => {
    publish.mockImplementation(async (_me: string, _ta: string, onPhase: (p: string) => void) => {
      onPhase("publishing");
      return { status: "success" } satisfies TrustAnchorPublishResult;
    });
    const { result } = renderHook(() => useTrustAnchorActions(ME, TA));
    await act(() => result.current.handleRepublishNip85());
    expect(publish).toHaveBeenCalledWith(ME, TA, expect.any(Function));
    expect(result.current.republishState).toBe("success");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "NIP-85 event updated" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.republishState).toBe("idle");
  });

  it("keeps a failed publish's retry, which resends without signing again", async () => {
    const retry = vi.fn(async (): Promise<TrustAnchorPublishResult> => ({ status: "success" }));
    publish.mockResolvedValue({ status: "error", message: "no relay took it", retry });
    const { result } = renderHook(() => useTrustAnchorActions(ME, TA));
    await act(() => result.current.handleRepublishNip85());
    expect(result.current.republishState).toBe("error");
    expect(result.current.republishError).toBe("no relay took it");
    expect(result.current.republishRetry).toBe(retry);

    await act(() => result.current.retryRepublish());
    expect(retry).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(result.current.republishState).toBe("success");
  });

  it("returns to idle on a declined signature, saying why only when there is a reason", async () => {
    publish.mockResolvedValue({ status: "cancelled", unlockDeclined: true, message: null });
    const { result } = renderHook(() => useTrustAnchorActions(ME, TA));
    await act(() => result.current.handleRepublishNip85());
    expect(result.current.republishState).toBe("idle");
    expect(toast).not.toHaveBeenCalled();

    deactivate.mockResolvedValue({ status: "cancelled", unlockDeclined: false, message: "signer offline" });
    await act(() => result.current.handleDeactivateNip85());
    expect(result.current.deactivateState).toBe("idle");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't sign", description: "signer offline" }),
    );
  });

  it("reloads the page two seconds after a deactivation lands", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    deactivate.mockResolvedValue({ status: "success" });
    const { result } = renderHook(() => useTrustAnchorActions(ME, TA));
    await act(() => result.current.handleDeactivateNip85());
    expect(deactivate).toHaveBeenCalledWith(ME, TA, expect.any(Function));
    expect(result.current.deactivateState).toBe("success");
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.deactivateState).toBe("idle");
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
