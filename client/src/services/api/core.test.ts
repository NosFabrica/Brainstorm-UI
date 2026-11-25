// @vitest-environment jsdom
/**
 * The Session around an API request: a 401 is re-authed once and retried.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const account = { id: "row", pubkey: "a".repeat(64), type: "local" };
let token = "old";
const clearSession = vi.fn();

vi.mock("@/accounts/session", () => ({
  clearSession: (a: unknown) => clearSession(a),
  ensureSession: async () => token,
  getSessionToken: () => token,
  isSessionDeferredError: () => false,
  isSessionRateLimited: () => false,
  refreshSession: async () => {
    token = "new";
    return token;
  },
  SessionDeferredError: class SessionDeferredError extends Error {},
}));
vi.mock("@/accounts/login", () => ({ EXTENSION_COLD_BOOT_WAIT_MS: 0, waitForExtension: async () => true }));
vi.mock("@/accounts", () => ({ accountManager: { accounts: [account] } }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => account }));

const { authenticatedFetch } = await import("./core");

beforeEach(() => {
  token = "old";
  clearSession.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("authenticatedFetch", () => {
  // A 403 after a successful re-auth is "you may not", not "you're signed out":
  // it cleared the fresh Session and sent the reader home.
  it("keeps the Session when the retry after a re-auth is forbidden", async () => {
    const answers = [
      new Response(JSON.stringify({ detail: "expired" }), { status: 401 }),
      new Response(JSON.stringify({ detail: "Admins only" }), { status: 403 }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answers.shift()!),
    );

    await expect(authenticatedFetch("https://api.example/admin")).rejects.toThrow("Admins only");

    expect(clearSession).not.toHaveBeenCalled();
    expect(token).toBe("new");
  });

  it("still treats a 401 on the retry as a lost Session", async () => {
    const answers = [new Response(null, { status: 401 }), new Response(null, { status: 401 })];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answers.shift()!),
    );

    await expect(authenticatedFetch("https://api.example/me")).rejects.toThrow(/Session expired/);
    expect(clearSession).toHaveBeenCalled();
  });
});
