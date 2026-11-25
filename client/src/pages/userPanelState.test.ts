// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  agentStateKey,
  emptyAgentState,
  publishFailure,
  readAgentState,
  readPreviousScores,
  saveAgentState,
  savePreviousScores,
} from "./userPanelState";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

beforeEach(() => localStorage.clear());

describe("the Agent Suite's stored state", () => {
  it("is kept per identity", () => {
    saveAgentState(ALICE, { ...emptyAgentState(), name: "Alice's bot", status: "active" });
    expect(readAgentState(BOB, { soleIdentity: false })).toEqual(emptyAgentState());
    expect(readAgentState(ALICE, { soleIdentity: false })).toMatchObject({ name: "Alice's bot", status: "active" });
  });

  it("moves the old unkeyed row to the only identity on the device", () => {
    localStorage.setItem("brainstorm_agent_state", JSON.stringify({ name: "Mine", status: "active" }));
    expect(readAgentState(ALICE, { soleIdentity: true })).toMatchObject({ name: "Mine", status: "active" });
    expect(localStorage.getItem("brainstorm_agent_state")).toBeNull();
    expect(localStorage.getItem(agentStateKey(ALICE))).not.toBeNull();
  });

  it("drops the old row rather than guess whose it is when several identities are held", () => {
    localStorage.setItem("brainstorm_agent_state", JSON.stringify({ name: "Someone's", status: "active" }));
    expect(readAgentState(BOB, { soleIdentity: false })).toEqual(emptyAgentState());
    expect(localStorage.getItem("brainstorm_agent_state")).toBeNull();
  });

  it("keeps previous scores per identity", () => {
    savePreviousScores(ALICE, new Map([["x", 0.5]]));
    expect(readPreviousScores(BOB).size).toBe(0);
    expect(readPreviousScores(ALICE).get("x")).toBe(0.5);
  });
});

describe("publishFailure", () => {
  it("reports a missing endpoint or a network error as a failure, not an activation", () => {
    for (const message of ["Request failed (404)", "405 Method Not Allowed", "Failed to fetch", "NetworkError"]) {
      const out = publishFailure(new Error(message), "activate");
      expect(out.title).toBe("Activation failed");
      expect(out.description).toMatch(/wasn't activated/);
    }
    expect(publishFailure(new Error("Failed to fetch"), "update").title).toBe("Update failed");
  });
});
