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

const { state } = vi.hoisted(() => ({
  state: {
    search: "",
    items: [] as unknown[],
    settled: true,
    truncated: false,
    definitions: [] as unknown[],
    governing: "community",
    profiles: new Map<string, { display_name?: string; name?: string }>(),
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
    settled: state.settled,
    reload: state.reload,
  }),
}));
vi.mock("@/hooks/useListDefinitions", () => ({
  useListDefinitions: () => ({ definitions: state.definitions, governing: state.governing, settled: true }),
}));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => ({ data: new Map() }) }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => state.profiles }));
vi.mock("@/components/lists/ItemPreview", () => ({
  ItemPreview: () => <div data-testid="item-preview-stub" />,
}));

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
  state.definitions = [own];
  state.governing = "community";
  state.profiles = new Map();
  state.navigate.mockReset();
  state.reload.mockReset();
});

describe("ListItems", () => {
  it("shows the health and the items of a list", () => {
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("list-health-tile-items")).toHaveTextContent("64");
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(50);
    expect(screen.queryByTestId("item-inspector")).toBeNull();
  });

  it("is reading until the relays have answered", () => {
    state.items = [];
    state.settled = false;
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("list-items-reading")).toHaveTextContent("Reading the list's items…");
    expect(screen.queryByTestId("list-health")).toBeNull();
  });

  it("says what it found when a list has no items", () => {
    state.items = [];
    state.settled = true;
    renderWithProviders(<ListItems header={places} />);
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

  it("reads again when asked", async () => {
    renderWithProviders(<ListItems header={places} />);
    await userEvent.click(screen.getByTestId("list-items-reload"));
    expect(state.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the items on screen while it reads again", () => {
    state.settled = false;
    renderWithProviders(<ListItems header={places} />);
    expect(screen.queryByTestId("list-items-reading")).toBeNull();
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(50);
    expect(screen.getByTestId("list-items-reload")).toBeDisabled();
  });

  it("says when the relay's answer was cut off", () => {
    state.truncated = true;
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("list-items-truncated")).toBeInTheDocument();
  });

  it("a problem row narrows the table, and the page goes back to the first", async () => {
    renderWithProviders(<ListItems header={places} />);
    await userEvent.click(screen.getByTestId("item-table-next"));
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(1);
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 1 of 1 matching");
    expect(screen.getByTestId("list-health-problem-repeated:g")).toHaveAttribute("data-state", "selected");
    // Pressing it again clears it, and the table is still on its first page.
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
  });

  it("goes back to the first page when the search or a filter changes", async () => {
    renderWithProviders(<ListItems header={places} />);
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
    renderWithProviders(<ListItems header={places} />);
    const rows = screen.getAllByTestId("item-table-row");
    expect(rows[0]).toHaveTextContent("Mise");
    expect(rows[2]).toHaveTextContent(`${nip19.npubEncode(B).slice(0, 12)}…`);
  });

  it("opens the item the address names, and says so when the list doesn't have it", () => {
    state.search = at(`&item=${"f".repeat(64)}`);
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("item-inspector-missing")).toBeInTheDocument();
  });

  it("doesn't break on an item id that isn't one", () => {
    state.search = at("&item=%3Cscript%3E");
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("item-inspector-missing")).toBeInTheDocument();
  });

  it("waits for the read before saying an item isn't on the list", () => {
    state.search = at("&item=i1");
    state.items = [];
    state.settled = false;
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("list-items-reading")).toBeInTheDocument();
    expect(screen.queryByTestId("item-inspector")).toBeNull();
  });

  it("a row puts its item in the address", async () => {
    renderWithProviders(<ListItems header={places} />);
    await userEvent.click(screen.getAllByTestId("item-table-row")[0]);
    expect(state.navigate).toHaveBeenCalledWith(expect.stringContaining("&view=items&item=i1"), { replace: true });
  });

  it("shows the item the address names, with its curator, and steps to its neighbours", async () => {
    state.search = at("&item=i2");
    state.profiles = new Map([[A, { name: "mise" }]]);
    renderWithProviders(<ListItems header={places} />);
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
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("item-inspector-prev")).toBeDisabled();
    expect(screen.getByTestId("item-inspector-next")).toBeEnabled();
  });

  it("offers no neighbours for an open item the filter leaves out", async () => {
    const { rerender } = renderWithProviders(<ListItems header={places} />);
    await userEvent.click(screen.getByTestId("list-health-problem-repeated:g"));
    state.search = at("&item=i1");
    rerender(<ListItems header={places} />);
    expect(screen.getByTestId("item-inspector")).toHaveTextContent("Cafe (Uno)");
    expect(screen.getByTestId("item-inspector-prev")).toBeDisabled();
    expect(screen.getByTestId("item-inspector-next")).toBeDisabled();
  });

  it("offers no definition to choose when there is only one", () => {
    renderWithProviders(<ListItems header={places} />);
    expect(screen.queryByTestId("list-items-as-community")).toBeNull();
  });

  it("offers each definition to check under when there is more than one", async () => {
    state.definitions = [own, houseCopy];
    state.governing = "house";
    renderWithProviders(<ListItems header={places} />);
    expect(screen.getByTestId("list-items-as-house")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("list-items-as-house")).toHaveTextContent("Brainstorm's copy");
    expect(screen.getByTestId("list-health-problem-required-missing:website")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("item-table-next"));
    await userEvent.click(screen.getByTestId("list-items-as-community"));
    expect(screen.getByTestId("list-items-as-community")).toHaveAttribute("data-state", "active");
    expect(screen.queryByTestId("list-health-problem-required-missing:website")).toBeNull();
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 64.");
  });
});
