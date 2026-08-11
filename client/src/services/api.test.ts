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

vi.mock("@/accounts/signing", () => ({ activeAccount: () => activeAccount() }));
vi.mock("@/accounts/session", async (original) => ({
  ...(await original<typeof import("@/accounts/session")>()),
  refreshSession: (...args: unknown[]) => refreshSession(...args),
  ensureSession: (...args: unknown[]) => ensureSession(...args),
}));
vi.mock("@/accounts/login", () => ({ waitForExtension: async () => undefined }));

let account: StubAccount;

let apiClient: typeof import("./api").apiClient;
let resumeSession: typeof import("./api").resumeSession;

beforeEach(async () => {
  vi.clearAllMocks();
  account = stubAccount();
  activeAccount.mockReturnValue(account);
  ({ apiClient, resumeSession } = await import("./api"));
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
