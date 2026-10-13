/**
 * List Management's index: the signed-in author's lists, found by their
 * words, or a particular list found by pasting its address; and the editor a
 * list's row opens, on the tab the address names.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

const { ME, AVI, state } = vi.hoisted(() => ({
  ME: "1".repeat(64),
  AVI: "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450",
  state: { search: "tab=dictionary&manage=lists", me: "1".repeat(64) as string | null, navigate: vi.fn() },
}));
vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSearch: () => state.search,
  useLocation: () => ["/settings", state.navigate],
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => (state.me ? { pubkey: state.me, isAdmin: true } : null),
}));
const header = (pubkey: string, d: string, names: [string, string], description: string): NostrEvent => ({
  id: `${d}`.padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  content: "",
  sig: "",
  tags: [
    ["d", d],
    ["names", ...names],
    ["description", description],
    ["required", "name"],
  ],
});
const mine = [
  header(ME, "food-trucks", ["Food Truck", "Food Trucks"], "Trucks that take bitcoin"),
  header(ME, "zines", ["Zine", "Zines"], "Small-press magazines"),
];
const avis = header(AVI, "divine-videos", ["Divine Video", "Divine Videos"], "Short looping videos");
vi.mock("@/hooks/useLists", () => ({
  useMyLists: () => ({ lists: mine, settled: true }),
  useListAt: (ref: { coordinate?: string } | null) => ({
    header: ref?.coordinate === `39998:${AVI}:divine-videos` ? avis : null,
    settled: true,
  }),
}));
vi.mock("@/components/lists/ListEditor", () => ({
  ListEditor: ({ header }: { header: NostrEvent | null }) => (
    <div data-testid="editor-for">{header ? header.tags.find((t) => t[0] === "d")?.[1] : "new"}</div>
  ),
}));

vi.mock("@/components/lists/ItemComposer", () => ({
  ItemComposer: ({ header }: { header: NostrEvent }) => (
    <div data-testid="composer-for">{header.tags.find((t) => t[0] === "d")?.[1]}</div>
  ),
}));
vi.mock("@/components/lists/ListItems", () => ({
  ListItems: ({ header }: { header: NostrEvent }) => (
    <div data-testid="items-for">{header.tags.find((t) => t[0] === "d")?.[1]}</div>
  ),
}));

import { ListManager, listManagerPath } from "./ListManager";

const ZINES = encodeURIComponent(`39998:${ME}:zines`);
const DIVINE = encodeURIComponent(`39998:${AVI}:divine-videos`);

beforeEach(() => {
  state.search = "tab=dictionary&manage=lists";
  state.me = ME;
  state.navigate.mockReset();
});

describe("ListManager", () => {
  it("lists the signed-in author's lists, and finds them by their words", async () => {
    renderWithProviders(<ListManager />);
    expect(screen.getAllByTestId("list-manager-list").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Food Trucks"),
      expect.stringContaining("Zines"),
    ]);
    await userEvent.type(screen.getByTestId("list-manager-search"), "bitcoin");
    expect(screen.getAllByTestId("list-manager-list")).toHaveLength(1);
    expect(screen.getByTestId("list-manager-list")).toHaveTextContent("Food Trucks");
  });

  it("finds a particular list — anyone's — by its pasted address", async () => {
    renderWithProviders(<ListManager />);
    const naddr = nip19.naddrEncode({ kind: 39998, pubkey: AVI, identifier: "divine-videos" });
    await userEvent.type(screen.getByTestId("list-manager-search"), naddr);
    expect(screen.getByTestId("list-manager-list")).toHaveTextContent("Divine Videos");
    expect(screen.getByTestId("list-manager-list")).toHaveTextContent("someone else");
  });

  it("opens the editor a row or New list links to", () => {
    state.search = `tab=dictionary&manage=lists&list=${encodeURIComponent(`39998:${ME}:zines`)}`;
    const { unmount } = renderWithProviders(<ListManager />);
    expect(screen.getByTestId("editor-for")).toHaveTextContent("zines");
    unmount();
    state.search = "tab=dictionary&manage=lists&list=new";
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("editor-for")).toHaveTextContent("new");
  });

  it("asks a visitor to sign in", () => {
    state.me = null;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("list-manager")).toHaveTextContent("Sign in to author lists.");
  });

  it("opens a list on its items when the address says so", () => {
    state.search = `tab=dictionary&manage=lists&list=${encodeURIComponent(`39998:${ME}:zines`)}&view=items`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("items-for")).toHaveTextContent("zines");
    expect(screen.getByTestId("list-manager-mode-items")).toHaveAttribute("data-state", "active");
  });

  it("opens one's own list on adding an item when the address says so", () => {
    state.search = `tab=dictionary&manage=lists&list=${ZINES}&view=add`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("composer-for")).toHaveTextContent("zines");
    expect(screen.getByTestId("list-manager-mode-item")).toHaveAttribute("data-state", "active");
  });

  it("puts the chosen tab in the address, replacing the entry", async () => {
    state.search = `tab=dictionary&manage=lists&list=${ZINES}`;
    renderWithProviders(<ListManager />);
    const base = `/settings?tab=dictionary&manage=lists&list=${ZINES}`;
    await userEvent.click(screen.getByTestId("list-manager-mode-items"));
    expect(state.navigate).toHaveBeenLastCalledWith(`${base}&view=items`, { replace: true });
    await userEvent.click(screen.getByTestId("list-manager-mode-item"));
    expect(state.navigate).toHaveBeenLastCalledWith(`${base}&view=add`, { replace: true });
    await userEvent.click(screen.getByTestId("list-manager-mode-definition"));
    expect(state.navigate).toHaveBeenLastCalledWith(base, { replace: true });
  });

  it("opens someone else's list on adding an item, its definition a tab away", async () => {
    state.search = `tab=dictionary&manage=lists&list=${DIVINE}`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("composer-for")).toHaveTextContent("divine-videos");
    await userEvent.click(screen.getByTestId("list-manager-mode-definition"));
    expect(screen.getByTestId("editor-for")).toHaveTextContent("divine-videos");
  });

  it("builds a link to a list's items and to one item", () => {
    expect(listManagerPath("C")).toBe("/settings?tab=dictionary&manage=lists&list=C");
    expect(listManagerPath("C", { view: "items", item: "ID" })).toBe(
      "/settings?tab=dictionary&manage=lists&list=C&view=items&item=ID",
    );
    expect(listManagerPath("C", { view: "add" })).toBe("/settings?tab=dictionary&manage=lists&list=C&view=add");
    expect(listManagerPath("39998:a:b c", { view: "items", item: "<i>" })).toBe(
      "/settings?tab=dictionary&manage=lists&list=39998%3Aa%3Ab%20c&view=items&item=%3Ci%3E",
    );
  });
});
