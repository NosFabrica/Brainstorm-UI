import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

const USER = "a".repeat(64);
const TA = "b".repeat(64);

let user: { pubkey: string } | null = { pubkey: USER };
let taPubkey: string | null = TA;
let mywotLoading = false;
const onRelay = vi.fn<(pubkey: string) => Promise<boolean>>();

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => user }));
vi.mock("@/hooks/useHasMywot", () => ({
  useHasMywot: () => ({ hasMywot: !!taPubkey, taPubkey, known: !mywotLoading, isLoading: mywotLoading }),
}));
vi.mock("@/services/searchObserver", () => ({
  isSearchObserverOnRelay: (pk: string) => onRelay(pk),
}));

import { useIsSearchObserver } from "./useIsSearchObserver";

beforeEach(() => {
  user = { pubkey: USER };
  taPubkey = TA;
  mywotLoading = false;
  onRelay.mockReset();
});

describe("useIsSearchObserver", () => {
  it("asks the search relay about the user", async () => {
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
});
