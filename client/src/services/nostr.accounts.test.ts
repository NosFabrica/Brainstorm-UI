/**
 * The three acts that decide who is signed in: switching, signing out, and letting
 * an Account go for good. Sign-out used to be the last of those; ticket 15 split
 * them, and what follows is the part that can't be seen from a component.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";

import { accountManager } from "@/accounts";
import { adoptAccount, localAccount } from "@/accounts/login";
import { accountKey } from "@/lib/accountStorage";
import { getMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { createFakeUnlockCache } from "@/accounts/test-fakes";
import type { LocalAccount } from "@/accounts/local-account";

const ensureSession = vi.fn(async () => "token.eyJhbGciOiJIUzI1NiJ9.sig");
const clear = vi.fn();

vi.mock("@/accounts/session", () => ({
  sessions: { ensureSession: (account: BrainstormAccount) => ensureSession(account) },
  SessionTransportError: class SessionTransportError extends Error {},
}));
vi.mock("@/lib/queryClient", () => ({ queryClient: { clear: () => clear() } }));
vi.mock("./api", () => ({ apiClient: {} }));

async function held(): Promise<LocalAccount> {
  const account = await localAccount(generateSecretKey(), { unlockCache: createFakeUnlockCache() });
  adoptAccount(account as unknown as BrainstormAccount, { remembered: true });
  return account;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const account of [...accountManager.accounts]) accountManager.removeAccount(account);
  localStorage.clear();
});

describe("switching to another account", () => {
  it("empties the cache before the new identity is the one asking", async () => {
    const { signInWithAccount } = await import("./nostr");
    const other = await held();
    const signedIn = await held();
    expect(accountManager.active?.id).toBe(signedIn.id);
    clear.mockClear();

    await signInWithAccount(other as unknown as BrainstormAccount);

    expect(clear).toHaveBeenCalled();
    expect(accountManager.active?.id).toBe(other.id);
  });

  it("leaves the cache alone where the account was already the one signing", async () => {
    const { signInWithAccount } = await import("./nostr");
    const account = await held();

    await signInWithAccount(account as unknown as BrainstormAccount);

    expect(clear).not.toHaveBeenCalled();
  });
});

describe("signing out", () => {
  it("ends the session but keeps the account, so signing back in is one tap", async () => {
    const { logout } = await import("./nostr");
    const account = await held();

    logout();

    expect(accountManager.active).toBeUndefined();
    expect(accountManager.accounts).toContain(account as any);
    expect(getMetadata(account as unknown as BrainstormAccount).session).toBeUndefined();
    expect(account.persistable).toBe(true);
  });
});

describe("removing an account from this device", () => {
  it("signs out first where it was the one signing, and says so", async () => {
    const { removeAccountFromDevice } = await import("./nostr");
    const account = await held();

    expect(removeAccountFromDevice(account as unknown as BrainstormAccount)).toBe(true);

    expect(accountManager.accounts).not.toContain(account as any);
    expect(accountManager.active).toBeUndefined();
  });

  it("takes the rows that identity kept on this device", async () => {
    const { removeAccountFromDevice } = await import("./nostr");
    const account = await held();
    localStorage.setItem(accountKey("brainstorm_known_follows", account.pubkey), "{}");

    removeAccountFromDevice(account as unknown as BrainstormAccount);

    expect(localStorage.getItem(accountKey("brainstorm_known_follows", account.pubkey))).toBeNull();
  });

  it("keeps those rows while another Account still signs as that identity", async () => {
    const { removeAccountFromDevice } = await import("./nostr");
    const key = generateSecretKey();
    const first = await localAccount(key, { unlockCache: createFakeUnlockCache() });
    const second = await localAccount(key, { unlockCache: createFakeUnlockCache() });
    // two rows for one key: `adoptAccount` dedupes on Signer type, and these are
    // separate instances, so both stand
    accountManager.addAccount(first as unknown as BrainstormAccount);
    accountManager.addAccount(second as unknown as BrainstormAccount);
    localStorage.setItem(accountKey("brainstorm_known_follows", first.pubkey), "{}");

    removeAccountFromDevice(first as unknown as BrainstormAccount);

    // the follow-wipe guard belongs to the identity, which is still here
    expect(localStorage.getItem(accountKey("brainstorm_known_follows", first.pubkey))).toBe("{}");
  });

  it("lets a locked account nobody is signed in as go, without disturbing the one who is", async () => {
    const { removeAccountFromDevice } = await import("./nostr");
    const other = await held();
    const signedIn = await held();

    expect(removeAccountFromDevice(other as unknown as BrainstormAccount)).toBe(false);

    expect(accountManager.accounts).not.toContain(other as any);
    expect(accountManager.active?.id).toBe(signedIn.id);
  });
});
