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
const DIVINE_COORDINATE = `39998:${AVI}:divine-videos`;
/** One's own version of Avi's list, as the Dictionary publishes one: same d, pointing at it. */
const myVersion: NostrEvent = {
  ...header(ME, "divine-videos", ["Divine Video", "Divine Videos"], "Short looping videos"),
  id: "f".repeat(64),
  tags: [...avis.tags, ["b", DIVINE_COORDINATE, "pointer"]],
};
/** One's own version of a list that can't be found. */
const strayVersion: NostrEvent = {
  ...header(ME, "gone", ["Gone", "Gones"], "Of a list no relay has"),
  id: "e".repeat(64),
};
strayVersion.tags = [...strayVersion.tags, ["b", `39998:${AVI}:gone`, "pointer"]];
const ninesId = "9".repeat(64);
const nines: NostrEvent = { ...header(AVI, "nines", ["Nine", "Nines"], "A 9998 with a d"), id: ninesId, kind: 9998 };
vi.mock("@/hooks/useLists", () => ({
  useMyLists: () => ({ lists: [...mine, myVersion, strayVersion], settled: true }),
  useListAt: (ref: { coordinate?: string; id?: string } | null) => ({
    header: ref?.coordinate === DIVINE_COORDINATE ? avis : ref?.id === ninesId ? nines : null,
    settled: true,
  }),
}));
/** Who wrote a header, and its d: what the mocked tabs below show of the list they were handed. */
const named = (h: NostrEvent) => `${h.pubkey}:${h.tags.find((t) => t[0] === "d")?.[1]}`;
vi.mock("@/components/lists/ListEditor", () => ({
  ListEditor: ({ header }: { header: NostrEvent | null }) => (
    <div data-testid="editor-for">{header ? named(header) : "new"}</div>
  ),
}));

vi.mock("@/components/lists/ItemComposer", () => ({
  ItemComposer: ({ header }: { header: NostrEvent }) => <div data-testid="composer-for">{named(header)}</div>,
}));
vi.mock("@/components/lists/ListItems", () => ({
  ListItems: ({ header, listRef, also }: { header: NostrEvent; listRef: string; also?: string[] }) => (
    <div data-testid="items-for" data-list-ref={listRef} data-also={(also ?? []).join(",")}>
      {named(header)}
    </div>
  ),
}));
vi.mock("@/components/dictionary/AddressRef", () => ({
  AddressRef: ({ address }: { address: string }) => <span>{address}</span>,
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
      expect.stringContaining("Divine Videos"),
      expect.stringContaining("Gones"),
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

  it("keeps the address a list was opened by, relay hints and all, through a tab choice", async () => {
    const naddr = nip19.naddrEncode({
      kind: 39998,
      pubkey: AVI,
      identifier: "divine-videos",
      relays: ["wss://hub.example"],
    });
    state.search = `tab=dictionary&manage=lists&list=${naddr}`;
    const { rerender } = renderWithProviders(<ListManager />);
    const base = `/settings?tab=dictionary&manage=lists&list=${naddr}`;
    await userEvent.click(screen.getByTestId("list-manager-mode-items"));
    expect(state.navigate).toHaveBeenLastCalledWith(`${base}&view=items`, { replace: true });
    await userEvent.click(screen.getByTestId("list-manager-mode-definition"));
    expect(state.navigate).toHaveBeenLastCalledWith(base, { replace: true });
    // And the Items tab is handed that value to build its own addresses from.
    state.search = `tab=dictionary&manage=lists&list=${naddr}&view=items`;
    rerender(<ListManager />);
    expect(screen.getByTestId("items-for")).toHaveAttribute("data-list-ref", naddr);
  });

  it("opens someone else's list on adding an item, its definition a tab away", async () => {
    state.search = `tab=dictionary&manage=lists&list=${DIVINE}`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("composer-for")).toHaveTextContent("divine-videos");
    await userEvent.click(screen.getByTestId("list-manager-mode-definition"));
    expect(screen.getByTestId("editor-for")).toHaveTextContent("divine-videos");
  });

  it("adds an item to a version of a list on the list it's a version of, where everyone else's are", () => {
    state.search = `tab=dictionary&manage=lists&list=${encodeURIComponent(`39998:${ME}:divine-videos`)}&view=add`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("composer-for")).toHaveTextContent(`${AVI}:divine-videos`);
    expect(screen.getByTestId("list-manager-version-of")).toHaveTextContent(DIVINE_COORDINATE);
  });

  it("reads a version's items on the list it's a version of, with any filed under the version", () => {
    const mineRef = `39998:${ME}:divine-videos`;
    state.search = `tab=dictionary&manage=lists&list=${encodeURIComponent(mineRef)}&view=items`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("items-for")).toHaveTextContent(`${AVI}:divine-videos`);
    expect(screen.getByTestId("items-for")).toHaveAttribute("data-also", `39998:${ME}:divine-videos`);
    // Its addresses stay on the version it was opened from.
    expect(screen.getByTestId("items-for")).toHaveAttribute("data-list-ref", mineRef);
  });

  it("keeps a version's own definition to edit", () => {
    state.search = `tab=dictionary&manage=lists&list=${encodeURIComponent(`39998:${ME}:divine-videos`)}`;
    renderWithProviders(<ListManager />);
    expect(screen.getByTestId("editor-for")).toHaveTextContent(`${ME}:divine-videos`);
  });

  it("adds nothing to a version whose list can't be found, rather than to the version", () => {
    state.search = `tab=dictionary&manage=lists&list=${encodeURIComponent(`39998:${ME}:gone`)}&view=add`;
    renderWithProviders(<ListManager />);
    expect(screen.queryByTestId("composer-for")).toBeNull();
    expect(screen.getByTestId("list-manager-version-of-missing")).toHaveTextContent(`39998:${AVI}:gone`);
  });

  it("links a pasted 9998 by its id, even when it carries a d", async () => {
    renderWithProviders(<ListManager />);
    await userEvent.type(screen.getByTestId("list-manager-search"), nip19.neventEncode({ id: ninesId }));
    expect(screen.getByTestId("list-manager-list")).toHaveAttribute("href", listManagerPath(ninesId));
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
