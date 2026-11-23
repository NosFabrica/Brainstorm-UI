/**
 * The app's one query cache: what an API outage spoils, and what forgetting an
 * Account takes with it.
 */
import { describe, expect, it, vi } from "vitest";

const dropPersistedQueries = vi.fn();
vi.mock("@/lib/queryPersist", () => ({
  dropPersistedQueries: () => dropPersistedQueries(),
  startQueryPersistence: vi.fn(),
}));

import { queryClient, spoiledDuring } from "./queryClient";

describe("spoiledDuring", () => {
  it("is what failed, or was answered after the trouble began — not what was fine before it", async () => {
    const since = Date.now();
    queryClient.setQueryData(["before"], 1, { updatedAt: since - 60_000 });
    queryClient.setQueryData(["during"], 2, { updatedAt: since + 1000 });
    await queryClient
      .fetchQuery({
        queryKey: ["failed"],
        queryFn: async () => {
          throw new Error("502");
        },
      })
      .catch(() => undefined);
    const state = (key: string) => queryClient.getQueryCache().find({ queryKey: [key] })!;
    expect(spoiledDuring(state("before"), since)).toBe(false);
    expect(spoiledDuring(state("during"), since)).toBe(true);
    expect(spoiledDuring(state("failed"), since)).toBe(true);
    queryClient.clear();
  });
});

describe("clear", () => {
  it("forgets the copy kept on the device too — every sign-out and switch goes through here", () => {
    dropPersistedQueries.mockClear();
    queryClient.clear();
    expect(dropPersistedQueries).toHaveBeenCalledTimes(1);
  });
});
