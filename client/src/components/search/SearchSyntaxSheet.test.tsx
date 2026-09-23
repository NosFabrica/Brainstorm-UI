// @vitest-environment jsdom
/**
 * The syntax sheet is the grammar's documentation, and it has to say the same things the
 * parser does — a token in one and not the other is the two drifting apart. These tests read
 * the sheet back against `lib/searchQuery`, not against a hand-written list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SearchSyntaxSheet, useSyntaxSheetShortcut } from "./SearchSyntaxSheet";
import { parseQuery } from "@/lib/searchQuery";

beforeEach(cleanup);

const sheetText = () => {
  render(<SearchSyntaxSheet open onOpenChange={() => {}} />);
  return screen.getByTestId("search-syntax-sheet").textContent ?? "";
};

describe("the syntax sheet", () => {
  it("documents every prefix the parser lifts out of a query", () => {
    const text = sheetText();
    for (const token of [
      "from:", "to:", "since:", "until:", "label:", "group:",
      "site:", "isbn:", "doi:", "geo:", "isan:",
      "podcast:guid:", "podcast:item:guid:", "podcast:publisher:",
      "sort:recent", "sort:rank", "sort:followers", "sort:text",
      "observer:", "include:spam", "filter:rank:gte:",
      "trust:verified", "reach:follows",
      "kind:", "spec:",
      '"exact phrase"', "-word",
    ]) {
      expect(text).toContain(token);
    }
  });

  it("every example it prints is a query the parser actually understands", () => {
    // The combined example at the foot of the sheet, as somebody would copy it.
    const q = parseQuery("#nostr from:npub1x since:2026-01-01 sort:recent");
    expect(q.hashtags).toEqual(["nostr"]);
    expect(q.since).not.toBeNull();
    expect(q.sort).toBe("recent");
    const scopes = parseQuery(
      "site:example.com/page isbn:9780593330005 doi:10.1000/182 geo:u4pruyd isan:0000-0000-401A-0000-7",
    );
    expect(scopes.scopes).toHaveLength(5);
    expect(scopes.terms).toBe("");
  });

  it("names the kinds it documents, rather than printing their numbers alone", () => {
    const text = sheetText();
    expect(text).toContain("30023");
    // `spec:` is in the sheet as the WORD, because that is how it is typed.
    expect(parseQuery("spec:").kinds).toEqual([30817]);
    expect(parseQuery("kind:30023").kinds).toEqual([30023]);
  });

  it("says which two tokens never reach the relay", () => {
    const text = sheetText();
    expect(text).toContain("Only on this page");
    expect(parseQuery("gm trust:verified reach:follows").terms).toBe("gm");
  });
});

describe("the ? shortcut", () => {
  function Host() {
    const open = vi.fn();
    (Host as unknown as { open: typeof open }).open = open;
    useSyntaxSheetShortcut(open);
    return (
      <>
        <input data-testid="an-input" />
        <div contentEditable data-testid="a-box" suppressContentEditableWarning />
      </>
    );
  }

  it("opens the sheet from anywhere on the page", () => {
    render(<Host />);
    fireEvent.keyDown(document.body, { key: "?" });
    expect((Host as unknown as { open: ReturnType<typeof vi.fn> }).open).toHaveBeenCalled();
  });

  it("stays out of the way while somebody is typing — ? is a character first", () => {
    render(<Host />);
    const open = (Host as unknown as { open: ReturnType<typeof vi.fn> }).open;
    fireEvent.keyDown(screen.getByTestId("an-input"), { key: "?" });
    fireEvent.keyDown(screen.getByTestId("a-box"), { key: "?" });
    expect(open).not.toHaveBeenCalled();
  });
});
