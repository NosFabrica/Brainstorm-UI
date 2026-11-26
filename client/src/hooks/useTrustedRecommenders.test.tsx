// @vitest-environment jsdom
/**
 * The reactions behind "Recommended by N people you trust" are keyed on the
 * items: asked while the items still stream in, every arriving item re-keyed
 * the ask and sent a REQ. Asked once they have settled, they go out once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const reactionsAsk = vi.hoisted(() => vi.fn(async (_items: unknown[]) => []));
vi.mock("@/services/itemEngagement", async (importActual) => ({
  ...(await importActual<typeof import("@/services/itemEngagement")>()),
  readItemsReactions: (items: unknown[]) => reactionsAsk(items),
}));
vi.mock("@/hooks/useSearchPriority", () => ({ useSearchPriority: () => true }));
vi.mock("@/hooks/useMyFollows", () => ({ useMyFollows: () => ({ follows: new Set<string>(), signedIn: false }) }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => undefined }));

import { useTrustedRecommenders } from "./useTrustedRecommenders";

const item = (n: number) => ({ id: String(n).repeat(64), address: null });

beforeEach(() => reactionsAsk.mockClear());

describe("useTrustedRecommenders", () => {
  it("asks for the reactions once the items have settled, not once per arriving item", async () => {
    const { rerender } = renderHook(({ items, settled }) => useTrustedRecommenders(items, { settled }), {
      initialProps: { items: [item(1)], settled: false },
    });
    rerender({ items: [item(1), item(2)], settled: false });
    rerender({ items: [item(1), item(2), item(3)], settled: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(reactionsAsk).not.toHaveBeenCalled();

    rerender({ items: [item(1), item(2), item(3)], settled: true });
    await waitFor(() => expect(reactionsAsk).toHaveBeenCalledTimes(1));
    expect((reactionsAsk.mock.calls[0][0] as { id: string }[]).map((i) => i.id)).toEqual(
      [1, 2, 3].map((n) => item(n).id),
    );
  });
});
