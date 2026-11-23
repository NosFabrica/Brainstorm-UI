// @vitest-environment jsdom
/**
 * The kinds the app's root hands to search stand in for ListKindSearch's own,
 * which load on first draw: they must say the same about each kind, and a
 * part must become the real one once its chunk is here.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/items/ListKindSearch", () => ({
  KIND_PARTS: Object.fromEntries(
    ["places", "books", "github"].map((key) => [
      key,
      {
        Preview: () => null,
        Panel: () => null,
        PersonMark: () => null,
        Page: ({ query }: { query: string }) => <p data-testid="real-page">{`${key}: ${query}`}</p>,
        Warm: () => null,
        Suggestion: () => null,
      },
    ]),
  ),
}));

import { KIND_INFO, LIST_KINDS } from "./listKinds";

describe("the kinds the root hands to search", () => {
  it("are the kinds, in order, with the parts each one draws", () => {
    expect(LIST_KINDS.map((k) => [k.key, k.label, k.group, !!k.Panel, !!k.PersonMark])).toEqual([
      ["places", "Places", "Out & about", true, false],
      ["books", "Books", "Read & listen", false, false],
      ["github", "GitHub accounts", "Build", false, true],
    ]);
    expect(LIST_KINDS.map((k) => k.community)).toEqual(KIND_INFO.map((k) => k.community));
  });

  it("say they're reading until a kind's page arrives, then draw it", async () => {
    const Page = LIST_KINDS.find((k) => k.key === "books")!.Page;
    render(<Page query="dune" />);
    expect(screen.getByTestId("kind-page-loading")).toHaveTextContent("Reading the books…");
    expect(await screen.findByTestId("real-page")).toHaveTextContent("books: dune");
  });
});
