/**
 * A list's Items tab: its health, its items in a table, and the one item the
 * address names in a side panel, checked under the definition chosen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept } from "@/lib/conceptResolution";

// Radix Select captures the pointer and scrolls its options into view; jsdom does neither.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const { state } = vi.hoisted(() => ({
  state: {
    search: "",
    items: [] as unknown[],
    settled: true,
    truncated: false,
    cutOff: false,
    definitions: [] as unknown[],
    definitionsSettled: true,
    governing: "community",
    profiles: new Map<string, { display_name?: string; name?: string }>(),
    templates: { data: undefined as unknown, isError: false },
    navigate: vi.fn(),
    reload: vi.fn(),
  },
}));
vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSearch: () => state.search,
  useLocation: () => ["/settings", state.navigate],
}));
vi.mock("@/hooks/useListItems", () => ({
  useListItems: () => ({
    items: state.items,
    truncated: state.truncated,
    cutOff: state.cutOff,
    settled: state.settled,
    reload: state.reload,
  }),
}));
vi.mock("@/hooks/useListDefinitions", () => ({
  useListDefinitions: () => ({
    definitions: state.definitions,
    governing: state.governing,
    settled: state.definitionsSettled,
  }),
}));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => state.templates }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => state.profiles }));
vi.mock("@/components/lists/ItemPreview", () => ({
  ItemPreview: () => <div data-testid="item-preview-stub" />,
}));
// The real checks, counted: typing in the search must not run them again.
vi.mock("@/lib/listHealth", async (orig) => {
  const real = await orig<typeof import("@/lib/listHealth")>();
  return { ...real, checkList: vi.fn(real.checkList) };
});
// The tab is drawn inside ListManager, so it builds its addresses without importing it.
vi.mock("@/components/lists/ListManager", () => {
  throw new Error("ListItems must not import ListManager");
});

import { checkList } from "@/lib/listHealth";
import { ListItems } from "./ListItems";

const A = "a".repeat(64);
const B = "b".repeat(64);
const HOUSE = "c".repeat(64);
const COORD = `39998:${A}:places`;

const places: NostrEvent = {
  id: "0".repeat(64),
  pubkey: A,
  kind: 39998,
  created_at: 0,
  content: "",
  sig: "",
  tags: [
    ["d", "places"],
    ["names", "Place", "Places"],
    ["required", "name"],
    ["optional", "website"],
    ["optional", "g"],
    ["field-type", "website", "url"],
    ["display", "title", "name"],
    ["display", "link", "website"],
  ],
};
// Brainstorm's copy requires the website too.
const houseHeader = {
  ...places,
  id: "c".repeat(64),
  pubkey: HOUSE,
  tags: [
    ["d", "places"],
    ["names", "Place", "Places"],
    ["required", "name"],
    ["required", "website"],
    ["field-type", "website", "url"],
    ["display", "title", "name"],
    ["b", COORD, "pointer"],
  ],
};
const own = { source: "community", resolved: resolveConcept({ community: places, communityCoordinate: COORD })! };
const houseCopy = {
  source: "house",
  resolved: resolveConcept({ community: places, communityCoordinate: COORD, house: houseHeader })!,
};
// The list's own header again, with a link built from a URL template.
const TPL = "d".repeat(64);
const linked = {
  source: "community",
  resolved: resolveConcept({
    community: { ...places, tags: [...places.tags, ["link", TPL, "wss://relay.example", "q", "name"]] },
    communityCoordinate: COORD,
  })!,
};
const searchTemplate = { id: TPL, pubkey: A, name: "Search", template: "https://search.example/{q}" };

const item = (id: string, pubkey: string, created_at: number, tags: string[][]): NostrEvent => ({
  id,
  pubkey,
  created_at,
  kind: 39999,
  tags: [["d", id], ["z", COORD], ...tags],
  content: "",
  sig: "",
});

/** Four items with a problem between them, newest first, then 60 clean ones older than all four. */
const items = [
  item("i1", A, 40, [
    ["name", "Cafe (Uno)"],
    ["website", "https://uno.example"],
    ["g", "u0"],
  ]),
  item("i2", A, 30, [
    ["name", "bar dos"],
    ["website", "uno.example"],
  ]),
  item("i3", B, 20, [
    ["name", "Zed*"],
    ["g", "u0"],
    ["g", "u0q"],
  ]),
  item("i4", B, 10, [["website", "https://four.example"]]),
  ...Array.from({ length: 60 }, (_, i) =>
    item(`n${String(i).padStart(2, "0")}`, A, 1 + (i % 9), [["name", `Spot ${i}`]]),
  ),
];

