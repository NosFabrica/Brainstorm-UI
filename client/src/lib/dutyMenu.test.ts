/**
 * An Assistant's Duty Menu read by duty-menus.md — what counts as a menu (§ 6.1),
 * which rows a reader keeps (§ 5) — and set against what the server offers.
 */
import { describe, expect, it } from "vitest";
import { DUTY_MENU_HEADER } from "@/config/assistants";
import { categoryOf, isDutyMenu, menuKey, menuRows, menuStatus, offerRows, parseDutyMenuOffer } from "./dutyMenu";

const BS = "b5".repeat(32);
const SCORES = "wss://scores.example";
const DCOSL = "wss://dcosl.brainstorm.world";

const menu = (rows: string[][], extra: string[][] = [], pubkey = BS) => ({
  kind: 39999,
  pubkey,
  tags: [["d", "duty-menu"], ["z", DUTY_MENU_HEADER], ["p", BS], ...extra, ...rows],
});
const OFFER = offerRows([
  ["30382:rank", SCORES],
  ["30392", SCORES],
  ["39998", DCOSL],
  ["39999", DCOSL],
]);

describe("what counts as a menu (§ 6.1)", () => {
  it("is kind 39999, d=duty-menu, one p that is the author, and Nous' z", () => {
    expect(isDutyMenu(menu([]), BS)).toBe(true);
    expect(isDutyMenu(menu([], [["z", "39998:other:thing"]]), BS)).toBe(true);
  });

  it("isn't, without any one of those, or with a list or concept-header z", () => {
    const m = menu([]);
    expect(isDutyMenu({ ...m, kind: 39998 }, BS)).toBe(false);
    expect(isDutyMenu({ ...m, tags: m.tags.map((t) => (t[0] === "d" ? ["d", "menu"] : t)) }, BS)).toBe(false);
    expect(isDutyMenu({ ...m, tags: m.tags.filter((t) => t[0] !== "z") }, BS)).toBe(false);
    expect(isDutyMenu(menu([], [["p", "c".repeat(64)]]), BS)).toBe(false);
    expect(isDutyMenu(menu([], [["z", "list"]]), BS)).toBe(false);
    expect(isDutyMenu(menu([], [["z", `39998:${"a".repeat(64)}:concept-header`]]), BS)).toBe(false);
    expect(isDutyMenu(menu([], [], "c".repeat(64)), BS)).toBe(false);
    expect(isDutyMenu(m, "c".repeat(64))).toBe(false);
    expect(isDutyMenu(null, BS)).toBe(false);
  });
});

describe("the rows a reader keeps (§ 5)", () => {
  it("normalizes keys and relays, and the first row per key wins", () => {
    expect(
      menuRows(
        menu([
          ["duty", "39998:dlist-header", "wss://dcosl.brainstorm.world/"],
          ["duty", "39998", "wss://elsewhere.example"],
          ["duty", "30396:tag::", "wss://lists.example"],
          ["not-offered", "30382:hops"],
        ]),
      ),
    ).toEqual([
      { tag: "duty", key: "39998", relay: "wss://dcosl.brainstorm.world/" },
      { tag: "duty", key: "30396:tag", relay: "wss://lists.example/" },
      { tag: "not-offered", key: "30382:hops", relay: null },
    ]);
  });

  it("drops a duty with no relay, a key that doesn't parse, and a Concept kind with a colon alone", () => {
    expect(
      menuRows(
        menu([
          ["duty", "30382:rank"],
          ["duty", "30382:followers", "https://not-a-relay.example"],
          ["duty", "rank", SCORES],
          ["duty", "39998:", DCOSL],
          ["duty", "39999:", DCOSL],
        ]),
      ),
    ).toEqual([]);
    expect(menuKey("39999:dog-breed")).toBe("39999:dog-breed");
  });
});

describe("the published menu against the offer", () => {
  const rows = OFFER.map((r) => [r.tag, r.key, r.relay!]);

  it("is missing when there is none, or it isn't a menu", () => {
    expect(menuStatus(OFFER, null, BS)).toBe("missing");
    expect(menuStatus(OFFER, { ...menu(rows), kind: 1 }, BS)).toBe("missing");
  });

  it("is current with the same rows, in any order", () => {
    expect(menuStatus(OFFER, menu(rows), BS)).toBe("current");
    expect(menuStatus(OFFER, menu([...rows].reverse()), BS)).toBe("current");
  });

  it("is out of date with a row missing, one extra, or one at another relay", () => {
    expect(menuStatus(OFFER, menu(rows.slice(1)), BS)).toBe("out-of-date");
    expect(menuStatus(OFFER, menu([...rows, ["duty", "30393", SCORES]]), BS)).toBe("out-of-date");
    expect(
      menuStatus(OFFER, menu(rows.map((r) => (r[1] === "30392" ? ["duty", "30392", "wss://lists.example"] : r))), BS),
    ).toBe("out-of-date");
    expect(menuStatus(OFFER, menu([...rows, ["not-offered", "30383"]]), BS)).toBe("out-of-date");
  });

  it("names each row's category as the Treasure Map reads its key", () => {
    expect(["30382:rank", "30392", "39998", "39999", "*", "3038x"].map(categoryOf)).toEqual([
      "Scores",
      "Lists",
      "Concepts",
      "Concepts",
      "Everything",
      "Scores",
    ]);
  });
});

describe("the server's offer", () => {
  it("is an answer with a 64-hex assistant and rows", () => {
    expect(parseDutyMenuOffer({ assistant: BS.toUpperCase(), rows: [["30392", SCORES]] })).toEqual({
      assistant: BS,
      rows: [["30392", SCORES]],
    });
  });

  it("isn't what GET /user/{pubkey} answers for this path on a server without the route", () => {
    // Staging and production, 2026-10-27: the path read as a pubkey.
    const caught = { followed_by: [], following: [], muted_by: [], muting: [], influence: null };
    expect(parseDutyMenuOffer(caught)).toBeNull();
    expect(parseDutyMenuOffer({ assistant: "nope", rows: [] })).toBeNull();
    expect(parseDutyMenuOffer({ assistant: BS })).toBeNull();
    expect(parseDutyMenuOffer(null)).toBeNull();
  });
});
