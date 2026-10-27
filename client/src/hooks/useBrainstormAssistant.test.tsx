// @vitest-environment jsdom
/**
 * "Your Brainstorm Assistant" is the server's `ta_pubkey`. This browser's
 * stored copy counts only once that answer confirms it; one naming another
 * deployment's Assistant (#269) is dropped rather than shown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const ME = "1".repeat(64);
const OURS = "a".repeat(64);
const THEIRS = "b".repeat(64);

const mywot = vi.hoisted(() => ({
  hasMywot: false,
  taPubkey: null as string | null,
  known: false,
  isLoading: true,
}));
vi.mock("@/accounts/display", () => ({ activePubkey: () => ME }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => mywot }));

import { useBrainstormAssistant } from "./useBrainstormAssistant";
import { readPublishedAssistant, writePublishedAssistant } from "@/lib/assistantStorage";

const store = (pubkey: string) =>
  writePublishedAssistant({ pubkey, npub: "", eventId: "e".repeat(64), publishedAt: 1_790_374_540_180 });
const serverSays = (taPubkey: string | null) =>
  Object.assign(mywot, { taPubkey, hasMywot: !!taPubkey, known: true, isLoading: false });

beforeEach(() => {
  localStorage.clear();
  Object.assign(mywot, { taPubkey: null, hasMywot: false, known: false, isLoading: true });
});

describe("useBrainstormAssistant", () => {
  it("shows no Assistant until the server answers, whatever is stored", () => {
    store(OURS);
    const { result } = renderHook(() => useBrainstormAssistant());
    expect(result.current.published).toBeNull();
    // Nothing to check it against yet, so nothing is dropped either.
    expect(readPublishedAssistant()?.pubkey).toBe(OURS);
  });

  it("drops another deployment's Assistant once ta_pubkey answers", () => {
    store(THEIRS);
    const { result, rerender } = renderHook(() => useBrainstormAssistant());

    serverSays(OURS);
    rerender();

    expect(result.current).toMatchObject({ taPubkey: OURS, published: null });
    expect(readPublishedAssistant()).toBeNull();
  });

  it("is the stored Assistant when it is ta_pubkey", () => {
    store(OURS);
    serverSays(OURS);
    const { result } = renderHook(() => useBrainstormAssistant());
    expect(result.current.published?.pubkey).toBe(OURS);
  });

  it("picks up a publish of ta_pubkey made after it mounted", () => {
    serverSays(OURS);
    const { result } = renderHook(() => useBrainstormAssistant());
    expect(result.current.published).toBeNull();

    act(() => store(OURS));
    expect(result.current.published?.pubkey).toBe(OURS);
  });
});
