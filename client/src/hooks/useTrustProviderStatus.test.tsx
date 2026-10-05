// @vitest-environment jsdom
/**
 * The 10040 status reads from the store, but the activated flag only moves on
 * the relays' answer: a stale held copy may show, never clear the flag.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { eventStore } from "@/lib/eventStore";

const RELAY = "wss://nip85.example";
let answer!: (e: unknown) => void;
const ask = vi.fn(() => new Promise((resolve) => (answer = resolve)));
const markNip85Activated = vi.fn();
const clearNip85Activated = vi.fn();
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: () => ask() }));
vi.mock("@/services/nostr", () => ({ getNip85RelayUrl: () => RELAY }));
vi.mock("@/lib/nip85Activation", () => ({
  markNip85Activated: (pk: string) => markNip85Activated(pk),
  clearNip85Activated: (pk: string) => clearNip85Activated(pk),
}));

import { useTrustProviderStatus } from "./useTrustProviderStatus";

const ME = "a".repeat(64);
const TA = "b".repeat(64);
const declaration = (id: string, createdAt: number, rank: string) =>
  ({
    id: id.repeat(64),
    pubkey: ME,
    kind: 10040,
    created_at: createdAt,
    content: "",
    sig: "s",
    tags: [
      ["30382:rank", rank, RELAY],
      ["30382:followers", rank, RELAY],
    ],
  }) as never;

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

describe("useTrustProviderStatus", () => {
  it("shows a held foreign declaration, but clears the flag only once the relays answer", async () => {
    eventStore.add(declaration("1", 100, "c".repeat(64)));
    const { result } = renderHook(() => useTrustProviderStatus(ME, TA));
    expect(result.current.data).toBe("other");
    expect(clearNip85Activated).not.toHaveBeenCalled();

    await act(async () => {
      const ours = declaration("2", 200, TA);
      eventStore.add(ours);
      answer(ours);
    });
    expect(result.current.data).toBe("brainstorm");
    expect(markNip85Activated).toHaveBeenCalledWith(ME);
    expect(clearNip85Activated).not.toHaveBeenCalled();
  });
});
