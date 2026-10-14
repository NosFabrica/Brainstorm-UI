import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

const USER = "a".repeat(64);
const TA = "b".repeat(64);

let user: { pubkey: string } | null = { pubkey: USER };
let taPubkey: string | null = TA;
let mywotLoading = false;
let listId: string | undefined = "list-1";
const onRelay = vi.fn<(pubkey: string) => Promise<boolean>>();

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => user }));
vi.mock("@/hooks/useHasMywot", () => ({
  useHasMywot: () => ({ hasMywot: !!taPubkey, taPubkey, known: !mywotLoading, isLoading: mywotLoading }),
}));
vi.mock("@/hooks/useTrustProviderStatus", () => ({
  useTrustProviderList: (pk: string | null) => ({ event: pk && listId ? { id: listId } : undefined }),
}));
vi.mock("@/services/searchObserver", () => ({
  isSearchObserverOnRelay: (pk: string) => onRelay(pk),
}));

import { useIsSearchObserver } from "./useIsSearchObserver";

beforeEach(() => {
  user = { pubkey: USER };
  taPubkey = TA;
  mywotLoading = false;
  listId = "list-1";
  onRelay.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIsSearchObserver", () => {
  it("asks the search relay through the Account's lens", async () => {
    onRelay.mockResolvedValue(true);
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isSearchObserver).toBe(true));
    expect(onRelay).toHaveBeenCalledWith(USER);
  });

  it("stays false while the relay cannot rank through them", async () => {
    onRelay.mockResolvedValue(false);
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSearchObserver).toBe(false);
  });

  it("does not ask without an assistant", () => {
    taPubkey = null;
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    expect(result.current).toEqual({ isSearchObserver: false, isLoading: false, known: true });
    expect(onRelay).not.toHaveBeenCalled();
  });

  it("is loading, not answered, while the assistant is still being asked", () => {
    taPubkey = null;
    mywotLoading = true;
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    expect(result.current).toEqual({ isSearchObserver: false, isLoading: true, known: false });
    expect(onRelay).not.toHaveBeenCalled();
  });

  it("does not ask when logged out", () => {
    user = null;
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    expect(result.current).toEqual({ isSearchObserver: false, isLoading: false, known: false });
    expect(onRelay).not.toHaveBeenCalled();
  });

  it("re-asks a 'no' every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onRelay.mockResolvedValue(false);
    renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    await waitFor(() => expect(onRelay).toHaveBeenCalledTimes(1));
    onRelay.mockResolvedValue(true);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(onRelay).toHaveBeenCalledTimes(2);
  });

  it("keeps a 'yes' without re-asking", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onRelay.mockResolvedValue(true);
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isSearchObserver).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(onRelay).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["changes", "list-2"],
    ["goes away", undefined],
  ])("re-asks a 'yes' when the Account's 10040 %s", async (_, next) => {
    onRelay.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isSearchObserver).toBe(true));
    onRelay.mockResolvedValue(false);
    listId = next;
    rerender();
    await waitFor(() => expect(result.current.isSearchObserver).toBe(false));
    expect(onRelay).toHaveBeenCalledTimes(2);
  });

  it("treats only a literal true as a 'yes'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onRelay.mockResolvedValue([] as unknown as boolean);
    const { result } = renderHook(() => useIsSearchObserver(), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.isSearchObserver).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(onRelay).toHaveBeenCalledTimes(2);
  });
});
