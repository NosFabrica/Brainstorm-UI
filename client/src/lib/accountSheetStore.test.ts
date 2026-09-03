import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
  closeAccountSheet,
  openAccountSheet,
  setAccountSheet,
  useAccountSheetOpen,
} from "./accountSheetStore";

describe("the mobile account sheet", () => {
  it("starts closed and follows whoever opens it", () => {
    const { result } = renderHook(() => useAccountSheetOpen());
    expect(result.current).toBe(false);

    act(() => openAccountSheet());
    expect(result.current).toBe(true);

    act(() => closeAccountSheet());
    expect(result.current).toBe(false);
  });

  it("renders the current state on mount, not one frame later", () => {
    act(() => setAccountSheet(true));
    const { result } = renderHook(() => useAccountSheetOpen());
    expect(result.current).toBe(true);
    act(() => setAccountSheet(false));
  });
});
