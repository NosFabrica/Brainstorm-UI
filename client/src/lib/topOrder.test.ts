import { describe, expect, it } from "vitest";
import { orderTopSections } from "./topOrder";

// The Top page's sections in the order the evidence puts them — never a
// fixed band per kind. What the words asked for leads; People lead only when
// the words read as a person; the rest rank by what came back; the weakest
// matches and Media close the page.
describe("orderTopSections", () => {
  const none = {};

  it("leads a topic search with what the words asked for, then the latest, then people", () => {
    expect(orderTopSections({ personQuery: false, counts: none })).toEqual([
      "kinds-lead",
      "lists",
      "kind",
      "kinds-follow",
      "latest",
      "people",
      "articles",
      "shop",
      "listen",
      "happening",
      "kinds-late",
      "media",
    ]);
  });

  it("leads with people when the words read as a person", () => {
    const order = orderTopSections({ personQuery: true, counts: none });
    expect(order[0]).toBe("people");
    expect(order.slice(1, 4)).toEqual(["kinds-lead", "lists", "kind"]);
  });

  it("ranks the middle sections by what came back, ties in their usual order", () => {
    const order = orderTopSections({
      personQuery: false,
      counts: { happening: 12, shop: 3, articles: 0, listen: 5 },
    });
    expect(order.slice(order.indexOf("people") + 1, order.indexOf("kinds-late"))).toEqual([
      "happening",
      "listen",
      "shop",
      "articles",
    ]);
    const tied = orderTopSections({ personQuery: false, counts: { shop: 2, articles: 2 } });
    expect(tied.indexOf("articles")).toBeLessThan(tied.indexOf("shop"));
  });

  it("always closes with the weakest matches and media", () => {
    const order = orderTopSections({ personQuery: true, counts: { media: 40, happening: 1 } });
    expect(order.slice(-2)).toEqual(["kinds-late", "media"]);
  });
});
