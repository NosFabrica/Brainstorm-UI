/**
 * Two tabs, one identity.
 *
 * Typed messages over a `BroadcastChannel`, not `storage` events: a storage
 * event says only "the blob moved", so a listener has to diff and re-hydrate —
 * and `manager.fromJSON` does **not** clear first, despite its doc comment, so
 * naive re-hydration duplicates every Account. Storage stays the source of truth
 * at tab *start*; from then on the messages are.
 *
 * The unlocked key is deliberately not among them. It lives in per-tab module
 * memory and putting it on a channel would put a plaintext key there, so a
 * following tab arrives Locked. The one thing that *must* propagate is the
 * opposite: a removed Account has to be locked and dropped in every tab, or a
 * tab keeps signing as an identity this browser no longer holds.
 */
import type { AccountManager, BaseAccount } from "applesauce-accounts";
import { EMPTY, map, merge, Subject, switchMap, type Observable } from "rxjs";

import { LocalAccount } from "./local-account";
import { getMetadata, updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";
import type { Persistence } from "./persist";

export const CHANNEL_NAME = "brainstorm_accounts";

export type SessionRecord = NonNullable<AccountMetadata["session"]>;

export type CrossTabMessage =
  | { type: "active-changed"; accountId: string | null }
  | { type: "account-removed"; accountId: string }
  | { type: "session-updated"; accountId: string; session: SessionRecord | null };

export interface TabChannel {
  post(message: CrossTabMessage): void;
  /** Messages from *other* tabs. `BroadcastChannel` never echoes to its sender. */
  subscribe(handler: (message: CrossTabMessage) => void): () => void;
  close(): void;
}

const MESSAGE_TYPES: CrossTabMessage["type"][] = [
  "active-changed",
  "account-removed",
  "session-updated",
];

function isCrossTabMessage(value: unknown): value is CrossTabMessage {
  return MESSAGE_TYPES.includes((value as CrossTabMessage)?.type);
}

/** A channel that goes nowhere, for server rendering and ancient browsers. */
export function silentChannel(): TabChannel {
  return { post: () => {}, subscribe: () => () => {}, close: () => {} };
}

export function browserChannel(name = CHANNEL_NAME): TabChannel {
  if (typeof BroadcastChannel === "undefined") return silentChannel();
  const channel = new BroadcastChannel(name);
  return {
    post(message) {
      try {
        channel.postMessage(message);
      } catch (err) {
        console.error("accounts: could not tell the other tabs", err);
      }
    },
    subscribe(handler) {
      const listener = (event: MessageEvent) => {
        if (isCrossTabMessage(event.data)) handler(event.data);
      };
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
    close: () => channel.close(),
  };
}

/**
 * Run `task` while no other tab runs it under the same name. Two tabs both
 * hitting a 401 otherwise both re-auth, which for an extension or a bunker is
 * two approval prompts seconds apart for the same thing.
 *
 * `navigator.locks` is secure-context only, so on the plain-HTTP self-hosted
 * deployments this runs unguarded and accepts the race rather than throwing.
 */
export function withTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return task();
  return locks.request(name, task) as Promise<T>;
}

/** An identity change this tab did not make — what the UI has to react to. */
export type MirroredChange = {
  /** Who this tab is now. Null when the other tab signed out. */
  account: BrainstormAccount | null;
  /** Who it was, so a page scoped to them knows to leave. */
  previous: BrainstormAccount | null;
};

export type MirrorOptions = {
  manager: AccountManager<AccountMetadata>;
  channel?: TabChannel;
  /**
   * Lets a tab pick up an Account added after it started — the sender can't put
   * the Account itself on the channel, so the blob answers for it.
   */
  persistence?: Pick<Persistence, "adopt">;
};

export type Mirror = {
  /** Identity changes applied from another tab. Local ones never appear here. */
  changes$: Observable<MirroredChange>;
  stop(): void;
};

function metadataOf(account: BrainstormAccount): Observable<unknown> {
  return (account as unknown as BaseAccount<any, any, AccountMetadata>).metadata$;
}

export function createMirror({
  manager,
  channel = browserChannel(),
  persistence,
}: MirrorOptions): Mirror {
  const changes = new Subject<MirroredChange>();

  /** True while an inbound message is being applied, so applying it says nothing back. */
  let applying = false;
  const post = (message: CrossTabMessage) => {
    if (!applying) channel.post(message);
  };

  let announcedActive = manager.active?.id ?? null;
  let known = new Set(manager.accounts.map((account) => account.id));
  const announcedSessions = new Map<string, string | undefined>();

  const subscription = manager.active$.subscribe((active) => {
    const id = active?.id ?? null;
    if (id === announcedActive) return;
    announcedActive = id;
    post({ type: "active-changed", accountId: id });
  });

  subscription.add(
    manager.accounts$.subscribe((accounts) => {
      const ids = new Set(accounts.map((account) => account.id));
      for (const id of known) {
        if (ids.has(id)) continue;
        announcedSessions.delete(id);
        post({ type: "account-removed", accountId: id });
      }
      known = ids;
    }),
  );

  // Sessions live on metadata, so watching it covers minting, adopting and
  // clearing alike — no session call site has to remember to announce itself.
  subscription.add(
    manager.accounts$
      .pipe(
        switchMap((accounts) =>
          accounts.length
            ? merge(
                ...accounts.map((account) =>
                  metadataOf(account as BrainstormAccount).pipe(map(() => account)),
                ),
              )
            : EMPTY,
        ),
      )
      .subscribe((account) => {
        const session = getMetadata(account as BrainstormAccount).session;
        const first = !announcedSessions.has(account.id);
        const unchanged = announcedSessions.get(account.id) === session?.token;
        announcedSessions.set(account.id, session?.token);
        if (first || unchanged) return;
        post({ type: "session-updated", accountId: account.id, session: session ?? null });
      }),
  );

  /** Held already, or restorable from the blob. `adopt` answers both. */
  function held(id: string): BrainstormAccount | null {
    return (persistence?.adopt(id) ?? manager.getAccount(id) ?? null) as BrainstormAccount | null;
  }

  function applyActive(accountId: string | null): void {
    const previous = (manager.active ?? null) as BrainstormAccount | null;
    if ((previous?.id ?? null) === accountId) return;

    if (accountId === null) {
      manager.clearActive();
      changes.next({ account: null, previous });
      return;
    }

    // An identity this tab has never held and the blob doesn't explain — better
    // to stay as we are than to sign out over a message we can't act on.
    const account = held(accountId);
    if (!account) return;
    manager.setActive(account as any);
    changes.next({ account, previous });
  }

  function applyRemoved(accountId: string): void {
    const account = manager.getAccount(accountId) as BrainstormAccount | undefined;
    if (!account) return;
    const previous = (manager.active ?? null) as BrainstormAccount | null;
    const wasActive = previous?.id === account.id;

    manager.removeAccount(account as any);
    // The security-relevant half: an in-memory key must not outlive its Account.
    if (account instanceof LocalAccount) account.signer.lock();

    if (wasActive) changes.next({ account: null, previous });
  }

  function applySession(accountId: string, session: SessionRecord | null): void {
    const account = manager.getAccount(accountId) as BrainstormAccount | undefined;
    if (!account) return;
    if (getMetadata(account).session?.token === session?.token) return;
    updateMetadata(account, { session: session ?? undefined });
  }

  const stopListening = channel.subscribe((message) => {
    applying = true;
    try {
      switch (message.type) {
        case "active-changed":
          applyActive(message.accountId);
          break;
        case "account-removed":
          applyRemoved(message.accountId);
          break;
        case "session-updated":
          applySession(message.accountId, message.session);
          break;
      }
    } catch (err) {
      console.error("accounts: could not follow another tab", err);
    } finally {
      applying = false;
    }
  });

  return {
    changes$: changes.asObservable(),
    stop() {
      subscription.unsubscribe();
      stopListening();
      channel.close();
      changes.complete();
    },
  };
}
