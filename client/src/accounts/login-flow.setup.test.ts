/**
 * The first-run setup after a new account signs in. It runs for seconds behind
 * the profile publish's backoff, long enough for a switch.
 */
import { describe, expect, it, vi } from "vitest";

const announceRelayList = vi.fn(async () => ({ success: true }));
const publishProfile = vi.fn(async () => ({ success: true }));

vi.mock("./session", () => ({
  sessions: {},
  SessionTransportError: class SessionTransportError extends Error {},
  SESSION_SIGN_TIMEOUT_MS: 90_000,
}));
vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: () => {} } }));
vi.mock("@/services/api", () => ({ apiClient: {} }));
vi.mock("@/services/nostr", () => ({
  announceRelayList: () => announceRelayList(),
  cacheProfile: vi.fn(),
  fetchProfile: vi.fn(async () => null),
  publishProfile: (content: unknown) => publishProfile(content as never),
}));

describe("the first-run setup", () => {
  // publishProfile already announces the relay list, pinned to the account it
  // signed as. A second announce here read whoever was active by the time the
  // backoff ended, and could publish the defaults as another account's 10002.
  it("leaves the relay list to publishProfile, which pins the account", async () => {
    const { runInitialSetup } = await import("./login-flow");

    await runInitialSetup("e".repeat(64), { name: "New" });

    expect(publishProfile).toHaveBeenCalledTimes(1);
    expect(announceRelayList).not.toHaveBeenCalled();
  });
});
