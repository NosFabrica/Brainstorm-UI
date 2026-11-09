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
  /** The signals the Map leaves without a provider; undefined until the relays answer. */
  missing: [] as string[] | undefined,
  activated: true,
  lists: undefined as undefined | { status: string; designation: unknown },
  dm: "stopped" as string,
  /** The Duty Menu: unsupported unless a test says otherwise. */
  menu: { supported: false as boolean | undefined, status: null as string | null, settled: true },
  /** The Assistant's Treasure Map: unsupported unless a test says otherwise. */
  selfMap: { supported: false as boolean | undefined, status: null as string | null, settled: true } as Record<
    string,
    unknown
  >,
  /** A Brainstorm session, which the background publish needs; the steps above are read without one. */
  session: false,
  /** This deployment's Assistant: live unless a test says otherwise. */
  profile: { taPubkey: "b".repeat(64), settled: true, live: true, lastPublish: null } as Record<string, unknown>,
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "has-follows" }));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({
  useTrustProviderStatus: () => ({ data: state.provider, missingSignals: state.missing }),
}));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: state.lists }) }));
vi.mock("@/lib/followStore", () => ({ knownFollowCount: () => 3 }));
vi.mock("@/lib/nip85Activation", () => ({ isNip85Activated: () => state.activated }));
vi.mock("@/hooks/useDirectMessages", () => ({ useDmStatus: () => state.dm }));
vi.mock("@/hooks/useAssistantDutyMenu", () => ({ useAssistantDutyMenu: () => state.menu }));
vi.mock("@/hooks/useAssistantTreasureMap", () => ({ useAssistantTreasureMap: () => state.selfMap }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => state.session }));
vi.mock("@/hooks/useAssistantProfile", () => ({ useAssistantProfile: () => state.profile }));

import { useFinishSetup } from "./useFinishSetup";

beforeEach(() => {
  state.profile = { taPubkey: TA, settled: true, live: true, lastPublish: null };
});

describe("useFinishSetup — the Activate step and Trusted Lists", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.missing = [];
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
    state.menu = { supported: false, status: null, settled: true };
    state.selfMap = { supported: false, status: null, settled: true };
    state.session = false;
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
 * Issue #313: a Map that gives your own Assistant the rank duty but not every
 * signal it publishes is asked for again — as the Activate step, counted and
 * nagged from the header, not as a quiet update: other apps can't find three
 * of your five scores until it's signed.
 */
describe("useFinishSetup — a Treasure Map short of signals", () => {
  const SHORT = ["30382:reporters", "30382:muters", "30382:hops"];

  beforeEach(() => {
    state.provider = "brainstorm";
    state.missing = [];
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
    state.menu = { supported: false, status: null, settled: true };
    state.selfMap = { supported: false, status: null, settled: true };
  });

  it("makes Activate a step again, counted in what's left, and names the signals", () => {
    state.missing = SHORT;
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(false);
    expect(result.current.signalsPending).toBe(true);
    expect(result.current.missingSignals).toEqual(SHORT);
    expect(result.current.remaining).toBe(1);
    expect(result.current.doneCount).toBe(2);
    expect(result.current.allDone).toBe(false);
  });

  it("leaves another Assistant's rank duty alone: their service completes their Map", () => {
    state.provider = "other";
    state.activated = false;
    state.missing = [];
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.signalsPending).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it("doesn't nag before the relays have answered", () => {
    state.missing = undefined;
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.signalsPending).toBe(false);
    expect(result.current.remaining).toBe(0);
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

  it("an up-to-date Map completes the five", () => {
    state.selfMap = { supported: true, status: "current", settled: true };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.doneCount).toBe(5);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.allDone).toBe(true);
  });
});

/**
 * With a session the app publishes both tasks by itself (AutoAssistantSetup),
 * so a task it is doing — or about to — isn't a step left: the banner never
 * flashes "2 steps left" for work already under way. One that failed is a step
 * again, and /setup's row is the way to do it by hand.
 */
describe("useFinishSetup — while the app publishes them by itself", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
    state.session = true;
    state.menu = { supported: true, status: "current", settled: true, lastPublish: null };
    state.selfMap = {
      supported: true,
      status: "current",
      settled: true,
      on: true,
      published: {},
      lastPublish: null,
    };
  });

  it("a missing Duty Menu about to be published isn't a step left, and says it's being published", () => {
    state.menu = { ...state.menu, status: "missing" };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.dutyMenuPending).toBe(false);
    expect(result.current.dutyMenuAuto).toBe(true);
    expect(result.current.remaining).toBe(0);
    expect(result.current.allDone).toBe(false);
  });

  it("nor one under way", () => {
    state.selfMap = { ...state.selfMap, status: "out-of-date", lastPublish: "pending" };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMapPending).toBe(false);
    expect(result.current.treasureMapAuto).toBe(true);
    expect(result.current.remaining).toBe(0);
  });

  it("one that failed is a step left again, for /setup to do by hand", () => {
    state.menu = { ...state.menu, status: "out-of-date", lastPublish: "error" };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.dutyMenuPending).toBe(true);
    expect(result.current.dutyMenuAuto).toBe(false);
    expect(result.current.remaining).toBe(1);
  });

  it("one that went through but still reads out of date is a step left, not a publish forever", () => {
    state.selfMap = { ...state.selfMap, status: "out-of-date", lastPublish: "success" };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMapPending).toBe(true);
    expect(result.current.remaining).toBe(1);
  });

  it("a Treasure Map its owner turned off stays a step, as before: the app leaves it", () => {
    state.selfMap = { ...state.selfMap, status: "missing", on: false };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.treasureMapAuto).toBe(false);
    expect(result.current.treasureMapPending).toBe(true);
  });
});

/**
 * Step 1, "Create your account": the account comes with its own Brainstorm
 * Assistant, and the step is done once that Assistant is live — its profile
 * out. The app brings it to life by itself (AutoAssistantSetup); a publish
 * that failed hands the step back to /setup.
 */
describe("useFinishSetup — the account step: your Brainstorm Assistant", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.missing = [];
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
    state.session = true;
    state.menu = { supported: false, status: null, settled: true };
    state.selfMap = { supported: false, status: null, settled: true };
  });

  it("an Assistant that's live: the account step is done", () => {
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.accountDone).toBe(true);
    expect(result.current.accountPending).toBe(false);
    expect(result.current.doneCount).toBe(3);
    expect(result.current.allDone).toBe(true);
  });

  it("one the app is bringing to life isn't a step left, and says it's being done", () => {
    state.profile = { ...state.profile, live: false };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.accountDone).toBe(false);
    expect(result.current.accountAuto).toBe(true);
    expect(result.current.accountPending).toBe(false);
    expect(result.current.remaining).toBe(0);
    expect(result.current.doneCount).toBe(2);
    expect(result.current.allDone).toBe(false);
  });

  it("one whose publish failed is a step left, for /setup to do by hand", () => {
    state.profile = { ...state.profile, live: false, lastPublish: "error" };
    const { result } = renderHook(() => useFinishSetup());
    expect(result.current.accountAuto).toBe(false);
    expect(result.current.accountPending).toBe(true);
    expect(result.current.remaining).toBe(1);
  });

  it("doesn't nag before the server names the Assistant or the relays answer", () => {
    state.profile = { ...state.profile, live: false, taPubkey: null };
    expect(renderHook(() => useFinishSetup()).result.current.accountPending).toBe(false);
    state.profile = { ...state.profile, taPubkey: TA, settled: false };
    expect(renderHook(() => useFinishSetup()).result.current.accountPending).toBe(false);
  });
});
