// @vitest-environment jsdom
/** Applying a tag puts it in the picker and search catalogues without refetching them. */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PickerTag, TagSummary } from "@/services/tags";

const VIEWER = "e5272de914bd" + "1".repeat(52);
const OTHER = "2aa46e1f18c8" + "2".repeat(52);

const h = vi.hoisted(() => ({ fetchTagIndex: vi.fn(), fetchPickerTags: vi.fn() }));

vi.mock("@/services/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tags")>()),
  applyTagToProfile: async () => ({ published: [] }),
  fetchTagIndex: h.fetchTagIndex,
  fetchPickerTags: h.fetchPickerTags,
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: VIEWER }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));

import { useApplyTag, tagIndexKey } from "./useTags";

const listed: TagSummary = {
  key: `${OTHER}|podcaster`,
  authorPubkey: OTHER,
  slug: "podcaster",
  name: "Podcaster",
  people: 4,
  vouches: 3,
  sharesName: 1,
  unverified: false,
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData([...tagIndexKey, VIEWER, "house"], [listed]);
  queryClient.setQueryData(["tag-picker-options", VIEWER, "house"], [{ ...listed, band: "profile" }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useApplyTag(VIEWER), { wrapper });
  const index = () => queryClient.getQueryData<TagSummary[]>([...tagIndexKey, VIEWER, "house"])!;
  const picker = () => queryClient.getQueryData<PickerTag[]>(["tag-picker-options", VIEWER, "house"])!;
  return { result, index, picker };
}

describe("applying a tag", () => {
  it("offers a freshly minted tag in both catalogues, without a refetch", async () => {
    const { result, index, picker } = setup();
    await act(() => result.current.mutateAsync({ tag: { name: "Musician" } }));

    const minted = { key: `${VIEWER}|musician`, name: "Musician", unverified: false };
    await waitFor(() => expect(index()).toEqual([listed, expect.objectContaining(minted)]));
    expect(picker()).toEqual([
      expect.objectContaining({ key: listed.key }),
      expect.objectContaining({ ...minted, band: "profile" }),
    ]);
    expect(h.fetchTagIndex).not.toHaveBeenCalled();
    expect(h.fetchPickerTags).not.toHaveBeenCalled();
  });

  it("leaves a tag the catalogue already lists alone", async () => {
    const { result, index } = setup();
    await act(() => result.current.mutateAsync({ tag: { authorPubkey: OTHER, slug: "podcaster" } }));
    expect(index()).toEqual([listed]);
  });

  it("adds nothing for a dispute", async () => {
    const { result, index } = setup();
    await act(() => result.current.mutateAsync({ tag: { name: "Musician" }, polarity: -1 }));
    expect(index()).toEqual([listed]);
  });
});
