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
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "has-follows" }));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({ useTrustProviderStatus: () => ({ data: state.provider }) }));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: state.lists }) }));
vi.mock("@/lib/followStore", () => ({ knownFollowCount: () => 3 }));
vi.mock("@/lib/nip85Activation", () => ({ isNip85Activated: () => state.activated }));
vi.mock("@/hooks/useDirectMessages", () => ({ useDmStatus: () => state.dm }));

import { useFinishSetup } from "./useFinishSetup";

describe("useFinishSetup — the Activate step and Trusted Lists", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
    state.dm = "stopped";
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

    expect(result.current.optionalRemaining).toBe(1);
    expect(result.current.remaining).toBe(0);
    expect(result.current.doneCount).toBe(3);
    expect(result.current.allDone).toBe(true);
  });

  it.each(["ready", "starting", "stopped"])("counts nothing optional while messages are %s", (status) => {
    state.dm = status;
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.optionalRemaining).toBe(0);
  });
});
void ME;
