import { describe, expect, it } from "vitest";
import { definitionOf, type HeaderEvent } from "./conceptResolution";
import { itemD, itemProblems, itemTemplate, randomTail, titleFieldOf } from "./listItem";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const places = definitionOf({
  id: "h".repeat(64),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  tags: [
    ["d", "food-and-drink-places"],
    ["names", "Food and Drink Place", "Food and Drink Places"],
    ["required", "name"],
    ["required", "category"],
    ["recommended", "address"],
    ["optional", "website"],
    ["display", "title", "name"],
  ],
} as HeaderEvent);

describe("itemTemplate", () => {
  it("is a 39999 filed under the list, its fields in the list's order, then any others", () => {
    const t = itemTemplate(
      places,
      {
        website: "https://wolfs.example",
        phone: "+1 504",
        name: "Wolf's Burger Truck",
        category: "restaurant",
        address: " ",
      },
      "a1b2c3d4",
    );
    expect(t).toEqual({
      kind: 39999,
      content: "",
      tags: [
        ["d", "wolf-s-burger-truck-a1b2c3d4"],
        ["z", `39998:${AVI}:food-and-drink-places`],
        ["name", "Wolf's Burger Truck"],
        ["category", "restaurant"],
        ["website", "https://wolfs.example"],
        ["phone", "+1 504"],
        ["alt", "Food and Drink Place: Wolf's Burger Truck"],
      ],
    });
  });

  it("files under a 9998 by its id, even when it carries a d", () => {
    const id = "9".repeat(64);
    const nines = definitionOf({
      id,
      pubkey: AVI,
      kind: 9998,
      created_at: 1,
      tags: [
        ["d", "nines"],
        ["names", "Nine", "Nines"],
        ["required", "name"],
      ],
    } as HeaderEvent);
    expect(itemTemplate(nines, { name: "Ninth" }, "a1b2c3d4").tags).toContainEqual(["z", id]);
  });

  it("titles its d by the list's title field, with a random tail so it never replaces another item", () => {
    expect(titleFieldOf(places)).toBe("name");
    expect(itemD("", "00ff00ff")).toBe("item-00ff00ff");
    expect(itemD("A".repeat(80), "00ff00ff")).toBe(`${"a".repeat(48)}-00ff00ff`);
    expect(randomTail()).toMatch(/^[0-9a-f]{8}$/);
    expect(randomTail()).not.toBe(randomTail());
  });
});

describe("itemProblems", () => {
  it("names the fields the list requires that are empty", () => {
    expect(itemProblems(places, { name: "Wolf's" })).toEqual(["Food and Drink Places require category."]);
    expect(itemProblems(places, { name: "Wolf's", category: "restaurant" })).toEqual([]);
  });
});
