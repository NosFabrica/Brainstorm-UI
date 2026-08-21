/**
 * A Session is the backend's acceptance of one Account: a challenge signed by
 * that Account, exchanged for a token. Applesauce has no such concept, so it
 * lives here — on the Account's metadata, so two Accounts can never share or
 * inherit each other's token.
 */
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { AccountManager, BaseAccount, EventTemplate } from "applesauce-accounts";
import { distinctUntilChanged, map, of, startWith, switchMap, type Observable } from "rxjs";

import { extractAdminFlag } from "@/lib/jwt";
import { withTabLock } from "./cross-tab";
import { getMetadata, updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";
import { activeAccount, canSignSilently } from "./signing";

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

/**
 * Whether a failure is "the Session is waiting for the user", rather than
 * anything being wrong. Name-based, so it survives a module reload and the trip
 * out through a query's `error`.
 */
export function isSessionDeferredError(error: unknown): boolean {
  return (
    error instanceof SessionDeferredError ||
    (error as { name?: string })?.name === "SessionDeferredError"
  );
}

export function getSessionToken(account: BrainstormAccount): string | undefined {
  return getMetadata(account).session?.token;
}

export function hasSession(account: BrainstormAccount): boolean {
  return !!getSessionToken(account);
}

/**
 * "Am I signed in?" — the most-asked question in the app. It is the Active
 * Account's Session, not a token in a global row: an Account with no Session
 * reads as signed out even while it is still listed, which is what lets the
 * deferred-session card offer to sign back in.
 */
export function activeHasSession(): boolean {
  const account = activeAccount();
  return !!account && hasSession(account);
}

/**
 * The same question, as a stream.
 *
 * `activeHasSession()` is read during render, so a component only learns the
 * answer changed when something else re-renders it. That is fine for a card that
 * lives next to the change and fatal for a React Query `enabled` gate: minting a
 * Session leaves those queries disabled, and `invalidateQueries` does not refetch
 * a disabled query — so unlocking cleared the notice and left the page empty
 * until a manual reload.
 */
export function activeHasSession$(
  manager: AccountManager<AccountMetadata>,
): Observable<boolean> {
  return manager.active$.pipe(
    switchMap((active) => {
      if (!active) return of(false);
      const account = active as unknown as BrainstormAccount;
      return (active as BaseAccount<any, any, AccountMetadata>).metadata$.pipe(
        startWith(null),
        map(() => hasSession(account)),
      );
    }),
    distinctUntilChanged(),
  );
}

/** Per Account: the claim is minted with the token and dies with it. */
export function isAdmin(account: BrainstormAccount): boolean {
  return getMetadata(account).session?.isAdmin === true;
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

export type SessionsOptions = {
  /** Serialises the exchange across tabs. Injected so tests don't need Web Locks. */
  lock?: typeof withTabLock;
};

export function createSessions(
  transport: SessionTransport,
  { lock = withTabLock }: SessionsOptions = {},
): Sessions {
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

    // Across tabs, `inFlight` can't help — the lock does. Whoever waited adopts
    // the token that arrived while they waited, so only one signer prompt fires.
    const before = getSessionToken(account);
    // A failure leaves the keys and every other Account alone — it costs a Session, not an identity.
    const attempt = lock(`brainstorm:session:${account.id}`, async () => {
      const arrived = getSessionToken(account);
      return arrived && arrived !== before ? arrived : exchange(account);
    }).finally(() => inFlight.delete(account.id));
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
 * A failure from the backend half of the exchange. Typed so a caller can tell a
 * server that didn't answer from a signer that refused — the two are the same
 * rejection otherwise, and the login screen says something different for each.
 */
export class SessionTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionTransportError";
  }
}

function asTransportError(err: unknown): never {
  throw new SessionTransportError(err instanceof Error ? err.message : "Failed to reach server.");
}

/**
 * The app's sessions, over the real backend. The transport is imported lazily so
 * this module stays cheap to pull in — `services/api` reaches for the DOM at load.
 */
export const sessions: Sessions = createSessions({
  async challenge(pubkey) {
    const { apiClient } = await import("@/services/api");
    return apiClient.getAuthChallenge(pubkey).catch(asTransportError);
  },
  async verify(pubkey, signed) {
    const { apiClient } = await import("@/services/api");
    const result = await apiClient.verifyAuthChallenge(pubkey, signed).catch(asTransportError);
    return result.data.token as string;
  },
});

export const authenticate = sessions.authenticate;
export const ensureSession = sessions.ensureSession;
export const refreshSession = sessions.refreshSession;
export const clearSession = sessions.clearSession;
