// @vitest-environment jsdom
/**
 * The setup model's Activate step. Activation is a kind-10040 naming
 * Brainstorm; once the user has Trusted Lists, that 10040 must name them too,
 * so an activated account whose lists aren't in it has the step to do again.
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

  it("an activated account with lists its 10040 doesn't name has the step to do again", () => {
    state.lists = { status: "missing", designation: LISTS };
    const { result } = renderHook(() => useFinishSetup());

    expect(result.current.activateDone).toBe(false);
    expect(result.current.activatePending).toBe(true);
    expect(result.current.listsPending).toBe(true);
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
void ME;
