// @vitest-environment jsdom
/**
 * The setup model's Activate step and the Trusted Lists update. An activated
 * account whose 10040 doesn't name its lists yet has an UPDATE to publish, not
 * a setup step to redo (Benjamin, 2026-09-18: repeating the setup ask reads as
 * "something broke") — so it's flagged apart and never counted as a step.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const ME = "a".repeat(64);
const TA = "b".repeat(64);
const LISTS = { key: TA, relay: "wss://nip85-staging.example" };
const state = vi.hoisted(() => ({
  provider: "brainstorm" as string | undefined,
  activated: true,
  lists: undefined as undefined | { status: string; designation: unknown },
  dm: "stopped" as string,
  /** The Duty Menu: unsupported unless a test says otherwise. */
  menu: { supported: false as boolean | undefined, status: null as string | null, settled: true },
  /** The Assistant's Treasure Map: unsupported unless a test says otherwise. */
  selfMap: {
    supported: false as boolean | undefined,
    status: null as string | null,
    settled: true,
    error: null as Error | null,
  },
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "has-follows" }));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({ useTrustProviderStatus: () => ({ data: state.provider }) }));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: state.lists }) }));
vi.mock("@/lib/followStore", () => ({ knownFollowCount: () => 3 }));
vi.mock("@/lib/nip85Activation", () => ({ isNip85Activated: () => state.activated }));
vi.mock("@/hooks/useDirectMessages", () => ({ useDmStatus: () => state.dm }));
vi.mock("@/hooks/useAssistantDutyMenu", () => ({ useAssistantDutyMenu: () => state.menu }));
vi.mock("@/hooks/useAssistantTreasureMap", () => ({ useAssistantTreasureMap: () => state.selfMap }));

import { useFinishSetup } from "./useFinishSetup";

describe("useFinishSetup — the Activate step and Trusted Lists", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
    state.menu = { supported: false, status: null, settled: true };
    state.selfMap = { supported: false, status: null, settled: true };
  });

  it("an activated account with lists to add stays activated, with an update flagged apart", () => {
    state.lists = { status: "missing", designation: LISTS };
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.activatePending).toBe(false);
    expect(result.current.listsPending).toBe(true);
    expect(result.current.remaining).toBe(0);
    expect(result.current.doneCount).toBe(3);
    expect(result.current.totalSteps).toBe(3);
  });

  /**
   * The two circumstances, told apart: no declaration at all is the Activate
   * step, not an update. Someone who never activated must never be shown the
   * update pill, however many lists are waiting for them.
   */
  it("someone with no declaration yet is asked to activate, not to update", () => {
    state.provider = "none";
    state.activated = false;
    state.lists = { status: "missing", designation: LISTS };

    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activatePending).toBe(true);
    expect(result.current.listsPending).toBe(false);
    expect(result.current.remaining).toBe(1);
  });

  /**
   * Another Assistant on the rank duty is their choice: the step is done and
   * nothing nags. Handing the duty to Brainstorm is an optional extra, and the
   * lists update waits until Brainstorm's Assistant is theirs.
   */
  it("another Assistant on rank counts as done, with the switch as an optional extra", () => {
    state.provider = "other";
    state.activated = false;
    state.lists = { status: "missing", designation: LISTS };

    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.activatePending).toBe(false);
    expect(result.current.scoresElsewhere).toBe(true);
    expect(result.current.remaining).toBe(0);
    expect(result.current.optionalRemaining).toBe(1);
    expect(result.current.listsPending).toBe(false);
  });

  it.each(["declared", "none"])("lists %s leave activation done", (status) => {
    state.lists = { status, designation: LISTS };
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.activatePending).toBe(false);
    expect(result.current.listsPending).toBe(false);
  });
});

/**
 * Messages is an optional extra: counted apart, for the account menu's row, and
 * never a step — so the pill, the page's "N of 3" and "You're all set" stay put.
 */
