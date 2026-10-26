import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { problemsOf } from "./checkSet.mjs";

const CITIES = ["Chicago", "Funchal"];
const entry = (id, journey, o = {}) => ({
  id,
  query: o.agent ? { categories: ["places"], words: [] } : `query ${id}`,
  class: o.agent ? "agent" : (o.class ?? "recommendation"),
  journey,
  expect: { categories: ["places"], ...(o.place || o.time ? { filters: { place: o.place, time: o.time } } : {}) },
  notes: "Why.",
  ...(o.agent ? { run: false } : {}),
});
/** Ten entries: M2 three (30%), M3 two (20%), each journey with an agent entry and both cities. */
const valid = () => ({
  version: "v1",
  entries: [
    entry("m2-a", "M2", { place: "Chicago" }),
    entry("m2-b", "M2", { place: "Funchal" }),
    entry("m2-agent", "M2", { agent: true }),
    entry("m3-a", "M3", { place: "Chicago", time: "upcoming" }),
    entry("m3-b", "M3", { place: "Funchal", time: "this weekend", agent: true }),
    entry("m1-a", "M1", { class: "navigational" }),
    entry("m1-b", "M1", { class: "lookup" }),
    entry("m4-a", "M4", { class: "social" }),
    entry("m5-a", "M5", { class: "exploratory" }),
    entry("m7-a", "M7"),
  ],
});
const problems = (set) => problemsOf(set, { demoCities: CITIES });

describe("problemsOf (the labelled set's shape, ADR 0008's shares)", () => {
  it("finds nothing wrong with a set that holds", () => {
    expect(problems(valid())).toEqual([]);
  });

  it("finds a repeated id", () => {
    const set = valid();
    set.entries[1].id = "m2-a";
    expect(problems(set)).toContain("m2-a: the id is used more than once");
  });

  it("finds an entry that breaks the schema", () => {
    const set = valid();
    delete set.entries[0].notes;
    set.entries[5].class = "guess";
    set.entries[6].expect.categories = [];
    set.entries[3].expect.filters.time = "soonish";
    expect(problems(set)).toEqual(
      expect.arrayContaining([
        "m2-a: no notes",
        "m1-a: class guess is not one of the classes",
        "m1-b: expect.categories is empty",
        "m3-a: time soonish is not a phrase the runner scores",
      ]),
    );
  });

  it("finds an id that does not start with its journey", () => {
    const set = valid();
    set.entries[7].id = "m5-misfiled";
    expect(problems(set)).toContain("m5-misfiled: an M4 entry's id should start with m4-");
  });

  it("finds M2 or M3 outside its share", () => {
    const set = valid();
    set.entries.push(entry("m2-c", "M2"), entry("m2-d", "M2"));
    expect(problems(set)).toContain("M2 is 42% of the set; ADR 0008 keeps it between 25% and 35%");
    const thin = valid();
    thin.entries = thin.entries.filter((e) => e.id !== "m3-a");
    expect(problems(thin).some((p) => p.startsWith("M3 is 11% of the set"))).toBe(true);
  });

  it("finds a demo city with no M2 or no M3 entry", () => {
    const set = valid();
    set.entries.find((e) => e.id === "m3-b").expect.filters.place = "Lisbon";
    expect(problems(set)).toContain("Funchal has no M3 entry");
  });

  it("finds M2 or M3 without an agent entry", () => {
    const set = valid();
    set.entries = set.entries.filter((e) => e.id !== "m2-agent");
    set.entries.push(entry("m2-c", "M2"));
    expect(problems(set)).toContain("M2 has no agent entry");
  });

  it("finds nothing wrong with the set as committed", () => {
    const set = JSON.parse(readFileSync(resolve(process.cwd(), "docs/search/eval/queries.json"), "utf8"));
    expect(problemsOf(set)).toEqual([]);
  });
});
