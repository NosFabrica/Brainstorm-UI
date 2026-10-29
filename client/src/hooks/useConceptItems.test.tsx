// @vitest-environment jsdom
/**
 * A list's items show as soon as the first relay answers (services/listReads onFirst): the books
 * list is 1–2 MB, and the slower relay can take three times as long. The merged list replaces them
 * when both have answered.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

const read = vi.hoisted(() => ({ finish: null as null | ((items: unknown[]) => void) }));
vi.mock("@/services/dictionary", () => ({
  listHeaders: () => ["39998:a:books"],
  loadListItems: async () => ({ items: [], truncated: false }),
  loadConceptItems: (_headers: string[], _relays: string[] | undefined, onFirst?: (items: unknown[]) => void) =>
    new Promise((resolve) => {
      onFirst?.([{ id: "fast" }]);
      read.finish = resolve;
    }),
}));

import { useConceptItems } from "./useConceptItems";

const entry = { communityCoordinate: "39998:a:books", resolved: null } as never;

describe("useConceptItems", () => {
  it("shows the first relay's items at once, then the merged list", async () => {
    const { result } = renderHook(() => useConceptItems(entry), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "fast" }]));
    read.finish!([{ id: "fast" }, { id: "slow" }]);
    await waitFor(() => expect(result.current.data).toEqual([{ id: "fast" }, { id: "slow" }]));
  });
});
