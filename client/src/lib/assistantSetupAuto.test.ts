/**
 * Which of the Assistant's setup tasks the app publishes by itself: its
 * profile, so it's live; the Duty Menu and the Assistant's Treasure Map, each
 * only when the relays have answered and it isn't up to date — and never a
 * Treasure Map its owner turned off.
 */
import { describe, expect, it } from "vitest";
import { autoSetupTasks, type AssistantView, type MapView, type MenuView } from "./assistantSetupAuto";

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

const liveOf = (over: Partial<AssistantView> = {}): AssistantView => ({
  taPubkey: "a".repeat(64),
  settled: true,
  live: true,
  ...over,
});
const tasks = (menu: MenuView, map: MapView, assistant: AssistantView = liveOf()) =>
  autoSetupTasks(menu, map, assistant);

describe("autoSetupTasks — the Assistant's profile", () => {
  // The server makes the Assistant's key at sign-in; publishing its profile is
  // what brings it to life, for every account — not only those made here.
  it("publishes the profile of an Assistant the relays have none for", () => {
    expect(tasks(menuOf(), mapOf(), liveOf({ live: false }))).toEqual(["assistant-profile"]);
  });

  it("never republishes over a profile that exists: it may have been edited elsewhere", () => {
    expect(tasks(menuOf(), mapOf(), liveOf())).toEqual([]);
  });

  it("waits for the server to name the Assistant, and for the relays to answer", () => {
    expect(tasks(menuOf(), mapOf(), liveOf({ live: false, taPubkey: null }))).toEqual([]);
    expect(tasks(menuOf(), mapOf(), liveOf({ live: false, settled: false }))).toEqual([]);
  });

  it("comes first when other tasks are due too", () => {
    expect(tasks(menuOf({ status: "missing" }), mapOf(), liveOf({ live: false }))).toEqual([
      "assistant-profile",
      "duty-menu",
    ]);
  });
});

describe("autoSetupTasks — the Duty Menu", () => {
  it("publishes a missing menu", () => {
    expect(tasks(menuOf({ status: "missing" }), mapOf())).toEqual(["duty-menu"]);
  });

  it("republishes an out-of-date menu", () => {
    expect(tasks(menuOf({ status: "out-of-date" }), mapOf())).toEqual(["duty-menu"]);
  });

  it("leaves an up-to-date menu alone", () => {
    expect(tasks(menuOf(), mapOf())).toEqual([]);
  });

  it("waits for the relays: nothing on a guess", () => {
    expect(tasks(menuOf({ status: "missing", settled: false }), mapOf())).toEqual([]);
    expect(tasks(menuOf({ status: null }), mapOf())).toEqual([]);
  });

  it("does nothing where the server can't publish one, or hasn't said yet", () => {
    expect(tasks(menuOf({ status: "missing", supported: false }), mapOf())).toEqual([]);
    expect(tasks(menuOf({ status: "missing", supported: undefined }), mapOf())).toEqual([]);
  });
});

describe("autoSetupTasks — the Assistant's Treasure Map", () => {
  it("turns on a Map that was never published", () => {
    const map = mapOf({ status: "missing", on: false, published: false });
    expect(tasks(menuOf(), map)).toEqual(["treasure-map"]);
  });

  it("updates a Map that is on and out of date", () => {
    expect(tasks(menuOf(), mapOf({ status: "out-of-date" }))).toEqual(["treasure-map"]);
  });

  it("leaves a Map its owner turned off: a version was published and the choice is off", () => {
    expect(tasks(menuOf(), mapOf({ status: "missing", on: false }))).toEqual([]);
    expect(tasks(menuOf(), mapOf({ status: "out-of-date", on: false }))).toEqual([]);
  });

  it("leaves an up-to-date Map alone", () => {
    expect(tasks(menuOf(), mapOf())).toEqual([]);
  });

  it("waits for the relays, and for a server that keeps Treasure Maps", () => {
    expect(tasks(menuOf(), mapOf({ status: "out-of-date", settled: false }))).toEqual([]);
    expect(tasks(menuOf(), mapOf({ status: "out-of-date", supported: false }))).toEqual([]);
  });

  it("names both when both are due, the Duty Menu first", () => {
    expect(tasks(menuOf({ status: "missing" }), mapOf({ status: "out-of-date" }))).toEqual([
      "duty-menu",
      "treasure-map",
    ]);
  });
});