const at = (rest: string) => `tab=dictionary&manage=lists&list=${COORD}&view=items${rest}`;

beforeEach(() => {
  state.search = at("");
  state.items = items;
  state.settled = true;
  state.truncated = false;
  state.cutOff = false;
  state.definitions = [own];
  state.definitionsSettled = true;
  state.governing = "community";
  state.profiles = new Map();
  state.templates = { data: new Map(), isError: false };
  state.navigate.mockReset();
  state.reload.mockReset();
});

describe("ListItems", () => {
  it("shows the health and the items of a list", () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("64");
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(50);
    expect(screen.queryByTestId("item-inspector")).toBeNull();
  });

  it("is reading until the relays have answered", () => {
    state.items = [];
    state.settled = false;
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-reading")).toHaveTextContent("Reading the list's items…");
    expect(screen.queryByTestId("list-health")).toBeNull();
  });

  it("says what it found when a list has no items", () => {
    state.items = [];
    state.settled = true;
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-empty")).toHaveTextContent(
      "No items found for this list on the hub or our index.",
    );
    expect(screen.queryByTestId("list-health")).toBeNull();
    expect(screen.queryByTestId("item-table")).toBeNull();
    expect(screen.getByRole("link", { name: "Add an item" })).toHaveAttribute(
      "href",
      `/settings?tab=dictionary&manage=lists&list=${encodeURIComponent(COORD)}&view=add`,
    );
  });

  it("says a read that was cut off and found nothing may not be an empty list", () => {
    state.items = [];
    state.cutOff = true;
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    const notice = screen.getByTestId("list-items-cut-off");
    expect(notice).toHaveTextContent("A relay didn't finish answering within 20 seconds. This may not be every item.");
    const empty = screen.getByTestId("list-items-empty");
    expect(empty).toContainElement(notice);
    const line = screen.getByText("No items found for this list on the hub or our index.");
    expect(notice.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says nothing of a deadline when a read that found nothing was not cut off", () => {
    state.items = [];
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-items-cut-off")).toBeNull();
  });

  it("reads again when asked", async () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getByTestId("list-items-reload"));
    expect(state.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the items on screen while it reads again", () => {
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    state.settled = false;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-items-reading")).toBeNull();
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(50);
    expect(screen.getByTestId("list-items-reload")).toBeDisabled();
  });

  it("draws nothing from items the store already held until the list's read has settled once", () => {
    state.items = items.slice(0, 4);
    state.settled = false;
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("list-health")).toBeNull();
    expect(screen.queryByTestId("item-table")).toBeNull();
    state.settled = true;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("4");
    // Reading again keeps the rows on screen.
    state.settled = false;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-items-reading")).toBeNull();
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(4);
  });

  it("holds the item the address names until the list's read has settled once", () => {
    state.search = at("&item=i1");
    state.settled = false;
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("item-inspector")).toBeNull();
    state.settled = true;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("item-inspector")).toHaveTextContent("Cafe (Uno)");
  });

  it("is reading again for another list, whatever it showed of the last", () => {
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health")).toBeInTheDocument();
    const other = { ...places, tags: [["d", "bars"], ...places.tags.slice(1)] };
    state.settled = false;
    rerender(<ListItems header={other} listRef={`39998:${A}:bars`} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("list-health")).toBeNull();
  });

  it("waits for the list's definitions before it checks the items", () => {
    state.definitionsSettled = false;
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("list-health")).toBeNull();
    expect(screen.queryByTestId("item-table")).toBeNull();
    state.definitionsSettled = true;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-items-reading")).toBeNull();
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("64");
  });

  it("says when the relay's answer was cut off", () => {
    state.truncated = true;
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-truncated")).toBeInTheDocument();
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64 read.");
  });

  it("says when a relay did not finish answering in time", () => {
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-items-cut-off")).toBeNull();
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
    state.cutOff = true;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-cut-off")).toBeInTheDocument();
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("Items read");
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64 read.");
  });

  it("waits for a definition's URL templates before it checks the items", () => {
    state.search = at("&item=i1");
    state.definitions = [linked];
    state.templates = { data: undefined, isError: false };
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("list-health")).toBeNull();
    expect(screen.queryByTestId("item-inspector")).toBeNull();
    state.templates = { data: new Map([[TPL, searchTemplate]]), isError: false };
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("64");
    expect(screen.queryByTestId("list-health-problem-template-not-given")).toBeNull();
    expect(screen.getByTestId("item-inspector-problems")).toHaveTextContent("None.");
  });

  it("keeps the definition switch and Read again in place while a chosen definition's templates load", async () => {
    state.definitions = [linked, houseCopy];
    state.governing = "house";
    state.templates = { data: undefined, isError: false };
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("list-items-as-community"));
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("list-health")).toBeNull();
    expect(screen.queryByTestId("item-table")).toBeNull();
    expect(screen.getByTestId("list-items-as-community")).toHaveFocus();
    expect(screen.getByTestId("list-items-as-house")).toBeInTheDocument();
    expect(screen.getByTestId("list-items-reload")).toBeInTheDocument();
    // And the way back is still there.
    await userEvent.click(screen.getByTestId("list-items-as-house"));
    expect(screen.getByTestId("list-health")).toBeInTheDocument();
  });

  it("keeps Read again in place, once, while a list's first read is out and when it has no items", () => {
    state.items = [];
    state.settled = false;
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.getByTestId("list-items-reload")).toBeDisabled();
    state.settled = true;
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-empty")).toBeInTheDocument();
    expect(screen.getAllByTestId("list-items-reload")).toHaveLength(1);
    expect(screen.getByTestId("list-items-reload")).toBeEnabled();
  });

  it("checks without the templates when they can't be read", () => {
    state.definitions = [linked];
    state.templates = { data: undefined, isError: true };
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health-problem-template-not-given")).toBeInTheDocument();
  });

  it("waits for no templates under a definition with no links", () => {
    state.templates = { data: undefined, isError: false };
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-health")).toBeInTheDocument();
  });

  it("a problem row narrows the table, and the page goes back to the first", async () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getByTestId("item-table-next"));
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(1);
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 1 of 1 matching");
    expect(screen.getByTestId("list-health-problem-repeated:g")).toHaveAttribute("data-state", "selected");
    expect(screen.getByTestId("item-table-problem-filter")).toHaveTextContent("Problem: repeated:g");
    // Pressing it again clears it, and the table is still on its first page.
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
    // The table's own chip takes it off too.
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    await userEvent.click(screen.getByRole("button", { name: "Remove problem filter" }));
    expect(screen.queryByTestId("item-table-problem-filter")).toBeNull();
    expect(screen.getByTestId("list-health-problem-repeated:g")).not.toHaveAttribute("data-state");
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
  });

  it("lets go of a problem filter once the list no longer has that problem", async () => {
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(1);
    // Read again, and the one item that repeated a field is gone.
    state.items = items.filter((i) => i.id !== "i3");
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-health-problem-repeated:g")).toBeNull();
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 63.");
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(screen.queryByTestId("item-table-clear")).toBeNull();
  });

  it("does not check the list again for a keystroke in the search", async () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    const before = vi.mocked(checkList).mock.calls.length;
    expect(before).toBeGreaterThan(0);
    await userEvent.type(screen.getByTestId("item-table-search"), "spo");
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 60 matching");
    expect(vi.mocked(checkList).mock.calls.length).toBe(before);
  });

  it("goes back to the first page when the search or a filter changes", async () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getByTestId("item-table-next"));
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 51 to 64 of 64.");
    await userEvent.type(screen.getByTestId("item-table-search"), "spot");
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 60 matching");
    await userEvent.click(screen.getByTestId("item-table-next"));
    await userEvent.click(screen.getByTestId("item-table-only-problems"));
    await userEvent.click(screen.getByTestId("item-table-clear"));
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
  });

  it("names a curator by their profile, or by a short npub", () => {
    state.profiles = new Map([[A, { display_name: "Mise", name: "mise" }]]);
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    const rows = screen.getAllByTestId("item-table-row");
    expect(rows[0]).toHaveTextContent("Mise");
    expect(rows[2]).toHaveTextContent(`${nip19.npubEncode(B).slice(0, 12)}…`);
  });

  it("draws a list with an item whose curator's key is not a key", () => {
    state.items = [item("odd", "not-a-key", 50, [["name", "Odd one"]]), ...items];
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    const row = screen.getAllByTestId("item-table-row")[0];
    expect(row).toHaveTextContent("Odd one");
    expect(row).toHaveTextContent("not-a-key…");
  });

  it("draws a list with an item whose curator's key is empty, and offers no empty curator to filter by", async () => {
    state.items = [item("blank", "", 50, [["name", "Blank one"]]), ...items];
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getAllByTestId("item-table-row")[0]).toHaveTextContent("Blank one");
    // The filter lists A and B (and all curators), and no entry with an empty value.
    await userEvent.click(screen.getByTestId("item-table-curator"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual([
      "All curators",
      `${nip19.npubEncode(A).slice(0, 12)}…`,
      `${nip19.npubEncode(B).slice(0, 12)}…`,
    ]);
  });

  it("opens the item the address names, and says so when the list doesn't have it", () => {
    state.search = at(`&item=${"f".repeat(64)}`);
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("item-inspector-missing")).toBeInTheDocument();
  });

  it("doesn't break on an item id that isn't one", () => {
    state.search = at("&item=%3Cscript%3E");
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("item-inspector-missing")).toBeInTheDocument();
  });

  it("waits for the read before saying an item isn't on the list", () => {
    state.search = at("&item=i1");
    state.items = [];
    state.settled = false;
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("item-inspector")).toBeNull();
  });

  it("a row puts its item in the address", async () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getAllByTestId("item-table-row")[0]);
    expect(state.navigate).toHaveBeenCalledWith(expect.stringContaining("&view=items&item=i1"), { replace: true });
  });

  it("builds its addresses from the list value it was opened with, not from the header", async () => {
    const naddr = nip19.naddrEncode({ kind: 39998, pubkey: A, identifier: "places", relays: ["wss://hub.example"] });
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={naddr} />);
    await userEvent.click(screen.getAllByTestId("item-table-row")[0]);
    expect(state.navigate).toHaveBeenCalledWith(
      `/settings?tab=dictionary&manage=lists&list=${naddr}&view=items&item=i1`,
      { replace: true },
    );
    state.items = [];
    rerender(<ListItems header={places} listRef={naddr} />);
    expect(screen.getByRole("link", { name: "Add an item" })).toHaveAttribute(
      "href",
      `/settings?tab=dictionary&manage=lists&list=${naddr}&view=add`,
    );
  });

  it("shows the item the address names, with its curator, and steps to its neighbours", async () => {
    state.search = at("&item=i2");
    state.profiles = new Map([[A, { name: "mise" }]]);
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    const panel = screen.getByTestId("item-inspector");
    expect(panel).toHaveTextContent("bar dos");
    expect(panel).toHaveTextContent("mise");
    await userEvent.click(screen.getByTestId("item-inspector-next"));
    expect(state.navigate).toHaveBeenLastCalledWith(expect.stringMatching(/&view=items&item=i3$/), { replace: true });
    await userEvent.click(screen.getByTestId("item-inspector-prev"));
    expect(state.navigate).toHaveBeenLastCalledWith(expect.stringMatching(/&view=items&item=i1$/), { replace: true });
    await userEvent.click(screen.getByTestId("item-inspector-close"));
    expect(state.navigate).toHaveBeenLastCalledWith(expect.stringMatching(/&view=items$/), { replace: true });
  });

  it("has no previous at the first row", () => {
    state.search = at("&item=i1");
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("item-inspector-prev")).toBeDisabled();
    expect(screen.getByTestId("item-inspector-next")).toBeEnabled();
  });

  it("offers no neighbours for an open item the filter leaves out", async () => {
    const { rerender } = renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    state.search = at("&item=i1");
    rerender(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByTestId("item-inspector")).toHaveTextContent("Cafe (Uno)");
    expect(screen.getByTestId("item-inspector-prev")).toBeDisabled();
    expect(screen.getByTestId("item-inspector-next")).toBeDisabled();
  });

  it("offers no definition to choose when there is only one", () => {
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.queryByTestId("list-items-as-community")).toBeNull();
  });

  it("offers each definition to check under when there is more than one", async () => {
    state.definitions = [own, houseCopy];
    state.governing = "house";
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    expect(screen.getByRole("tablist", { name: "Check it as" })).toBeInTheDocument();
    expect(screen.getByTestId("list-items-as-house")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("list-items-as-house")).toHaveTextContent("Brainstorm's copy");
    expect(screen.getByTestId("list-health-problem-required-missing:website")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("item-table-next"));
    await userEvent.click(screen.getByTestId("list-items-as-community"));
    expect(screen.getByTestId("list-items-as-community")).toHaveAttribute("data-state", "active");
    expect(screen.queryByTestId("list-health-problem-required-missing:website")).toBeNull();
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
  });

  it("drops the problem filter when the definition changes, and keeps the rest", async () => {
    state.definitions = [own, houseCopy];
    state.governing = "house";
    renderWithProviders(<ListItems header={places} listRef={COORD} />);
    await userEvent.click(screen.getByTestId("item-table-only-problems"));
    await userEvent.click(screen.getByTestId("list-health-problem-required-missing:name"));
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(1);
    await userEvent.click(screen.getByTestId("list-items-as-community"));
    // The list's own definition has the same problem, and it is not pressed.
    expect(screen.getByTestId("list-health-problem-required-missing:name")).not.toHaveAttribute("data-state");
    expect(screen.getByTestId("item-table-only-problems")).toBeChecked();
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 3 of 3 matching, 64 on the list.");
  });
});
