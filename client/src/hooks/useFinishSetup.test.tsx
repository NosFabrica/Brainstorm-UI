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
}));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64) }) }));
vi.mock("@/hooks/useVerifiedNoFollows", () => ({ useVerifiedNoFollows: () => "has-follows" }));
vi.mock("@/hooks/useSelf", () => ({ useSelfHistory: () => ({ data: { data: { ta_pubkey: "b".repeat(64) } } }) }));
vi.mock("@/hooks/useTrustProviderStatus", () => ({ useTrustProviderStatus: () => ({ data: state.provider }) }));
vi.mock("@/hooks/useTrustListsStatus", () => ({ useTrustListsStatus: () => ({ data: state.lists }) }));
vi.mock("@/lib/followStore", () => ({ knownFollowCount: () => 3 }));
vi.mock("@/lib/nip85Activation", () => ({ isNip85Activated: () => state.activated }));

import { useFinishSetup } from "./useFinishSetup";

describe("useFinishSetup — the Activate step and Trusted Lists", () => {
  beforeEach(() => {
    state.provider = "brainstorm";
    state.activated = true;
    state.lists = undefined;
  });

  it("an activated account with lists to add stays activated, with an update flagged apart", () => {
    state.lists = { status: "missing", designation: LISTS };
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.activatePending).toBe(false);
    expect(result.current.listsPending).toBe(true);
    expect(result.current.remaining).toBe(0);
    expect(result.current.doneCount).toBe(3);
  });

  it.each(["declared", "none"])("lists %s leave activation done", (status) => {
    state.lists = { status, designation: LISTS };
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(true);
    expect(result.current.activatePending).toBe(false);
    expect(result.current.listsPending).toBe(false);
  });
});
void ME;
