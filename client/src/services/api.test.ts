/**
 * What an authenticated request does when the Session is gone: heal it silently
 * where that costs the user nothing, and hand back a typed "deferred" where
 * healing it would mean asking for a Recovery password.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSessionToken, SessionDeferredError } from "@/accounts/session";
import { stubAccount, type StubAccount } from "@/test/accountStub";

const activeAccount = vi.fn();
const refreshSession = vi.fn();
const ensureSession = vi.fn();
/** What else this device holds, for the redirect decision. */
const heldAccounts: unknown[] = [];

vi.mock("@/accounts/signing", () => ({ activeAccount: () => activeAccount() }));
vi.mock("@/accounts", () => ({
  accountManager: {
    get accounts() {
      return heldAccounts;
    },
  },
}));
vi.mock("@/accounts/session", async (original) => ({
  ...(await original<typeof import("@/accounts/session")>()),
  refreshSession: (...args: unknown[]) => refreshSession(...args),
  ensureSession: (...args: unknown[]) => ensureSession(...args),
}));
const waitForExtension = vi.fn(async () => undefined);
vi.mock("@/accounts/login", async (original) => ({
  ...(await original<typeof import("@/accounts/login")>()),
  waitForExtension: (...args: unknown[]) => waitForExtension(...(args as [])),
}));

let account: StubAccount;

let apiClient: typeof import("./api").apiClient;
let isAuthRedirecting: typeof import("./api").isAuthRedirecting;
let resumeSession: typeof import("./api").resumeSession;

