/**
 * What a designated trust provider is actually doing: how many people it
 * holds assertions for, and when it last published. The payoff of a
 * designation, shown on its page (Benjamin, 2026-09-23: "how else can we
 * make this more engaged and helpful").
 *
 * scores.brainstorm.world answers no COUNT (probed 2026-09-23), so the count
 * is a bounded read: up to the cap, and "cap+" beyond it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

type Frame = { type: "EVENT"; event: NostrEvent } | { type: "EOSE" } | { type: "CLOSED" };
const subject = new Subject<Frame>();
const reqMock = vi.fn(() => subject);
vi.mock("@/lib/relayPool", () => ({ pool: { relay: () => ({ req: (...args: unknown[]) => reqMock(...(args as [])) }) } }));

import { fetchAssertionFootprint, FOOTPRINT_CAP } from "./assertionFootprint";

const PROVIDER = "7".repeat(64);
const assertion = (n: number, created_at: number): NostrEvent =>
  ({ id: String(n).padStart(64, "0"), kind: 30382, pubkey: PROVIDER, tags: [["d", String(n).padStart(64, "a")], ["rank", "50"]], content: "", created_at, sig: "s" }) as NostrEvent;

async function tick() { await Promise.resolve(); await Promise.resolve(); }

beforeEach(() => vi.clearAllMocks());

describe("fetchAssertionFootprint", () => {
  it("asks the provider's relay for its assertions, and reports how many and how fresh", async () => {
    const pending = fetchAssertionFootprint(PROVIDER, "wss://scores.brainstorm.world");
    await tick();
    expect(reqMock).toHaveBeenCalledWith({ kinds: [30382], authors: [PROVIDER], limit: FOOTPRINT_CAP });

    subject.next({ type: "EVENT", event: assertion(1, 1_700_000_000) });
    subject.next({ type: "EVENT", event: assertion(2, 1_700_009_000) });
    subject.next({ type: "EVENT", event: assertion(3, 1_700_005_000) });
    subject.next({ type: "EOSE" });
    expect(await pending).toEqual({ people: 3, capped: false, updatedAt: 1_700_009_000 });
  });

  it("says cap+ when the relay had at least the cap", async () => {
    const pending = fetchAssertionFootprint(PROVIDER, "wss://scores.brainstorm.world");
    await tick();
    for (let i = 0; i < FOOTPRINT_CAP; i++) subject.next({ type: "EVENT", event: assertion(i, 1_700_000_000 + i) });
    subject.next({ type: "EOSE" });
    expect(await pending).toMatchObject({ people: FOOTPRINT_CAP, capped: true });
  });

  it("resolves null when the relay holds nothing for the provider", async () => {
    const pending = fetchAssertionFootprint(PROVIDER, "wss://scores.brainstorm.world");
    await tick();
    subject.next({ type: "EOSE" });
    expect(await pending).toBeNull();
  });
});