describe("useFinishSetup — optional extras", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
  });

  it("counts messages once the engine has found no inbox list", () => {
    state.dm = "no-inbox";
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.messages).toBe("off");
    expect(result.current.optionalRemaining).toBe(1);
    expect(result.current.remaining).toBe(0);
    expect(result.current.doneCount).toBe(3);
    expect(result.current.allDone).toBe(true);
  });

  it.each([
    ["ready", "on"],
    ["starting", undefined],
    ["stopped", undefined],
  ])("counts nothing optional while messages are %s", (status, messages) => {
    state.dm = status;
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.messages).toBe(messages);
    expect(result.current.optionalRemaining).toBe(0);
  });

  it("counts both extras when both are left", () => {
    state.provider = "other";
    state.activated = false;
    state.dm = "no-inbox";
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.optionalRemaining).toBe(2);
    expect(result.current.remaining).toBe(0);
  });
});
void ME;

describe("useFinishSetup — the Duty Menu step", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
  });

  it("isn't a step on a server that can't publish one: three steps, nothing to nag", () => {
    state.menu = { supported: false, status: null, settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.dutyMenu).toBeUndefined();
    expect(result.current.totalSteps).toBe(3);
    expect(result.current.remaining).toBe(0);
    expect(result.current.allDone).toBe(true);
  });

  it("is the fourth step where it can, and a missing menu is one left", () => {
    state.menu = { supported: true, status: "missing", settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.dutyMenu).toBe("missing");
    expect(result.current.totalSteps).toBe(4);
    expect(result.current.doneCount).toBe(3);
    expect(result.current.dutyMenuPending).toBe(true);
    expect(result.current.remaining).toBe(1);
    expect(result.current.allDone).toBe(false);
  });

  it("an out-of-date menu is a step left too", () => {
    state.menu = { supported: true, status: "out-of-date", settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.dutyMenu).toBe("out-of-date");
    expect(result.current.remaining).toBe(1);
  });

  it("doesn't nag before the relays have answered", () => {
    state.menu = { supported: true, status: null, settled: false };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.dutyMenu).toBe("checking");
    expect(result.current.dutyMenuPending).toBe(false);
    expect(result.current.remaining).toBe(0);
    expect(result.current.allDone).toBe(false);
  });

  it("an up-to-date menu completes the four", () => {
    state.menu = { supported: true, status: "current", settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.doneCount).toBe(4);
    expect(result.current.totalSteps).toBe(4);
    expect(result.current.allDone).toBe(true);
  });
});

describe("useFinishSetup — the Treasure Map step", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
    state.menu = { supported: true, status: "current", settled: true };
  });

  it("isn't a step on a server that can't keep one", () => {
    state.selfMap = { supported: false, status: null, settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMap).toBeUndefined();
    expect(result.current.totalSteps).toBe(4);
    expect(result.current.allDone).toBe(true);
  });

  it("is the fifth step where it can, and one that lists nothing live yet is one left", () => {
    state.selfMap = { supported: true, status: "missing", settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMap).toBe("missing");
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.doneCount).toBe(4);
    expect(result.current.treasureMapPending).toBe(true);
    expect(result.current.remaining).toBe(1);
    expect(result.current.allDone).toBe(false);
  });

  it("doesn't nag before the relays have answered", () => {
    state.selfMap = { supported: true, status: null, settled: false };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMap).toBe("checking");
    expect(result.current.treasureMapPending).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("a check that fails keeps the row, not counted, until it answers", () => {
    state.selfMap = {
      supported: undefined,
      status: null,
      settled: false,
      error: new Error("Couldn't read your Treasure Map."),
    };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMap).toBe("failed");
    expect(result.current.totalSteps).toBe(4);
    expect(result.current.treasureMapPending).toBe(false);
    expect(result.current.remaining).toBe(0);
    // Still being asked, with no failure yet: no row.
    state.selfMap = { supported: undefined, status: null, settled: false, error: null };
    const loading = renderHook(() => useFinishSetup());
    expect(loading.result.current.treasureMap).toBeUndefined();
  });

  it("an up-to-date Map completes the five", () => {
    state.selfMap = { supported: true, status: "current", settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.doneCount).toBe(5);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.allDone).toBe(true);
  });
});
