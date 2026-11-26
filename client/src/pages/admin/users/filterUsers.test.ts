import { describe, expect, it } from "vitest";
import type { AdminUserListItem } from "../types";
import { filterUsers, matchesKpiFilter } from "./filterUsers";
import { isNameSearch } from "./useUsersDirectory";

const pk = (i: number) => String(i).padStart(64, "0");
const user = (i: number, over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  pubkey: pk(i),
  ta_pubkey: null,
  times_calculated: 1,
  last_triggered: "",
  last_updated: "",
  latest_status: "success",
  latest_ta_status: "success",
  latest_algorithm: null,
  scheduling_id: null,
  scheduling_name: "",
  ...over,
});

describe("isNameSearch", () => {
  it("tells a name from a pubkey, a piece of one, or an npub", () => {
    expect(isNameSearch("alice")).toBe(true);
    expect(isNameSearch("  ")).toBe(false);
    expect(isNameSearch("npub1xyz")).toBe(false);
    expect(isNameSearch("deadbeef")).toBe(false);
    expect(isNameSearch("deadbee")).toBe(true);
  });
});

describe("matchesKpiFilter", () => {
  it("reads each header card off the latest run", () => {
    const scored = user(1);
    const failedRun = user(2, { latest_status: "failed", latest_ta_status: null });
    const failedPublish = user(3, { latest_ta_status: "error" });
    const waiting = user(4, { latest_status: "waiting", latest_ta_status: null });
    const all = [scored, failedRun, failedPublish, waiting];
    const pick = (f: Parameters<typeof matchesKpiFilter>[1]) =>
      all.filter((u) => matchesKpiFilter(u, f)).map((u) => parseInt(u.pubkey, 10));
    expect(pick("scored")).toEqual([1, 3]);
    expect(pick("sp_adopters")).toEqual([1]);
    expect(pick("queue")).toEqual([4]);
    expect(pick("failed")).toEqual([2, 3]);
  });
});

describe("filterUsers", () => {
  const pageUsers = [user(1), user(2)];
  const allUsers = [...pageUsers, user(3), user(4, { latest_status: "failed" })];
  const profiles = new Map([
    [pk(3), { name: "Carol" }],
    [pk(4), { name: "Dave" }],
  ]);

  it("is the backend's page for no search, or a pubkey search", () => {
    expect(filterUsers({ search: "", kpiFilter: null, allUsers, pageUsers, profiles })).toBe(pageUsers);
    expect(filterUsers({ search: "deadbeef", kpiFilter: null, allUsers, pageUsers, profiles })).toBe(pageUsers);
  });

  it("matches a name against every user, not only the page", () => {
    const rows = filterUsers({ search: " carol ", kpiFilter: null, allUsers, pageUsers, profiles });
    expect(rows.map((u) => u.pubkey)).toEqual([pk(3)]);
  });

  it("narrows every user by a header card's filter", () => {
    const rows = filterUsers({ search: "", kpiFilter: "failed", allUsers, pageUsers, profiles });
    expect(rows.map((u) => u.pubkey)).toEqual([pk(4)]);
  });
});
