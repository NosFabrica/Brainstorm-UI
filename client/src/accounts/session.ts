/**
 * A Session is the backend's acceptance of one Account: a challenge signed by
 * that Account, exchanged for a token. Applesauce has no such concept, so it
 * lives here — on the Account's metadata, so two Accounts can never share or
 * inherit each other's token.
 */
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { EventTemplate } from "applesauce-accounts";

import { extractAdminFlag } from "@/lib/jwt";
import { LocalAccount } from "./local-account";
import { getMetadata, updateMetadata, type BrainstormAccount } from "./metadata";

export const LOGIN_KIND = 22242;

/** The one kind-22242 builder. Every login and re-auth signs exactly this. */
export function loginTemplate(challenge: string): EventTemplate {
  return {
    kind: LOGIN_KIND,
    tags: [
      ["t", "brainstorm_login"],
      ["challenge", challenge],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** The backend half of the exchange, injected so tests never reach the network. */
export type SessionTransport = {
  challenge(pubkey: string): Promise<string>;
  verify(pubkey: string, signed: NostrEvent): Promise<string>;
};

export type SessionOptions = {
  /** Nobody asked for this request — a 401 from whatever happened to fire. */
  background?: boolean;
};

/**
 * Thrown when a background re-auth would have prompted. The Session is left
 * absent; the next user-initiated action mints one, unlocking as it goes.
 */
export class SessionDeferredError extends Error {
  constructor(message = "Session deferred until the next user-initiated action") {
    super(message);
    this.name = "SessionDeferredError";
  }
}

export function getSessionToken(account: BrainstormAccount): string | undefined {
  return getMetadata(account).session?.token;
}

export function hasSession(account: BrainstormAccount): boolean {
  return !!getSessionToken(account);
}

/** Per Account: the claim is minted with the token and dies with it. */
export function isAdmin(account: BrainstormAccount): boolean {
  return getMetadata(account).session?.isAdmin === true;
}

/**
 * Whether this Account can be authenticated without raising the Recovery-password
 * modal. A Locked local key is asked to unlock from its Unlock cache — silent, and
 * the only way to find out. Extension and bunker Accounts may prompt in their own
 * app, which their users expect and their signers normally remember.
 */
function canSignSilently(account: BrainstormAccount): Promise<boolean> {
  if (!(account instanceof LocalAccount) || !account.locked) return Promise.resolve(true);
  return account.unlockSilently();
}

export type Sessions = {
  /** Mint a Session, replacing any existing one. Always user-initiated. */
  authenticate(account: BrainstormAccount, options?: SessionOptions): Promise<string>;
  /** The Account's token, minting one only if it has none. */
  ensureSession(account: BrainstormAccount, options?: SessionOptions): Promise<string>;
  /** Discard this Account's Session and mint a fresh one — the 401 path. */
  refreshSession(account: BrainstormAccount, options?: SessionOptions): Promise<string>;
  /** Forget this Account's Session, and with it the admin claim. */
  clearSession(account: BrainstormAccount): void;
};

export function createSessions(transport: SessionTransport): Sessions {
  /** Two 401s for one Account share a single exchange, so signers prompt once. */
  const inFlight = new Map<string, Promise<string>>();

  function clearSession(account: BrainstormAccount): void {
    if (!getMetadata(account).session) return;
    updateMetadata(account, { session: undefined });
  }

  async function exchange(account: BrainstormAccount): Promise<string> {
    const challenge = await transport.challenge(account.pubkey);
    const signed = await account.signEvent(loginTemplate(challenge));
    const token = await transport.verify(account.pubkey, signed);

    // one write, so the token and the claim it carries cannot drift apart
    updateMetadata(account, { session: { token, isAdmin: extractAdminFlag(token) } });
    return token;
  }

  async function authenticate(
    account: BrainstormAccount,
    options: SessionOptions = {},
  ): Promise<string> {
    if (options.background && !(await canSignSilently(account))) {
      clearSession(account);
      throw new SessionDeferredError();
    }

    const pending = inFlight.get(account.id);
    if (pending) return pending;

    // A failure leaves the keys and every other Account alone — it costs a Session, not an identity.
    const attempt = exchange(account).finally(() => inFlight.delete(account.id));
    inFlight.set(account.id, attempt);
    return attempt;
  }

  return {
    authenticate,
    clearSession,
    ensureSession(account, options) {
      const token = getSessionToken(account);
      // Present or absent, never "expiring": the token's `expires_date` carries no
      // timezone offset, so a dead one reads as alive. Nothing here parses it.
      if (token) return Promise.resolve(token);
      return authenticate(account, options);
    },
    refreshSession(account, options) {
      clearSession(account);
      return authenticate(account, options);
    },
  };
}

/**
 * The app's sessions, over the real backend. The transport is imported lazily so
 * this module stays cheap to pull in — `services/api` reaches for the DOM at load.
 */
export const sessions: Sessions = createSessions({
  async challenge(pubkey) {
    const { apiClient } = await import("@/services/api");
    return apiClient.getAuthChallenge(pubkey);
  },
  async verify(pubkey, signed) {
    const { apiClient } = await import("@/services/api");
    const result = await apiClient.verifyAuthChallenge(pubkey, signed);
    return result.data.token as string;
  },
});

export const authenticate = sessions.authenticate;
export const ensureSession = sessions.ensureSession;
export const refreshSession = sessions.refreshSession;
export const clearSession = sessions.clearSession;
