/**
 * Adding an item to a list: the form and preview follow the definition the
 * author previews it under, values survive switching, and what the list itself
 * requires decides whether it can be added.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NostrEvent } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";

const { AVI, HOUSE, ME, publish, defs } = vi.hoisted(() => ({
  AVI: "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450",
  HOUSE: "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a",
  ME: "1".repeat(64),
  publish: vi.fn(),
  defs: { value: null as unknown },
}));
vi.mock("@/services/lists", () => ({ publishListEvent: (t: unknown) => publish(t) }));
vi.mock("@/hooks/useListDefinitions", () => ({ useListDefinitions: () => defs.value }));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => ({ data: new Map() }) }));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [], rendered: [], known: true }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ isAdmin: true }) }));

import { ItemComposer } from "./ItemComposer";

const COORD = `39998:${AVI}:food-and-drink-places`;
const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "food-and-drink-places"], ["names", "Food and Drink Place", "Food and Drink Places"], ...tags],
});
const community = header(AVI, [
  ["required", "name"],
  ["required", "category"],
  ["display", "title", "name"],
]);
// Brainstorm's copy lists the phone too, and makes it a fact.
const houseCopy = header(HOUSE, [
  ["required", "name"],
  ["optional", "phone"],
  ["display", "title", "name"],
  ["display", "fact", "phone", "Phone"],
  ["b", COORD, "pointer"],
]);

beforeEach(() => {
  publish.mockReset();
  publish.mockImplementation(async (t: { tags: string[][] }) => ({ ...t, id: "f".repeat(64), pubkey: ME }));
  defs.value = {
    definitions: [
      { source: "community", resolved: resolveConcept({ community, communityCoordinate: COORD })! },
      { source: "house", resolved: resolveConcept({ community, communityCoordinate: COORD, house: houseCopy })! },
    ],
    governing: "house",
    settled: true,
  };
});

const compose = () => renderWithProviders(<ItemComposer header={community as unknown as NostrEvent} me={ME} />);
const preview = () => screen.getByTestId("item-composer-preview");

describe("ItemComposer", () => {
  it("opens on the definition that governs for the author, its fields and its look", async () => {
    compose();
    expect(screen.getByTestId("item-field-phone")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("item-field-name"), "Wolf's Burger Truck");
    await userEvent.type(screen.getByTestId("item-field-phone"), "+1 504");
    expect(within(preview()).getByTestId("dlist-item-title")).toHaveTextContent("Wolf's Burger Truck");
    expect(within(preview()).getByTestId("dlist-item-fact")).toHaveTextContent("Phone+1 504");
  });

  it("keeps values when the preview switches definitions, and says which the shown one doesn't declare", async () => {
    compose();
    await userEvent.type(screen.getByTestId("item-field-name"), "Wolf's");
    await userEvent.type(screen.getByTestId("item-field-phone"), "+1 504");
    await userEvent.click(screen.getByTestId("item-composer-as-community"));
    expect(screen.getByTestId("item-field-name")).toHaveValue("Wolf's");
    expect(screen.queryByTestId("item-field-phone")).toBeNull();
    expect(screen.getByTestId("item-composer-elsewhere")).toHaveTextContent("phone");
    expect(screen.getByTestId("item-field-category")).toBeInTheDocument();
  });

  it("can't be added until the list's own required fields are filled; then it's filed under the list", async () => {
    compose();
    await userEvent.type(screen.getByTestId("item-field-name"), "Wolf's Burger Truck");
    expect(screen.getByTestId("item-composer-problems")).toHaveTextContent("require category");
    expect(screen.getByTestId("item-composer-publish")).toBeDisabled();

    await userEvent.click(screen.getByTestId("item-composer-as-community"));
    await userEvent.type(screen.getByTestId("item-field-category"), "restaurant");
    await userEvent.click(screen.getByTestId("item-composer-publish"));
    const sent = publish.mock.calls[0][0] as { kind: number; tags: string[][] };
    expect(sent.kind).toBe(39999);
    expect(sent.tags[0][1]).toMatch(/^wolf-s-burger-truck-[0-9a-f]{8}$/);
    expect(sent.tags.slice(1)).toEqual([
      ["z", COORD],
      ["name", "Wolf's Burger Truck"],
      ["category", "restaurant"],
      ["alt", "Food and Drink Place: Wolf's Burger Truck"],
    ]);
    expect(await screen.findByTestId("item-composer-added")).toBeInTheDocument();
    expect(screen.getByTestId("item-field-category")).toHaveValue("");
  });
});
