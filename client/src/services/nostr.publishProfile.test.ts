// @vitest-environment jsdom
/**
 * `publishProfile` retries because propagation is often thin — a kind-0 that only
 * one relay accepted may as well not exist to the clients that read from the
 * others. The retry is about the relays, so it must not drag the signer back in
 * with it: re-signing meant a profile save against an unresponsive bunker cost
 * three approval prompts and three 30-second deadlines before it gave up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn();
const signAs = vi.fn();
const activeAccount = vi.fn();
const cachedFor: { pubkey?: string } = {};

vi.mock("@/lib/relayPool", () => ({
  pool: { publish: (...args: unknown[]) => publish(...args) },
}));

vi.mock("@/accounts/signing", async (original) => ({
  ...(await original<typeof import("@/accounts/signing")>()),
  activeAccount: () => activeAccount(),
  signAs: (...args: unknown[]) => signAs(...args),
}));

const PUBKEY = "a".repeat(64);
const OTHER = "b".repeat(64);

/** What `pool.publish` answers: one relay accepting is "thin", two is enough. */
const accepted = (n: number) =>
  Array.from({ length: 3 }, (_, i) => ({ ok: i < n, from: `wss://r${i}`, message: "" }));

let nostr: typeof import("./nostr");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  delete cachedFor.pubkey;
  activeAccount.mockReturnValue({ pubkey: PUBKEY, type: "test" });
  signAs.mockImplementation(async (_account: unknown, template: { kind: number }) => ({
    ...template,
    id: "e".repeat(64),
    pubkey: PUBKEY,
    sig: "s",
    created_at: 0,
  }));
  nostr = await import("./nostr");
});

/**
 * Only the kind-0. A successful save also refreshes the NIP-65 outbox list, which
 * is its own event and its own signature — counting both would measure the wrong
 * thing.
 */
const ofKind = (calls: unknown[][], kind: number) =>
  calls.filter((call) => (call[1] as { kind: number })?.kind === kind);
const profilePublishes = () => ofKind(publish.mock.calls, 0);
const profileSignings = () => ofKind(signAs.mock.calls, 0);

/** Run the publish out, letting the backoff timers fire. */
async function settle(pending: Promise<unknown>) {
  await vi.runAllTimersAsync();
  return pending;
}

describe("saving a profile that the relays barely accept", () => {
  it("signs once, however many times it has to publish", async () => {
    publish.mockResolvedValue(accepted(1)); // thin, every time

    await settle(nostr.publishProfile({ name: "ana" }));

    expect(profilePublishes()).toHaveLength(3); // the first, plus both backoffs
    expect(profileSignings()).toHaveLength(1);
  });

  it("stops as soon as it has landed broadly enough", async () => {
    publish.mockResolvedValue(accepted(2));

    await settle(nostr.publishProfile({ name: "ana" }));

    expect(profilePublishes()).toHaveLength(1);
  });

  it("republishes the very event it signed, rather than a fresh one", async () => {
    publish.mockResolvedValue(accepted(1));

    await settle(nostr.publishProfile({ name: "ana" }));

    const sent = profilePublishes().map((call) => call[1]);
    expect(new Set(sent).size).toBe(1);
  });

  it("gives up without publishing at all when the signer refuses", async () => {
    signAs.mockRejectedValue(new Error("User rejected"));

    const res = await settle(nostr.publishProfile({ name: "ana" }));

    expect(publish).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });
});

/**
 * The backoff runs for seconds, which is long enough to switch accounts. Both the
 * signature and the cache write have to belong to whoever asked, not to whoever
 * happens to be Active when the relays finally answer.
 */
describe("switching accounts while a profile save is in flight", () => {
  it("signs as the account that asked, not the one that arrives mid-flight", async () => {
    publish.mockResolvedValue(accepted(1));

    const pending = nostr.publishProfile({ name: "ana" });
    activeAccount.mockReturnValue({ pubkey: OTHER, type: "test" });
    await settle(pending);

    // every signature, not just the first: the old code re-read the Active
    // Account per attempt, so the retries signed as whoever had arrived
    expect(profileSignings().map((call) => (call[0] as { pubkey: string }).pubkey)).toEqual([PUBKEY]);
  });
});
