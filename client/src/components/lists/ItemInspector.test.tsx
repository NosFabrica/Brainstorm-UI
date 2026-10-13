/**
 * One list item in a side panel: who filed it and when, how it draws, what is
 * wrong with it, what each field holds, and the raw event. Everything it shows
 * comes from the item, the definition and the check it is handed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { checkList } from "@/lib/listHealth";
import { resolveConcept } from "@/lib/conceptResolution";
import { ItemInspector } from "./ItemInspector";

vi.mock("@/components/lists/ItemPreview", () => ({
  ItemPreview: () => <div data-testid="item-preview-stub" />,
}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn() }));

const PUBKEY = "a".repeat(64);
const COORD = `39998:${PUBKEY}:places`;

const resolved = resolveConcept({
  community: {
    id: "f".repeat(64),
    pubkey: PUBKEY,
    kind: 39998,
    created_at: 1_700_000_000,
    tags: [
      ["d", "places"],
      ["names", "place", "places"],
      ["required", "name"],
      ["optional", "website"],
      ["optional", "g"],
      ["field-type", "website", "url"],
      ["display", "title", "name"],
      ["display", "link", "website"],
    ],
  },
  communityCoordinate: COORD,
})!;

const item = {
  id: "1".repeat(64),
  pubkey: PUBKEY,
  kind: 39999,
  // Noon UTC on 14 Nov 2023, so the date reads the same in any time zone.
  created_at: Date.UTC(2023, 10, 14, 12) / 1000,
  content: "",
  sig: "2".repeat(128),
  tags: [
    ["d", "uno"],
    ["z", COORD],
    ["name", "Uno"],
    ["website", "uno.example"],
    ["phone", "555-0100"],
  ],
};
const entry = checkList(resolved.governing, [item], new Map())[0];

const base = {
  open: true,
  resolved,
  curatorName: "Mise",
  onClose: () => {},
  onPrev: () => {},
  onNext: () => {},
};

describe("ItemInspector", () => {
  beforeEach(() => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(copyToClipboard).mockReset();
  });

  it("shows the item's identity, problems, fields and raw event", () => {
    renderWithProviders(<ItemInspector {...base} entry={entry} />);
    expect(screen.getByTestId("item-inspector-id")).toHaveTextContent(entry.item.id);
    expect(screen.getByTestId("item-inspector-problems")).toHaveTextContent("isn't an http(s) URL");
    expect(screen.getByTestId("item-inspector-field-website")).toHaveTextContent("uno.example");
    expect(screen.getByTestId("item-inspector-field-g")).toHaveTextContent("—");
    expect(screen.getByTestId("item-inspector-undeclared")).toHaveTextContent("phone");
    expect(screen.getByTestId("item-inspector-raw")).toHaveTextContent('"kind": 39999');
  });

  it("names the item, its curator and when it was updated, and links to its page", () => {
    renderWithProviders(<ItemInspector {...base} entry={entry} />);
    const panel = screen.getByTestId("item-inspector");
    expect(panel).toHaveTextContent("Uno");
    expect(panel).toHaveTextContent("Mise");
    expect(panel).toHaveTextContent("39999");
    expect(panel).toHaveTextContent("uno");
    expect(panel).toHaveTextContent("Nov 14, 2023");
    expect(screen.getByRole("dialog", { name: "Uno" })).toBe(panel);
    expect(screen.getByTestId("item-inspector-page-link")).toHaveAttribute("href", expect.stringMatching(/^\/e\//));
    expect(screen.getByTestId("item-preview-stub")).toBeInTheDocument();
  });

  it("gives each field's requirement, type and every value, in the definition's order", () => {
    const twice = checkList(
      resolved.governing,
      [{ ...item, tags: [...item.tags, ["website", "https://two.example"]] }],
      new Map(),
    )[0];
    renderWithProviders(<ItemInspector {...base} entry={twice} />);
    const name = screen.getByTestId("item-inspector-field-name");
    expect(name).toHaveTextContent("required");
    expect(screen.getByTestId("item-inspector-field-website")).toHaveTextContent("url");
    expect(screen.getByTestId("item-inspector-field-website")).toHaveTextContent("uno.example");
    expect(screen.getByTestId("item-inspector-field-website")).toHaveTextContent("https://two.example");
  });

  it("says so when nothing is wrong, and shows no undeclared section when every tag is declared", () => {
    const clean = checkList(
      resolved.governing,
      [
        {
          ...item,
          tags: [
            ["d", "uno"],
            ["z", COORD],
            ["name", "Uno"],
          ],
        },
      ],
      new Map(),
    )[0];
    renderWithProviders(<ItemInspector {...base} entry={clean} />);
    expect(screen.getByTestId("item-inspector-problems")).toHaveTextContent("None.");
    expect(screen.queryByTestId("item-inspector-undeclared")).toBeNull();
  });

  it("marks a blocking problem as one that blocks publishing", () => {
    const blocked = checkList(
      resolved.governing,
      [
        {
          ...item,
          tags: [
            ["d", "uno"],
            ["z", COORD],
          ],
        },
      ],
      new Map(),
    )[0];
    renderWithProviders(<ItemInspector {...base} entry={blocked} />);
    expect(blocked.check.problems.some((p) => p.blocking)).toBe(true);
    expect(screen.getByTestId("item-inspector-problems")).toHaveTextContent("blocks publishing");
  });

  it("copies the raw event from inside the panel", async () => {
    renderWithProviders(<ItemInspector {...base} entry={entry} />);
    await userEvent.click(screen.getByTestId("item-inspector-copy-raw"));
    expect(copyToClipboard).toHaveBeenCalledWith(JSON.stringify(entry.item, null, 2), {
      container: expect.any(HTMLElement),
    });
    const { container } = vi.mocked(copyToClipboard).mock.calls[0][1]!;
    expect(screen.getByTestId("item-inspector")).toContainElement(container as HTMLElement);
  });

  it("copies the id and the address, and reads Copied, then reverts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<ItemInspector {...base} entry={entry} />);
    await userEvent.click(screen.getByTestId("item-inspector-copy-id"));
    expect(copyToClipboard).toHaveBeenLastCalledWith(item.id, { container: expect.any(HTMLElement) });
    await waitFor(() => expect(screen.getByTestId("item-inspector-copy-id")).toHaveTextContent("Copied"));
    await userEvent.click(screen.getByTestId("item-inspector-copy-address"));
    expect(copyToClipboard).toHaveBeenLastCalledWith(`39999:${PUBKEY}:uno`, { container: expect.any(HTMLElement) });
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByTestId("item-inspector-copy-id")).not.toHaveTextContent("Copied");
  });

  it("reads Couldn't copy when the copy fails", async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    renderWithProviders(<ItemInspector {...base} entry={entry} />);
    await userEvent.click(screen.getByTestId("item-inspector-copy-raw"));
    await waitFor(() => expect(screen.getByTestId("item-inspector-copy-raw")).toHaveTextContent("Couldn't copy"));
  });

  it("offers no address to copy for an item with no d tag", () => {
    const noD = checkList(
      resolved.governing,
      [
        {
          ...item,
          tags: [
            ["z", COORD],
            ["name", "Uno"],
          ],
        },
      ],
      new Map(),
    )[0];
    renderWithProviders(<ItemInspector {...base} entry={noD} />);
    expect(screen.queryByTestId("item-inspector-copy-address")).toBeNull();
  });

  it("says so when the address names an item the list doesn't have", async () => {
    const onClose = vi.fn();
    renderWithProviders(<ItemInspector {...base} entry={null} onClose={onClose} />);
    expect(screen.getByTestId("item-inspector-missing")).toHaveTextContent("That item isn't on this list.");
    expect(screen.queryByTestId("item-inspector-raw")).toBeNull();
    expect(screen.queryByTestId("item-inspector-prev")).toBeNull();
    await userEvent.click(screen.getByTestId("item-inspector-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes once on the close button and once on Escape", async () => {
    const onClose = vi.fn();
    renderWithProviders(<ItemInspector {...base} entry={entry} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("item-inspector-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("draws nothing while closed", () => {
    renderWithProviders(<ItemInspector {...base} open={false} entry={entry} />);
    expect(screen.queryByTestId("item-inspector")).toBeNull();
  });

  it("steps to the next item, and stops at the ends", async () => {
    const onNext = vi.fn();
    renderWithProviders(<ItemInspector {...base} entry={entry} onPrev={null} onNext={onNext} />);
    expect(screen.getByTestId("item-inspector-prev")).toBeDisabled();
    await userEvent.click(screen.getByTestId("item-inspector-next"));
    expect(onNext).toHaveBeenCalled();
  });
});
