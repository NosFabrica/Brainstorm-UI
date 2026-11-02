/**
 * Signing in with a passkey: on a device that holds the account, and on one that
 * holds nothing. The ceremony and the server are faked; the seal is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { accountManager } from "@/accounts";
import { adoptAccount, localAccount } from "./login";
import type { BrainstormAccount } from "./metadata";
import { sealKey, type PasskeyAssertion } from "./passkey";
import { createFakeUnlockCache } from "./test-fakes";

const CREDENTIAL = "Y3JlZGVudGlhbA";
const PRF = new Uint8Array(32).fill(5);

const assertPasskey = vi.fn<(options: { challenge?: string }) => Promise<PasskeyAssertion>>();
const passkeyVaultChallenge = vi.fn(async () => "server-challenge");
const openPasskeyVault = vi.fn<(hash: string, wire: unknown) => Promise<string>>();
const ensureSession = vi.fn(async () => "token.eyJhbGciOiJIUzI1NiJ9.sig");
const authenticate = vi.fn(async () => "token.eyJhbGciOiJIUzI1NiJ9.sig");

vi.mock("./passkey", async (original) => ({
  ...(await original<typeof import("./passkey")>()),
  assertPasskey: (options: { challenge?: string }) => assertPasskey(options),
}));
vi.mock("@/services/api/passkeyVault", async (original) => ({
  ...(await original<typeof import("@/services/api/passkeyVault")>()),
  passkeyVaultApi: {
    passkeyVaultChallenge: () => passkeyVaultChallenge(),
    openPasskeyVault: (hash: string, wire: unknown) => openPasskeyVault(hash, wire),
  },
}));
vi.mock("./session", () => ({
  sessions: {
    ensureSession: (account: BrainstormAccount) => ensureSession(account),
    authenticate: (account: BrainstormAccount) => authenticate(account),
  },
  SessionTransportError: class SessionTransportError extends Error {},
  SESSION_SIGN_TIMEOUT_MS: 90_000,
}));
vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: vi.fn() } }));
vi.mock("@/services/api", () => ({ apiClient: {} }));
vi.mock("@/services/nostr", () => ({
  announceRelayList: vi.fn(),
  cacheProfile: vi.fn(),
  fetchProfile: vi.fn(async () => null),
  publishProfile: vi.fn(),
}));

function answer(pubkey: string): PasskeyAssertion {
  return {
    credentialId: CREDENTIAL,
    pubkey,
    prf: PRF,
    wire: { credentialId: CREDENTIAL, clientDataJSON: "c", authenticatorData: "a", signature: "s" },
  };
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  for (const account of [...accountManager.accounts]) accountManager.removeAccount(account);
  localStorage.clear();
});

describe("signing in with a passkey", () => {
  it("on a device that holds nothing, opens the server's copy and keeps the seal", async () => {
    const { loginWithPasskey } = await import("./login-flow");
    const key = generateSecretKey();
    const pubkey = getPublicKey(key);
    const sealed = await sealKey(key, pubkey, CREDENTIAL, PRF);
    assertPasskey.mockResolvedValue(answer(pubkey));
    // Extra fields a server might add are not the Account's to keep.
    openPasskeyVault.mockResolvedValue(JSON.stringify({ ...sealed, smuggled: "x" }));

    const user = await loginWithPasskey("prefetched");

    expect(user.pubkey).toBe(pubkey);
    expect(assertPasskey).toHaveBeenCalledWith({ challenge: "prefetched" });
    const signer = (accountManager.active as unknown as { signer: { data: { passkeys: object[] } } }).signer;
    expect(signer.data.passkeys).toHaveLength(1);
    expect(signer.data.passkeys[0]).not.toHaveProperty("smuggled");
  });

  it("on a device that holds the account, opens it in place without asking the server", async () => {
    const { loginWithPasskey } = await import("./login-flow");
    const account = await localAccount(generateSecretKey(), { unlockCache: createFakeUnlockCache() });
    // The seal has to be the account's own: add it while unlocked, then lock.
    await account.signer.addPasskey(CREDENTIAL, PRF, { provider: "P", device: "D", addedAt: 1 });
    adoptAccount(account as unknown as BrainstormAccount, { remembered: true });
    account.signer.lock();
    assertPasskey.mockResolvedValue(answer(account.pubkey));
    passkeyVaultChallenge.mockRejectedValueOnce(new Error("server down"));

    const user = await loginWithPasskey();

    expect(user.pubkey).toBe(account.pubkey);
    expect(openPasskeyVault).not.toHaveBeenCalled();
    // The same row signs, unlocked — not a replacement under other tabs.
    expect(accountManager.active).toBe(account);
    expect(account.signer.unlocked).toBe(true);
  });

  it("refuses a seal for one account under a passkey made for another", async () => {
    const { loginWithPasskey } = await import("./login-flow");
    const key = generateSecretKey();
    const sealed = await sealKey(key, getPublicKey(key), CREDENTIAL, PRF);
    assertPasskey.mockResolvedValue(answer(getPublicKey(generateSecretKey())));
    openPasskeyVault.mockResolvedValue(JSON.stringify(sealed));

    await expect(loginWithPasskey("c")).rejects.toMatchObject({ name: "PasskeyMismatchError" });
    expect(accountManager.accounts).toHaveLength(0);
  });

  it("can't fetch a copy it has no server challenge for", async () => {
    const { loginWithPasskey } = await import("./login-flow");
    assertPasskey.mockResolvedValue(answer(getPublicKey(generateSecretKey())));
    passkeyVaultChallenge.mockRejectedValueOnce(new Error("server down"));

    await expect(loginWithPasskey()).rejects.toThrow("Couldn't reach Brainstorm");
    expect(openPasskeyVault).not.toHaveBeenCalled();
  });
});
