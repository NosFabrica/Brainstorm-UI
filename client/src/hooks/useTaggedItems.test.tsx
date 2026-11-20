// @vitest-environment jsdom
/**
 * What a Dictionary list's item is called by its list, and the search filter that list is
 * found under: Places is the community's "Food and Drink Places" list and every copy of it,
 * so a tagged cafe is filed under Places whichever copy lists it.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { NostrEvent } from "nostr-tools";
import { ListKindsContext, type ListKindSearch } from "@/hooks/useListKinds";

const CURATOR = "b".repeat(64);
const COPIER = "c".repeat(64);
const COMMUNITY = `39998:${CURATOR}:food-and-drink-places`;
const COPY = `39998:${COPIER}:food-and-drink-places`;
const BOOKS = `39998:${CURATOR}:books`;
const header = (pubkey: string, d: string, names: [string, string], points?: string): NostrEvent => ({
  id: `${d}-${pubkey.slice(0, 4)}`.padEnd(64, "0"),
  kind: 39998,
  pubkey,
  created_at: 1,
  content: "",
  sig: "",
  tags: [["d", d], ["names", ...names], ...(points ? [["b", points, "pointer"]] : [])],
});
const item = (list: string, d: string): NostrEvent => ({
  id: d.padEnd(64, "1"),
  kind: 39999,
  pubkey: COPIER,
  created_at: 1,
  content: "",
  sig: "",
  tags: [
    ["d", d],
    ["z", list],
  ],
});

const h = vi.hoisted(() => ({ headers: [] as unknown[] }));
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null) => ({ events: key ? h.headers : [], loading: false }),
}));

import { useListNames } from "./useTaggedItems";

const kinds = [
  { key: "places", label: "Places", community: COMMUNITY },
  { key: "books", label: "Books", community: BOOKS },
] as unknown as ListKindSearch[];
const wrapper = ({ children }: { children: ReactNode }) => (
  <ListKindsContext.Provider value={kinds}>{children}</ListKindsContext.Provider>
);

describe("useListNames", () => {
  it("names the filter a list is found under: the community's own list", () => {
    h.headers = [
      header(CURATOR, "food-and-drink-places", ["Food and Drink Place", "Food and Drink Places"], COMMUNITY),
    ];
    const cafe = item(COMMUNITY, "cafe");
    const { result } = renderHook(() => useListNames([cafe]), { wrapper });
    expect(result.current.listOf(cafe)).toEqual({
      singular: "Food and Drink Place",
      plural: "Food and Drink Places",
      section: "Places",
    });
  });

  it("names it for a copy of that list, which points at the community's", () => {
    h.headers = [header(COPIER, "food-and-drink-places", ["Venue", "Venues"], COMMUNITY)];
    const bar = item(COPY, "bar");
    const { result } = renderHook(() => useListNames([bar]), { wrapper });
    expect(result.current.listOf(bar)).toEqual({ singular: "Venue", plural: "Venues", section: "Places" });
  });

  it("names no filter for a list none is made of", () => {
    h.headers = [header(CURATOR, "birds", ["Bird", "Birds"])];
    const robin = item(`39998:${CURATOR}:birds`, "robin");
    const { result } = renderHook(() => useListNames([robin]), { wrapper });
    expect(result.current.listOf(robin)).toEqual({ singular: "Bird", plural: "Birds" });
  });
});
