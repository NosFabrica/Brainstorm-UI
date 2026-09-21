// @vitest-environment jsdom
/**
 * Welcoming someone back follows them in a kind-3. That publish can be refused
 * — the relays were unreachable, or the signer said no — and the card used to
 * treat every outcome except an explicit cancel as done: the joiner was
 * acknowledged and dropped from the list though nothing was ever published,
 * with no way back to them (#72's quieter sibling).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ME = "a".repeat(64);
const JOINER = "b".repeat(64);

const followPubkeys = vi.fn(async (): Promise<Record<string, unknown>> => ({ success: true }));
const acknowledgeJoiners = vi.fn();
const triggerScoringAndAnchor = vi.fn(async () => {});

vi.mock("@/services/socialActions", () => ({
  followPubkeys: (...a: unknown[]) => followPubkeys(...(a as [])),
}));
vi.mock("@/services/inviteAcceptance", () => ({
  fetchNewJoiners: async () => [{ pubkey: JOINER, acceptedAt: 1 }],
  acknowledgeJoiners: (...a: unknown[]) => acknowledgeJoiners(...a),
}));
vi.mock("@/services/trustAnchor", () => ({
  triggerScoringAndAnchor: (...a: unknown[]) => triggerScoringAndAnchor(...(a as [])),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: ME }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useSelf", () => ({
  useSelfHistory: () => ({ data: { data: { ta_pubkey: "c".repeat(64) } }, isSuccess: true }),
}));
vi.mock("@/accounts/display", () => ({ identityHas: () => false }));

import { useNewJoiners } from "./useNewJoiners";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const loaded = async () => {
  const { result } = renderHook(() => useNewJoiners(), { wrapper });
  await waitFor(() => expect(result.current.joiners).toHaveLength(1));
  return result;
};

describe("welcoming a new joiner back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followPubkeys.mockResolvedValue({ success: true });
  });

  it("keeps them on the card when the follow was refused", async () => {
    followPubkeys.mockResolvedValue({ success: false, needsBaseConfirmation: true });
    const result = await loaded();

    await act(async () => { await result.current.welcomeBack([JOINER]); });

    expect(acknowledgeJoiners).not.toHaveBeenCalled();
    expect(result.current.joiners).toHaveLength(1);
  });

  it("tells the caller it didn't go through, so the card can say so", async () => {
    followPubkeys.mockResolvedValue({ success: false, needsBaseConfirmation: true });
    const result = await loaded();

    let outcome: boolean | undefined;
    await act(async () => { outcome = await result.current.welcomeBack([JOINER]); });

    expect(outcome).toBe(false);
  });

  it("doesn't rescore a follow that was never published", async () => {
    followPubkeys.mockResolvedValue({ success: false, error: "Couldn't save your follows" });
    const result = await loaded();

    await act(async () => { await result.current.welcomeBack([JOINER]); });

    expect(triggerScoringAndAnchor).not.toHaveBeenCalled();
  });

  it("acknowledges them, and rescores, once the follow really went out", async () => {
    const result = await loaded();

    await act(async () => { await result.current.welcomeBack([JOINER]); });

    expect(acknowledgeJoiners).toHaveBeenCalledWith(ME, [JOINER]);
    expect(result.current.joiners).toHaveLength(0);
    expect(triggerScoringAndAnchor).toHaveBeenCalledWith(ME);
  });
});
