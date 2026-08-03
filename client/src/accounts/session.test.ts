// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BaseAccount, type EventTemplate } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure";
import type { NostrEvent } from "applesauce-core/helpers/event";

import { LocalAccount } from "./local-account";
import { getMetadata, updateMetadata, type BrainstormAccount } from "./metadata";
import {
  createSessions,
  hasSession,
  isAdmin,
  LOGIN_KIND,
  loginTemplate,
  SessionDeferredError,
  type SessionTransport,
} from "./session";
import { createFakeUnlockCache, fakePrompt, LOW_LOGN, PASSWORD } from "./test-fakes";

function base64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A backend token. `expires_date` is offsetless, exactly as the backend writes it. */
function fakeToken(payload: Record<string, unknown> = {}): string {
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ expires_date: "2020-01-01T00:00:00", ...payload }),
    "signature",
  ].join(".");
}

type FakeTransport = SessionTransport & {
  challenges: string[];
  verified: { pubkey: string; event: NostrEvent }[];
  admin: boolean;
  fail: boolean;
};

function createFakeTransport(): FakeTransport {
  return {
    challenges: [],
    verified: [],
    admin: false,
    fail: false,
    async challenge(pubkey) {
      if (this.fail) throw new Error("server unreachable");
      const challenge = `challenge-${pubkey.slice(0, 8)}-${this.challenges.length}`;
      this.challenges.push(challenge);
      return challenge;
    },
    async verify(pubkey, event) {
      if (this.fail) throw new Error("server unreachable");
      this.verified.push({ pubkey, event });
      return fakeToken({ is_admin: this.admin, sub: pubkey, jti: this.verified.length });
    },
  };
}

/** An Account that can always sign without asking — an extension or a bunker. */
class AlwaysSignableAccount extends BaseAccount<PrivateKeySigner, never, any> {
  static readonly type = "test-always-signable";
}

function signableAccount(): BrainstormAccount {
  const secretKey = generateSecretKey();
  const signer = new PrivateKeySigner(secretKey);
  const account = new AlwaysSignableAccount(getPublicKey(secretKey), signer);
  account.metadata = { remembered: true };
  return account as unknown as BrainstormAccount;
}

/** A Local Account holding both at-rest forms, Locked until something unlocks it. */
async function localAccount(requestPassword = fakePrompt()) {
  const unlockCache = createFakeUnlockCache();
  const secretKey = generateSecretKey();
  const account = await LocalAccount.fromKey(secretKey, {
    password: PASSWORD,
    logn: LOW_LOGN,
    unlockCache,
    requestPassword,
  });
  account.metadata = { remembered: true };
  return { account, unlockCache, requestPassword };
}

describe("the login challenge template", () => {
  it("is the one kind-22242 builder", () => {
    const template = loginTemplate("abc123");

    expect(template.kind).toBe(LOGIN_KIND);
    expect(LOGIN_KIND).toBe(22242);
    expect(template.content).toBe("");
    expect(template.tags).toEqual([
      ["t", "brainstorm_login"],
      ["challenge", "abc123"],
    ]);
    expect(template.created_at).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
  });
});

describe("authenticate", () => {
  it("signs the server's challenge and stores the token on the Account", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();

    const token = await sessions.authenticate(account);

    expect(getMetadata(account).session).toEqual({ token, isAdmin: false });
    const { pubkey, event } = transport.verified[0];
    expect(pubkey).toBe(account.pubkey);
    expect(event.kind).toBe(LOGIN_KIND);
    expect(event.tags).toContainEqual(["challenge", transport.challenges[0]]);
    expect(verifyEvent(event as any)).toBe(true);
  });

  it("writes isAdmin onto the session at the moment the token is minted", async () => {
    const transport = createFakeTransport();
    transport.admin = true;
    const sessions = createSessions(transport);
    const account = signableAccount();

    await sessions.authenticate(account);

    expect(getMetadata(account).session?.isAdmin).toBe(true);
    expect(isAdmin(account)).toBe(true);
  });

  it("shares one in-flight authentication, so two 401s make one challenge", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();

    const [first, second] = await Promise.all([
      sessions.authenticate(account),
      sessions.authenticate(account),
    ]);

    expect(first).toBe(second);
    expect(transport.challenges).toHaveLength(1);
  });
});

describe("sessions are per Account", () => {
  it("gives two Accounts independent sessions and never crosses the tokens", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const alice = signableAccount();
    const bob = signableAccount();

    const aliceToken = await sessions.authenticate(alice);
    transport.admin = true;
    const bobToken = await sessions.authenticate(bob);

    expect(aliceToken).not.toBe(bobToken);
    expect(getMetadata(alice).session).toEqual({ token: aliceToken, isAdmin: false });
    expect(getMetadata(bob).session).toEqual({ token: bobToken, isAdmin: true });
    expect(isAdmin(alice)).toBe(false);
    expect(isAdmin(bob)).toBe(true);

    // each Account signed its own challenge
    expect(transport.verified.map((v) => v.pubkey)).toEqual([alice.pubkey, bob.pubkey]);
    expect(await sessions.ensureSession(alice)).toBe(aliceToken);
    expect(await sessions.ensureSession(bob)).toBe(bobToken);
  });

  it("clears one Account's session without touching another's", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const alice = signableAccount();
    const bob = signableAccount();
    await sessions.authenticate(alice);
    const bobToken = await sessions.authenticate(bob);

    sessions.clearSession(alice);

    expect(getMetadata(alice).session).toBeUndefined();
    expect(hasSession(alice)).toBe(false);
    expect(getMetadata(bob).session?.token).toBe(bobToken);
  });

  it("takes the admin claim away with the session", async () => {
    const transport = createFakeTransport();
    transport.admin = true;
    const sessions = createSessions(transport);
    const account = signableAccount();
    await sessions.authenticate(account);

    sessions.clearSession(account);

    expect(isAdmin(account)).toBe(false);
  });
});