beforeEach(async () => {
  vi.clearAllMocks();
  // `isRedirectingToLogin` is module state; without this it leaks across tests.
  vi.resetModules();
  account = stubAccount();
  activeAccount.mockReturnValue(account);
  heldAccounts.length = 0;
  heldAccounts.push(account);
  ({ apiClient, isAuthRedirecting, resumeSession } = await import("./api"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Whatever `fetch` should answer, in order. */
function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A re-auth that lands, writing its token where a real one would. */
function mintsToken(token: string) {
  refreshSession.mockImplementation(async () => {
    account.metadata = { ...account.metadata, session: { token, isAdmin: false } };
    return token;
  });
}

const holdsSession = (token: string) => {
  account.metadata = { ...account.metadata, session: { token, isAdmin: false } };
};

const unauthorized = () => new Response(JSON.stringify({ detail: "expired" }), { status: 401 });
const ok = () => new Response(JSON.stringify({ data: [] }), { status: 200 });

describe("an authenticated request whose session has lapsed", () => {
  it("defers rather than redirecting when re-auth would ask for a password", async () => {
    holdsSession("stale");
    refreshSession.mockRejectedValue(new SessionDeferredError());
    stubFetch(unauthorized());

    await expect(apiClient.getUserHistory()).rejects.toBeInstanceOf(SessionDeferredError);

    // the account is still usable — nothing may be wiped and nowhere navigated
    expect(getSessionToken(account as never)).toBe("stale");
  });

  it("defers before it even asks, when there is no token to send", async () => {
    refreshSession.mockRejectedValue(new SessionDeferredError());
    const fetchMock = stubFetch(ok());

    await expect(apiClient.getUserHistory()).rejects.toBeInstanceOf(SessionDeferredError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("heals silently and retries when the key opens on its own", async () => {
    holdsSession("stale");
    mintsToken("fresh");
    const fetchMock = stubFetch(unauthorized(), ok());

    await expect(apiClient.getUserHistory()).resolves.toEqual({ data: [] });

    expect(getSessionToken(account as never)).toBe("fresh");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { access_token: "fresh" } });
  });
});

describe("a session that cannot be renewed at all", () => {
  /** A re-auth that fails outright — not deferred, genuinely unusable. */
  const cannotHeal = () => refreshSession.mockRejectedValue(new Error("expired"));

  it("stays put when this device holds another account to be", async () => {
    holdsSession("stale");
    cannotHeal();
    heldAccounts.push(stubAccount(undefined, "b".repeat(64)));
    stubFetch(unauthorized(), unauthorized());

    await expect(apiClient.getUserHistory()).rejects.toThrow();

    // PLAN §6: never redirect while another Account is usable. Blanking every
    // page behind `isAuthRedirecting` would be the same mistake by another name.
    expect(isAuthRedirecting()).toBe(false);
  });

  it("gives up the route only when there is nothing else on this device", async () => {
    holdsSession("stale");
    cannotHeal();
    stubFetch(unauthorized(), unauthorized());

    await expect(apiClient.getUserHistory()).rejects.toThrow();

    expect(isAuthRedirecting()).toBe(true);
  });
});

describe("anon-viewable data while the session is deferred", () => {
  it("is served anonymously — a signed-in reader is never worse off than a signed-out one", async () => {
    holdsSession("stale");
    refreshSession.mockRejectedValue(new SessionDeferredError());
    const fetchMock = stubFetch(unauthorized(), ok());

    await expect(apiClient.getUserByPubkey(account.pubkey)).resolves.toEqual({ data: [] });

    // the retry carries no token at all, rather than the stale one the server refused
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty("headers.access_token");
  });
});

describe("resuming a deferred session", () => {
  it("mints the session the deferred re-auth skipped", async () => {
    ensureSession.mockResolvedValue("minted");

    await resumeSession();

    expect(ensureSession).toHaveBeenCalledWith(account);
  });

  it("lets a declined unlock through, so the caller can stay quiet about it", async () => {
    const cancelled = new Error("Unlock cancelled");
    cancelled.name = "UnlockCancelled";
    ensureSession.mockRejectedValue(cancelled);

    await expect(resumeSession()).rejects.toBe(cancelled);
  });

  it("does nothing when nobody is signed in", async () => {
    activeAccount.mockReturnValue(undefined);

    await resumeSession();
    expect(ensureSession).not.toHaveBeenCalled();
  });
});

/**
 * A token expiring while several queries are in flight used to cost one signer
 * prompt per query: each 401 called `refreshSession`, which clears the Session
 * before minting — wiping the token a sibling had just written and defeating the
 * "did one arrive while I waited?" guard inside `authenticate`.
 */
describe("several requests meeting the same expired token", () => {
  it("adopts the token a sibling just minted rather than asking the signer again", async () => {
    holdsSession("stale");
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        // a sibling request's re-auth lands while this one is in flight
        holdsSession("fresh");
        return unauthorized();
      }
      return ok();
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.getUserHistory()).resolves.toEqual({ data: [] });

    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: { access_token: "fresh" } });
  });

  it("still mints when the token really is the one that failed", async () => {
    holdsSession("stale");
    mintsToken("fresh");
    stubFetch(unauthorized(), ok());

    await expect(apiClient.getUserHistory()).resolves.toEqual({ data: [] });

    expect(refreshSession).toHaveBeenCalled();
  });
});

/**
 * A cold boot with an expired token races the extension's own injection. Alby and
 * nos2x on a cold profile routinely inject after ~1s, and giving up first ends in
 * a cleared Session and, for a single-account user, a redirect home.
 */
describe("a 401 that beats the extension into the page", () => {
  it("waits longer than the interactive paths do", async () => {
    account.type = "extension";
    holdsSession("stale");
    mintsToken("fresh");
    stubFetch(unauthorized(), ok());

    await apiClient.getUserHistory();

    const { EXTENSION_COLD_BOOT_WAIT_MS, EXTENSION_WAIT_MS } = await import("@/accounts/login");
    expect(EXTENSION_COLD_BOOT_WAIT_MS).toBeGreaterThan(EXTENSION_WAIT_MS);
    expect(waitForExtension).toHaveBeenCalledWith(EXTENSION_COLD_BOOT_WAIT_MS);
  });
});
