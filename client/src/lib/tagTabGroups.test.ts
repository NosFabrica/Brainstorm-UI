import { describe, expect, it } from "vitest";
import { groupOf } from "./tagTabGroups";

const PK = "a".repeat(64);
const GITHUB = `39998:${"b".repeat(64)}:github-accounts`;
const ev = (kind: number, tags: string[][] = []) => ({ id: "1".repeat(64), kind, pubkey: PK, tags, content: "" });

describe("groupOf", () => {
  it("is People for a profile, a list item's list, and any other kind by its name", () => {
    expect(groupOf(ev(0))).toEqual({ key: "person", name: "People" });
    expect(
      groupOf(
        ev(39999, [
          ["d", "vcavallo"],
          ["z", GITHUB],
        ]),
      ),
    ).toEqual({ key: GITHUB, name: "github-accounts", header: GITHUB });
    expect(groupOf(ev(1))).toEqual({ key: "kind:Note", name: "Notes" });
  });

  it("names an item filed under no list by its kind", () => {
    expect(groupOf(ev(39999, [["d", "x"]])).header).toBeUndefined();
  });
});
