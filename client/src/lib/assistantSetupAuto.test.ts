/**
 * Which of the Assistant's two setup tasks the app publishes by itself: the
 * Duty Menu and the Assistant's Treasure Map, each only when the relays have
 * answered and it isn't up to date — and never a Treasure Map its owner
 * turned off.
 */
import { describe, expect, it } from "vitest";
import { autoSetupTasks, type MapView, type MenuView } from "./assistantSetupAuto";

const menuOf = (over: Partial<MenuView> = {}): MenuView => ({
  supported: true,
  status: "current",
  settled: true,
  ...over,
});
const mapOf = (over: Partial<MapView> = {}): MapView => ({
  supported: true,
  status: "current",
  settled: true,
  on: true,
  published: true,
  ...over,
});

describe("autoSetupTasks — the Duty Menu", () => {
  it("publishes a missing menu", () => {
    expect(autoSetupTasks(menuOf({ status: "missing" }), mapOf())).toEqual(["duty-menu"]);
  });

  it("republishes an out-of-date menu", () => {
    expect(autoSetupTasks(menuOf({ status: "out-of-date" }), mapOf())).toEqual(["duty-menu"]);
  });

  it("leaves an up-to-date menu alone", () => {
    expect(autoSetupTasks(menuOf(), mapOf())).toEqual([]);
  });

  it("waits for the relays: nothing on a guess", () => {
    expect(autoSetupTasks(menuOf({ status: "missing", settled: false }), mapOf())).toEqual([]);
    expect(autoSetupTasks(menuOf({ status: null }), mapOf())).toEqual([]);
  });

  it("does nothing where the server can't publish one, or hasn't said yet", () => {
    expect(autoSetupTasks(menuOf({ status: "missing", supported: false }), mapOf())).toEqual([]);
    expect(autoSetupTasks(menuOf({ status: "missing", supported: undefined }), mapOf())).toEqual([]);
  });
});

describe("autoSetupTasks — the Assistant's Treasure Map", () => {
  it("turns on a Map that was never published", () => {
    const map = mapOf({ status: "missing", on: false, published: false });
    expect(autoSetupTasks(menuOf(), map)).toEqual(["treasure-map"]);
  });

  it("updates a Map that is on and out of date", () => {
    expect(autoSetupTasks(menuOf(), mapOf({ status: "out-of-date" }))).toEqual(["treasure-map"]);
  });

  it("leaves a Map its owner turned off: a version was published and the choice is off", () => {
    expect(autoSetupTasks(menuOf(), mapOf({ status: "missing", on: false }))).toEqual([]);
    expect(autoSetupTasks(menuOf(), mapOf({ status: "out-of-date", on: false }))).toEqual([]);
  });

  it("leaves an up-to-date Map alone", () => {
    expect(autoSetupTasks(menuOf(), mapOf())).toEqual([]);
  });

  it("waits for the relays, and for a server that keeps Treasure Maps", () => {
    expect(autoSetupTasks(menuOf(), mapOf({ status: "out-of-date", settled: false }))).toEqual([]);
    expect(autoSetupTasks(menuOf(), mapOf({ status: "out-of-date", supported: false }))).toEqual([]);
  });

  it("names both when both are due, the Duty Menu first", () => {
    expect(autoSetupTasks(menuOf({ status: "missing" }), mapOf({ status: "out-of-date" }))).toEqual([
      "duty-menu",
      "treasure-map",
    ]);
  });
});
