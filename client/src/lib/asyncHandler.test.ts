import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "./asyncHandler";

describe("asyncHandler", () => {
  it("passes the event through and returns nothing", () => {
    const fn = vi.fn(async (_e: { id: number }) => "done");
    const handler = asyncHandler(fn);
    expect(handler({ id: 1 })).toBeUndefined();
    expect(fn).toHaveBeenCalledWith({ id: 1 });
  });
});
