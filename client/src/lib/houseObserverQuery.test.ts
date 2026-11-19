import { describe, expect, it, vi } from "vitest";

const houseMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => houseMock() }));

import { houseObserverQuery } from "./houseObserverQuery";

describe("houseObserverQuery", () => {
  it("answers the house observer", async () => {
    houseMock.mockResolvedValueOnce("f".repeat(64));
    await expect(houseObserverQuery.queryFn()).resolves.toBe("f".repeat(64));
  });

  it("fails when the house can't be found, so react-query retries instead of keeping a null for the visit", async () => {
    houseMock.mockResolvedValueOnce(null);
    await expect(houseObserverQuery.queryFn()).rejects.toThrow();
  });
});
