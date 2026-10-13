/**
 * A list's items as a table: searched, filtered, sorted and paged by the
 * query, sort and page it is handed, and reporting changes through callbacks.
 */
import { describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { EMPTY_QUERY, type CheckedItem } from "@/lib/listHealth";
import type { ItemCheck } from "@/lib/listCheck";
import { ItemTable } from "./ItemTable";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

/** An item's check, written out by hand: a title and summary, and the given problems. */
const check = (title: string | null, summary: string | null, blocking: boolean[] = []): ItemCheck => ({
  problems: blocking.map((b, i) => ({
    code: "not-a-url",
    field: `field${i}`,
    message: "Not a URL.",
    blocking: b,
  })),
  resolved: {
    title,
    titleField: title ? "name" : null,
    summary,
    summaryField: summary ? "summary" : null,
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
    links: [],
  },
});

/** Noon UTC on 14 Nov 2023, so a date reads the same in any time zone. */
const NOON = Date.UTC(2023, 10, 14, 12) / 1000;

/** 120 items, curators alternating, every third problem-free; the third (index 2) has no title. */
const rows: CheckedItem[] = Array.from({ length: 120 }, (_, i) => ({
  item: {
    id: `item${String(i).padStart(3, "0")}`.padEnd(64, "0"),
    pubkey: i % 2 === 0 ? A : B,
    kind: 39999,
    created_at: NOON + i * 86_400,
    tags: [],
    content: "",
    sig: "",
  },
  check: check(
    i === 2 ? null : `Place ${i}`,
    i === 2 ? null : `About place ${i}`,
    i % 3 === 0 ? [] : i % 3 === 1 ? [false] : [true, false],
  ),
}));

const base = {
  query: EMPTY_QUERY,
  sort: "newest" as const,
  page: 1,
  singular: "Place",
  curators: [
    { pubkey: A, name: "Mise" },
    { pubkey: B, name: "Other" },
  ],
  onQuery: () => {},
  onSort: () => {},
  onPage: () => {},
  onOpen: () => {},
};

/** A row's problems chip, found by the words it carries for a screen reader. */
const problemsChip = (row: HTMLElement) => within(row).getByText(/^problems?\b/).parentElement!;

describe("ItemTable", () => {
  it("shows fifty rows a page and says where it is", async () => {
    const onPage = vi.fn();
    renderWithProviders(
      <ItemTable {...base} rows={rows} total={7954} query={{ ...EMPTY_QUERY, text: "a" }} page={2} onPage={onPage} />,
    );
    expect(screen.getAllByTestId("item-table-row")).toHaveLength(50);
    expect(screen.getByTestId("item-table-count")).toHaveTextContent(
      "Showing 51 to 100 of 120 matching, 7,954 on the list.",
    );
    await userEvent.click(screen.getByTestId("item-table-next"));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it("says the plain count when nothing is filtered, and disables the ends of the pager", async () => {
    const onPage = vi.fn();
    const { rerender } = renderWithProviders(<ItemTable {...base} rows={rows} total={120} onPage={onPage} />);
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 1 to 50 of 120.");
    expect(screen.getByTestId("item-table-prev")).toBeDisabled();
    expect(screen.getByTestId("item-table-next")).toBeEnabled();
    rerender(<ItemTable {...base} rows={rows} total={120} page={3} onPage={onPage} />);
    expect(screen.getByTestId("item-table-count")).toHaveTextContent("Showing 101 to 120 of 120.");
    expect(screen.getByTestId("item-table-next")).toBeDisabled();
    await userEvent.click(screen.getByTestId("item-table-prev"));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("says matching for a filter every item passes, so pressing it shows", () => {
    renderWithProviders(
      <ItemTable {...base} rows={rows} total={120} query={{ ...EMPTY_QUERY, problem: "repeated:g" }} />,
    );
    expect(screen.getByTestId("item-table-count")).toHaveTextContent(
      "Showing 1 to 50 of 120 matching, 120 on the list.",
    );
  });

  it("counts the items as read, not as the list, when the read may be short of it", () => {
    const { rerender } = renderWithProviders(<ItemTable {...base} rows={rows} total={120} partial />);
    expect(screen.getByTestId("item-table-count").textContent).toBe("Showing 1 to 50 of 120 read.");
    rerender(<ItemTable {...base} rows={rows} total={7954} query={{ ...EMPTY_QUERY, text: "a" }} page={2} partial />);
    expect(screen.getByTestId("item-table-count").textContent).toBe("Showing 51 to 100 of 120 matching, 7,954 read.");
  });

  it("shows the problem it is filtered to, and takes the filter off", async () => {
    const onQuery = vi.fn();
    const query = { ...EMPTY_QUERY, text: "cafe", problem: "link-unusable:website" };
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} query={query} onQuery={onQuery} />);
    expect(screen.getByTestId("item-table-problem-filter").textContent).toBe("Problem: link-unusable:website");
    await userEvent.click(screen.getByRole("button", { name: "Remove problem filter" }));
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(onQuery).toHaveBeenCalledWith({ ...query, problem: null });
  });

  it("shows no problem filter when it is filtered to none", () => {
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} query={{ ...EMPTY_QUERY, text: "cafe" }} />);
    expect(screen.queryByTestId("item-table-problem-filter")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove problem filter" })).toBeNull();
  });

  it("names an item with no title by its kind", () => {
    renderWithProviders(<ItemTable {...base} rows={rows.slice(2, 3)} total={1} singular="Place" />);
    expect(screen.getByTestId("item-table-row")).toHaveTextContent("Untitled Place");
  });

  it("shows each item's summary, curator by name, date and problem count", () => {
    renderWithProviders(<ItemTable {...base} rows={[rows[1], rows[2]]} total={2} />);
    const [one, two] = screen.getAllByTestId("item-table-row");
    expect(one).toHaveTextContent("Place 1");
    expect(one).toHaveTextContent("About place 1");
    expect(one).toHaveTextContent("Other");
    expect(one).toHaveTextContent("Nov 15, 2023");
    expect(problemsChip(one)).toHaveTextContent(/^1\b/);
    expect(problemsChip(two)).toHaveTextContent(/^2\b/);
  });

  it("says a row's problem count in words a screen reader gets, and whether any blocks publishing", () => {
    renderWithProviders(<ItemTable {...base} rows={[rows[1], rows[2]]} total={2} />);
    const [one, two] = screen.getAllByTestId("item-table-row");
    expect(problemsChip(one).textContent).toBe("1 problem");
    expect(problemsChip(two).textContent).toBe("2 problems, blocks publishing");
    // The words are for a screen reader: what shows is the count.
    expect(within(one).getByText("problem")).toHaveClass("sr-only");
    expect(within(two).getByText("problems, blocks publishing")).toHaveClass("sr-only");
    expect(problemsChip(one)).not.toHaveAttribute("aria-label");
  });

  it("shows no problems chip for a clean item, and a short key for a curator it was not told of", () => {
    renderWithProviders(
      <ItemTable {...base} rows={[{ ...rows[0], item: { ...rows[0].item, pubkey: C } }]} total={1} />,
    );
    const row = screen.getByTestId("item-table-row");
    expect(within(row).queryByText(/problem/)).toBeNull();
    expect(row).toHaveTextContent(`${C.slice(0, 12)}…`);
  });

  it("typing searches, and a row opens its item", async () => {
    const onQuery = vi.fn();
    const onOpen = vi.fn();
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} onQuery={onQuery} onOpen={onOpen} />);
    await userEvent.type(screen.getByTestId("item-table-search"), "z");
    expect(onQuery).toHaveBeenLastCalledWith({ ...EMPTY_QUERY, text: "z" });
    await userEvent.click(screen.getAllByTestId("item-table-row")[0]);
    expect(onOpen).toHaveBeenCalledWith(rows[0].item.id);
  });

  it("a row opens from the keyboard", async () => {
    const onOpen = vi.fn();
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: "Place 0" });
    act(() => button.focus());
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(rows[0].item.id);
  });

  it("the problems toggle sets the query", async () => {
    const onQuery = vi.fn();
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} onQuery={onQuery} />);
    await userEvent.click(screen.getByTestId("item-table-only-problems"));
    expect(onQuery).toHaveBeenCalledWith({ ...EMPTY_QUERY, onlyProblems: true });
  });

  it("says when nothing matches, and offers to clear", async () => {
    const onQuery = vi.fn();
    renderWithProviders(
      <ItemTable {...base} rows={[]} total={120} query={{ ...EMPTY_QUERY, text: "zzz" }} onQuery={onQuery} />,
    );
    expect(screen.getByTestId("item-table-empty")).toHaveTextContent("No items match.");
    expect(screen.queryByTestId("item-table-count")).toBeNull();
    expect(screen.queryByTestId("item-table-next")).toBeNull();
    await userEvent.click(screen.getByTestId("item-table-clear"));
    expect(onQuery).toHaveBeenCalledWith(EMPTY_QUERY);
  });

  it("offers no clear while the query is empty", () => {
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} />);
    expect(screen.queryByTestId("item-table-clear")).toBeNull();
  });

  it("leaves the curator filter out when there is one curator", () => {
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} curators={[{ pubkey: A, name: "Mise" }]} />);
    expect(screen.queryByTestId("item-table-curator")).toBeNull();
  });

  it("offers the curator filter and the sort when there are two curators", () => {
    renderWithProviders(<ItemTable {...base} rows={rows} total={120} />);
    expect(screen.getByTestId("item-table-curator")).toBeInTheDocument();
    expect(screen.getByTestId("item-table-sort")).toHaveTextContent("Newest");
  });
});
