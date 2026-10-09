// @vitest-environment jsdom
/**
 * A Decentralized List's header on /e: the list and its items, read from the
 * index, with the header's own tags behind "Advanced view". Before this it
 * opened as the structural card — a table of field declarations.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const COORD = `39998:${AVI}:food-and-drink-places`;

const loadListItems = vi.fn();
vi.mock("@/services/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadListItems: (headers: string[]) => loadListItems(headers),
}));
/** The loader's answer: these items, from a read that wasn't cut off unless said. */
const answer = (items: unknown[], truncated = false) => loadListItems.mockResolvedValue({ items, truncated });
vi.mock("@/config/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  dictionaryRelays: () => [],
}));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => ({ data: new Map() }) }));
vi.mock("@/hooks/useSpecsForKind", () => ({ useSpecsForKind: () => [] }));

import { DListHeaderHero, ownDefinition } from "./DListHeaderHero";

const HEADER = {
  id: "h".repeat(64),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  content: "",
  tags: [
    ["d", "food-and-drink-places"],
    ["names", "Food and Drink Place", "Food and Drink Places"],
    ["description", "Restaurants, cafes and bars."],
    ["required", "name", "Name of the business"],
    ["required", "category"],
    ["recommended", "address"],
    ["display", "title", "name"],
    ["display", "summary", "address"],
  ],
};

const place = (n: number, name: string, address = `${n} Main St`) => ({
  id: String(n).padStart(64, "0"),
  pubkey: "4".repeat(64),
  kind: 39999,
  created_at: 1000 - n,
  content: "",
  tags: [
    ["d", `place-${n}`],
    ["z", COORD],
    ["name", name],
    ["category", "cafe"],
    ["address", address],
  ],
});

function renderHero(event = HEADER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DListHeaderHero event={event} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  loadListItems.mockReset();
});

describe("DListHeaderHero", () => {
  it("names the list, says what it holds, and lists the items filed under it", async () => {
    answer([place(1, "El Sapo"), place(2, "Café Bitcoin")]);
    renderHero();

    expect(screen.getByTestId("dlist-header-title").textContent).toBe("Food and Drink Places");
    expect(screen.getByTestId("dlist-header-description").textContent).toBe("Restaurants, cafes and bars.");
    expect(screen.getByTestId("dlist-header-shape").textContent).toBe(
      "Each food and drink place has name and category.",
    );
    const titles = (await screen.findAllByTestId("dictionary-item-title")).map((el) => el.textContent);
    expect(titles).toEqual(["El Sapo", "Café Bitcoin"]);
    expect(screen.getAllByTestId("dictionary-item-line")[0].textContent).toBe("1 Main St");
    expect(screen.getByTestId("dlist-header-count").textContent).toBe("2 items");
    // Read by the header's own coordinate — the address its items name with `z`.
    expect(loadListItems).toHaveBeenCalledWith([COORD]);
  });

  it("says so when nothing is filed under the list", async () => {
    answer([]);
    renderHero();
    expect(await screen.findByTestId("dlist-header-items-none")).toBeTruthy();
  });

  it("filters a long list by what its rows show, a page at a time", async () => {
    answer([
      ...Array.from({ length: 60 }, (_, i) => place(i + 1, `Bakery ${i + 1}`)),
      place(99, "Pizza Planet", "Rua Bitcoin"),
    ]);
    renderHero();
    await screen.findAllByTestId("dictionary-item");
    expect(screen.getAllByTestId("dictionary-item")).toHaveLength(50);
    fireEvent.click(screen.getByTestId("dlist-header-show-more"));
    expect(screen.getAllByTestId("dictionary-item")).toHaveLength(61);

    fireEvent.change(screen.getByTestId("dlist-header-filter"), { target: { value: "bitcoin" } });
    const rows = screen.getAllByTestId("dictionary-item");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByTestId("dictionary-item-title").textContent).toBe("Pizza Planet");

    fireEvent.change(screen.getByTestId("dlist-header-filter"), { target: { value: "sushi" } });
    expect(screen.getByTestId("dlist-header-items-no-match")).toBeTruthy();
  });

  it("keeps the header's tags behind Advanced view", async () => {
    answer([place(1, "El Sapo")]);
    renderHero();
    expect(screen.queryByTestId("structural-hero")).toBeNull();

    fireEvent.click(screen.getByTestId("dlist-header-advanced-toggle"));
    expect(screen.getByTestId("structural-hero")).toBeTruthy();
    expect(screen.getAllByTestId("structural-tag").some((r) => r.textContent?.includes("required"))).toBe(true);
    expect(screen.queryByTestId("dlist-header-hero")).toBeNull();

    fireEvent.click(screen.getByTestId("dlist-header-advanced-toggle"));
    expect(screen.getByTestId("dlist-header-hero")).toBeTruthy();
  });

  it("says a list cut off at the read's limit holds at least what was read", async () => {
    answer([place(1, "El Sapo")], true);
    renderHero();
    await screen.findAllByTestId("dictionary-item");
    expect(screen.getByTestId("dlist-header-count").textContent).toBe("1+ items");
  });

  it("falls back to plain words when the header names nothing", async () => {
    answer([]);
    const bare = { ...HEADER, kind: 9998, tags: [["required", "name"]] };
    renderHero(bare);
    expect(screen.getByTestId("dlist-header-title").textContent).toBe("Untitled list");
    expect(screen.getByTestId("dlist-header-items-loading").textContent).toContain("Reading the items");
  });
});

describe("ownDefinition", () => {
  it("reads a 9998 list by its id, even when it carries a d", () => {
    const r = ownDefinition({ ...HEADER, kind: 9998 })!;
    expect(r.chain).toEqual([HEADER.id]);
  });

  it("reads a copy's list under what it points at too, as the Dictionary does", () => {
    const COPY_AUTHOR = "9".repeat(64);
    const copy = { ...HEADER, pubkey: COPY_AUTHOR, tags: [...HEADER.tags, ["b", COORD, "pointer"]] };
    expect(ownDefinition(copy)!.chain).toEqual([`39998:${COPY_AUTHOR}:food-and-drink-places`, COORD]);
  });
});