describe("ensureSession", () => {
  it("returns the stored token rather than minting a second one", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();

    const first = await sessions.ensureSession(account);
    const second = await sessions.ensureSession(account);

    expect(second).toBe(first);
    expect(transport.challenges).toHaveLength(1);
  });

  it("never parses the token's expiry — a long-dead token is still a session", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();
    // offsetless, so a client east of UTC would read it as still alive anyway
    const stale = fakeToken({ expires_date: "1999-01-01T00:00:00" });
    updateMetadata(account, { session: { token: stale, isAdmin: false } });

    expect(await sessions.ensureSession(account)).toBe(stale);
    expect(transport.challenges).toHaveLength(0);
  });

  it("re-authenticates after a refresh, which is the only thing that ends a session", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();
    const first = await sessions.ensureSession(account);

    const second = await sessions.refreshSession(account);

    expect(second).not.toBe(first);
    expect(getMetadata(account).session?.token).toBe(second);
  });
});

describe("a background 401", () => {
  it("re-authenticates inline for an Account that can sign silently", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();
    const first = await sessions.authenticate(account);

    const second = await sessions.refreshSession(account, { background: true });

    expect(second).not.toBe(first);
    expect(getMetadata(account).session?.token).toBe(second);
  });

  it("re-authenticates inline for an unlocked local key", async () => {
    const { account, requestPassword } = await localAccount();
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    expect(account.locked).toBe(false);

    const token = await sessions.refreshSession(account, { background: true });

    expect(getMetadata(account).session?.token).toBe(token);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("defers for a Locked local key rather than raising a password modal", async () => {
    const { account, requestPassword, unlockCache } = await localAccount();
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    await sessions.authenticate(account);

    unlockCache.wipe(); // no Unlock cache to fall back on: unlocking would prompt
    account.signer.lock();

    await expect(sessions.refreshSession(account, { background: true })).rejects.toBeInstanceOf(
      SessionDeferredError,
    );

    expect(requestPassword).not.toHaveBeenCalled();
    expect(transport.verified).toHaveLength(1); // only the first, user-initiated one
    expect(hasSession(account)).toBe(false); // the dead session is marked dead
  });

  it("defers before minting anything when a Locked Account has no session at all", async () => {
    const { account, requestPassword, unlockCache } = await localAccount();
    unlockCache.wipe();
    account.signer.lock();
    const transport = createFakeTransport();
    const sessions = createSessions(transport);

    await expect(sessions.ensureSession(account, { background: true })).rejects.toBeInstanceOf(
      SessionDeferredError,
    );

    expect(requestPassword).not.toHaveBeenCalled();
    expect(transport.challenges).toHaveLength(0);
  });

  it("unlocks from the Unlock cache rather than deferring — that path asks nothing", async () => {
    const { account, requestPassword } = await localAccount();
    account.signer.lock(); // a fresh tab: Locked, but the envelope is still there
    const transport = createFakeTransport();
    const sessions = createSessions(transport);

    const token = await sessions.ensureSession(account, { background: true });

    expect(getMetadata(account).session?.token).toBe(token);
    expect(account.locked).toBe(false);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("heals at the next user-initiated action, which may prompt", async () => {
    const { account, requestPassword, unlockCache } = await localAccount();
    unlockCache.wipe();
    account.signer.lock();
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    await expect(sessions.ensureSession(account, { background: true })).rejects.toThrow();

    const token = await sessions.ensureSession(account);

    expect(getMetadata(account).session?.token).toBe(token);
    expect(account.locked).toBe(false);
    expect(requestPassword).toHaveBeenCalledTimes(1);
  });
});

describe("a failed re-authentication", () => {
  it("keeps the keys and the other Accounts' sessions", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const { account } = await localAccount();
    const other = signableAccount();
    const otherToken = await sessions.authenticate(other);
    const atRest = { ...account.signer.data };

    transport.fail = true;
    await expect(sessions.refreshSession(account)).rejects.toThrow("server unreachable");

    expect(account.signer.data).toEqual(atRest);
    expect(getMetadata(other).session?.token).toBe(otherToken);
  });

  it("can be retried once the server is back", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();

    transport.fail = true;
    await expect(sessions.ensureSession(account)).rejects.toThrow("server unreachable");
    transport.fail = false;

    expect(await sessions.ensureSession(account)).toBeTypeOf("string");
    expect(hasSession(account)).toBe(true);
  });
});

describe("the admin check", () => {
  it("answers for the Account it is given, not for whoever is active", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const alice = signableAccount();
    const bob = signableAccount();
    await sessions.authenticate(alice);
    transport.admin = true;
    await sessions.authenticate(bob);

    // the old isAdminPubkey could only ever answer for the active user
    expect(isAdmin(bob)).toBe(true);
    expect(isAdmin(alice)).toBe(false);
  });

  it("is false for an Account that has never authenticated", () => {
    expect(isAdmin(signableAccount())).toBe(false);
  });
});

describe("the signing template used by sessions", () => {
  it("is the same builder the account signs", async () => {
    const transport = createFakeTransport();
    const sessions = createSessions(transport);
    const account = signableAccount();

    await sessions.authenticate(account);

    const { event } = transport.verified[0];
    const template: EventTemplate = loginTemplate(transport.challenges[0]);
    expect(event.kind).toBe(template.kind);
    expect(event.tags).toEqual(template.tags);
    expect(event.content).toBe(template.content);
  });
});
