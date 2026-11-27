import { describe, expect, it } from "vitest";
import type { AdminBillingSubscription } from "@/services/api";
import { filterAndSort } from "./rosterFilter";

const pk = (c: string) => c.repeat(64);
const sub = (c: string, over: Partial<AdminBillingSubscription> = {}): AdminBillingSubscription => ({
  pubkey: pk(c),
  flash_status: "active",
  scheduling_source: "billing",
  billing_blocked: false,
  ...over,
});

const items = [
  sub("a", {
    granted_scheduling_name: "Priority",
    next_billing_date: "2026-12-03",
    current_period_end: "2026-12-03",
    last_synced_at: "2026-11-20T10:00:00Z",
  }),
  sub("b", { flash_status: "past_due", scheduling_source: "admin", scheduling_name: "Free" }),
  sub("c", {
    next_billing_date: "2026-12-01",
    current_period_end: "2026-12-01",
    last_synced_at: "2026-11-21T10:00:00Z",
  }),
];
const profiles = new Map([
  [pk("a"), { name: "Alice" }],
  [pk("b"), { name: "Bob" }],
]);
const serviceOf = new Map<string, string | null | undefined>([
  [pk("a"), "svc-prod"],
  [pk("b"), "svc-staging"],
  [pk("c"), undefined],
]);
const serviceLabelOf = (id: string | null | undefined) =>
  id === "svc-prod" ? "Production" : id === "svc-staging" ? "Staging" : "";
const run = (
  search = "",
  status = "all",
  source = "all",
  service = "all",
  sort: Parameters<typeof filterAndSort>[8] = null,
) =>
  filterAndSort(items, profiles, search, status, source, service, serviceOf, serviceLabelOf, sort).map((s) =>
    s.pubkey.charAt(0),
  );

describe("filterAndSort", () => {
  it("keeps the order and everyone with nothing set", () => {
    expect(run()).toEqual(["a", "b", "c"]);
  });

  it("searches name, npub, pubkey, tier and service", () => {
    expect(run("ali")).toEqual(["a"]);
    expect(run("priority")).toEqual(["a"]);
    expect(run("free")).toEqual(["b"]);
    expect(run("staging")).toEqual(["b"]);
    expect(run("cccc")).toEqual(["c"]);
  });

  it("filters exactly; a row whose service is still loading isn't on the chosen one", () => {
    expect(run("", "past_due")).toEqual(["b"]);
    expect(run("", "all", "billing")).toEqual(["a", "c"]);
    expect(run("", "all", "all", "svc-prod")).toEqual(["a"]);
  });

  it("sorts either way", () => {
    expect(run("", "all", "all", "all", { key: "subscriber", dir: "desc" })).toEqual(["c", "b", "a"]);
    expect(run("", "all", "all", "all", { key: "nextbill", dir: "asc" })).toEqual(["c", "a", "b"]);
    expect(run("", "all", "all", "all", { key: "nextbill", dir: "desc" })).toEqual(["a", "c", "b"]);
  });

  it("sinks a missing date to the bottom whichever way the column sorts", () => {
    for (const key of ["period", "nextbill", "synced"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        expect(run("", "all", "all", "all", { key, dir }).at(-1), `${key} ${dir}`).toBe("b");
      }
    }
  });
});
