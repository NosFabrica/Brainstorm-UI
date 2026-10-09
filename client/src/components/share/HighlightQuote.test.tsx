// @vitest-environment jsdom
/** A highlight's page: the passage marked in its paragraph, a window of it first, and the text it is from. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HighlightHero } from "./HighlightQuote";

vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
}));
vi.mock("@/lib/eventStore", async () => ({
  eventStore: (await import("@/test/fakeEventStore")).eventStoreDefaults,
}));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: () => Promise.resolve(null) }));

const PASSAGE = "A body does not get infected by contagion.";
const before = Array.from({ length: 80 }, (_, i) => `before${i}`).join(" ");
const after = Array.from({ length: 80 }, (_, i) => `after${i}`).join(" ");

describe("HighlightHero", () => {
  it("marks the passage in a window of its context, and opens the rest on a tap", () => {
    render(
      <HighlightHero
        event={{
          kind: 9802,
          content: PASSAGE,
          tags: [
            ["context", `${before} ${PASSAGE} ${after}`],
            ["r", "https://northerntracey.example/post"],
          ],
        }}
      />,
    );
    const passage = screen.getByTestId("highlight-passage");
    expect(passage.querySelector("mark")).toHaveTextContent(PASSAGE);
    expect(passage).toHaveTextContent("before79");
    expect(passage).not.toHaveTextContent("before0 ");
    expect(passage).not.toHaveTextContent("after79");
    fireEvent.click(screen.getByTestId("highlight-context-toggle"));
    expect(passage).toHaveTextContent("before0 ");
    expect(passage).toHaveTextContent("after79");
    expect(screen.getByTestId("highlight-source")).toHaveTextContent("Highlighted from");
  });

  it("a passage with no context stands alone; a book is its title and author", () => {
    render(
      <HighlightHero
        event={{
          kind: 9802,
          content: PASSAGE,
          tags: [
            ["title", "The Universal One"],
            ["author", "Walter Russell"],
            ["comment", "Read this"],
          ],
        }}
      />,
    );
    expect(screen.queryByTestId("highlight-context-toggle")).toBeNull();
    expect(screen.getByTestId("highlight-comment")).toHaveTextContent("Read this");
    expect(screen.getByTestId("highlight-work")).toHaveTextContent("The Universal OneWalter Russell");
  });
});
