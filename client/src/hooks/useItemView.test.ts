/**
 * useResolvedItemView runs for every DList card, row and tile on a page, and those re-render
 * whenever their parents do: the item's reading (lib/itemPresentation) and its links are made once
 * per item and definition, not once per render.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ResolvedConcept } from "@/lib/conceptResolution";
import type { ItemPresentation } from "@/lib/itemPresentation";

const TEMPLATES = { data: new Map() };
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => TEMPLATES }));
vi.mock("@/hooks/useItemConcept", () => ({ useItemConcept: () => ({ data: null, isPending: false }) }));
vi.mock("@/lib/itemPresentation", () => ({
  presentItem: vi.fn((item: { tags: string[][] }): ItemPresentation => ({
    title: item.tags.find((t) => t[0] === "name")?.[1] ?? null,
    titleField: "name",
    summary: null,
    summaryField: null,
    image: null,
    imageField: null,
    link: null,
    linkField: null,
    media: null,
    mediaField: null,
    location: null,
    locationField: null,
    facts: [],
    factFields: [],
    listImage: null,
  })),
}));

import { presentItem } from "@/lib/itemPresentation";
import { useResolvedItemView } from "./useItemView";

describe("useResolvedItemView", () => {
  it("reads an item once while the item and its definition hold", () => {
    const item = {
      tags: [
        ["d", "dune"],
        ["name", "Dune"],
      ],
    };
    const resolved = { governing: { links: [] } } as unknown as ResolvedConcept;
    const { result, rerender } = renderHook(() => useResolvedItemView(item, resolved));
    const first = result.current;
    expect(first.shown?.title).toBe("Dune");
    rerender();
    rerender();
    expect(vi.mocked(presentItem)).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(first);
  });
});
