/**
 * A list item's page is named for the item, not for whoever listed it: the
 * tab says "vitorpamplona · GitHub Account", never the lister's name.
 */
import { describe, expect, it } from "vitest";
import { itemPageTitle } from "./itemPageTitle";

describe("itemPageTitle", () => {
  it("is the item's title and what it is", () => {
    expect(itemPageTitle({ title: "vitorpamplona" }, "GitHub Account")).toBe("vitorpamplona · GitHub Account");
    expect(itemPageTitle({ title: "Il Sole Italian Food" }, "Food and Drink Place")).toBe(
      "Il Sole Italian Food · Food and Drink Place",
    );
  });
  it("an untitled item is named for what it is alone", () => {
    expect(itemPageTitle({ title: null }, "Book")).toBe("Untitled book");
    expect(itemPageTitle({ title: "  " }, "Book")).toBe("Untitled book");
  });
});
