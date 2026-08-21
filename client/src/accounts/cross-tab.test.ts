// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AccountManager, BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import {
  createMirror,
  withTabLock,
  type CrossTabMessage,
  type MirroredChange,
  type TabChannel,
} from "./cross-tab";
import { LocalAccount } from "./local-account";
import { getMetadata, updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";
import { createFakeUnlockCache, fakePrompt, LOW_LOGN, PASSWORD } from "./test-fakes";

/** One channel, many tabs — and, as `BroadcastChannel` does, no echo to the sender. */
function createBus() {
  const ports = new Set<{ deliver(message: CrossTabMessage): void }>();
  return {
    sent: [] as CrossTabMessage[],
    open(): TabChannel {
      const handlers = new Set<(message: CrossTabMessage) => void>();
      const port = { deliver: (m: CrossTabMessage) => handlers.forEach((h) => h(m)) };
      ports.add(port);
      return {
        post: (message) => {
          this.sent.push(message);
          for (const other of ports) if (other !== port) other.deliver(message);
        },
        subscribe(handler) {
          handlers.add(handler);
          return () => handlers.delete(handler);
        },
        close: () => ports.delete(port),
      };
    },
  };
}

class TestAccount extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "test-account";
}

function testAccount(id: string): BrainstormAccount {
  const secretKey = generateSecretKey();
  const account = new TestAccount(getPublicKey(secretKey), new PrivateKeySigner(secretKey));
  account.id = id;
  account.metadata = { remembered: true };
  return account as unknown as BrainstormAccount;
}

/** A Local Account with a key held in memory, as a tab that has published has. */
async function unlockedAccount(id: string): Promise<LocalAccount> {
  const account = await LocalAccount.fromKey(generateSecretKey(), {
    password: PASSWORD,
    logn: LOW_LOGN,
    unlockCache: createFakeUnlockCache(),
    requestPassword: fakePrompt(),
  });
  account.id = id;
  account.metadata = { remembered: true };
  return account;
}

/** Two tabs sharing one channel, each with its own manager. */
function twoTabs() {
  const bus = createBus();
  const tab = () => {
    const manager = new AccountManager<AccountMetadata>();
    const changes: MirroredChange[] = [];
    const mirror = createMirror({ manager, channel: bus.open() });
    mirror.changes$.subscribe((change) => changes.push(change));
    return { manager, mirror, changes };
  };
  const tabs = { bus, a: tab(), b: tab() };
  /** Forget the setup, so an assertion only sees what the test itself caused. */
  return Object.assign(tabs, {
    settled() {
      bus.sent.length = 0;
      tabs.a.changes.length = 0;
      tabs.b.changes.length = 0;
    },
  });
}

/** The same identity in both managers — what a shared storage blob gives them. */
function sharedAccounts(a: AccountManager<AccountMetadata>, b: AccountManager<AccountMetadata>, ids: string[]) {
  const held: Record<string, { a: BrainstormAccount; b: BrainstormAccount }> = {};
  for (const id of ids) {
    const inA = testAccount(id);
    const inB = testAccount(id);
    a.addAccount(inA as any);
    b.addAccount(inB as any);
    held[id] = { a: inA, b: inB };
  }
  return held;
}

describe("mirroring the active account", () => {
  it("follows a switch in the other tab", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice", "bob"]);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();

    a.manager.setActive("bob");

    expect(b.manager.active?.id).toBe("bob");
    expect(b.changes).toEqual([{ account: held.bob.b, previous: held.alice.b }]);
  });

  it("follows a sign-out, so a tab can't be left signed in as nobody's account", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();

    a.manager.removeAccount("alice");

    expect(b.manager.active).toBeUndefined();
    expect(b.manager.accounts).toEqual([]);
    expect(b.changes).toEqual([{ account: null, previous: held.alice.b }]);
  });

  it("does not echo what it just applied", () => {
    const tabs = twoTabs();
    const { bus, a, b } = tabs;
    sharedAccounts(a.manager, b.manager, ["alice", "bob"]);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();

    a.manager.setActive("bob");

    expect(bus.sent).toEqual([{ type: "active-changed", accountId: "bob" }]);
  });

  it("says nothing about the accounts it restored at start", () => {
    const bus = createBus();
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(testAccount("alice") as any);
    manager.setActive("alice");

    createMirror({ manager, channel: bus.open() });

    expect(bus.sent).toEqual([]);
  });

  it("stays as it is when the other tab names an account it has never held", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    a.manager.addAccount(testAccount("carol") as any);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();

    a.manager.setActive("carol");

    expect(b.manager.active).toBe(held.alice.b);
    expect(b.changes).toEqual([]);
  });

  it("picks an account up from the blob when one is offered", () => {
    const bus = createBus();
    const manager = new AccountManager<AccountMetadata>();
    const carol = testAccount("carol");
    // as `createPersistence` does: deserialise it and put it in the manager
    const adopt = vi.fn(() => {
      manager.addAccount(carol as any);
      return carol;
    });
    createMirror({ manager, channel: bus.open(), persistence: { adopt } });

    const other = bus.open();
    other.post({ type: "active-changed", accountId: "carol" });

    expect(adopt).toHaveBeenCalledWith("carol");
    expect(manager.active).toBe(carol);
  });
});

describe("mirroring a removed account", () => {
  it("locks the key the other tab discarded, so this one can't still sign as it", async () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const inA = await unlockedAccount("alice");
    const inB = await unlockedAccount("alice");
    a.manager.addAccount(inA as any);
    b.manager.addAccount(inB as any);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();
    await inB.signEvent({ kind: 1, tags: [], content: "hi", created_at: 0 });
    expect(inB.signer.unlocked).toBe(true);

    a.manager.removeAccount(inA as any);

    expect(inB.signer.unlocked).toBe(false);
  });

  it("removes an account this tab isn't signed in as, quietly", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice", "bob"]);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();

    a.manager.removeAccount("bob");

    expect(b.manager.accounts).toEqual([held.alice.b]);
    expect(b.changes).toEqual([]);
  });
});

describe("mirroring a session", () => {
  it("adopts the token the other tab minted, so nobody is asked twice", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();

    updateMetadata(held.alice.a, { session: { token: "a-token", isAdmin: true } });

    expect(getMetadata(held.alice.b).session).toEqual({ token: "a-token", isAdmin: true });
  });

  it("mirrors a cleared session too", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    updateMetadata(held.alice.a, { session: { token: "a-token", isAdmin: false } });
    tabs.settled();

    updateMetadata(held.alice.a, { session: undefined });

    expect(getMetadata(held.alice.b).session).toBeUndefined();
  });

  it("says nothing for a metadata write that leaves the session alone", () => {
    const tabs = twoTabs();
    const { bus, a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    tabs.settled();

    updateMetadata(held.alice.a, { name: "Alice" });

    expect(bus.sent).toEqual([]);
    expect(getMetadata(held.alice.b).name).toBeUndefined();
  });
});

/**
 * Perspective rides on the Account's metadata, and `getActivePerspective()` reads
 * the *in-memory* copy — nothing reloads the persisted blob on a `storage` event.
 * So without carrying it here, a signed-in user's toggle never reaches their
 * other tabs, while an anonymous visitor's does.
 */
describe("mirroring the perspective", () => {
  it("follows a toggle made in the other tab", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    tabs.settled();

    updateMetadata(held.alice.a, { perspective: "mywot" });

    expect(getMetadata(held.alice.b).perspective).toBe("mywot");
  });

  it("follows it back", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    updateMetadata(held.alice.a, { perspective: "mywot" });
    tabs.settled();

    updateMetadata(held.alice.a, { perspective: "nosfabrica" });

    expect(getMetadata(held.alice.b).perspective).toBe("nosfabrica");
  });

  it("says nothing for a metadata write that leaves it alone", () => {
    const tabs = twoTabs();
    const { bus, a, b } = tabs;
    const held = sharedAccounts(a.manager, b.manager, ["alice"]);
    tabs.settled();

    updateMetadata(held.alice.a, { name: "Alice" });

    expect(bus.sent).toEqual([]);
  });
});

describe("stopping the mirror", () => {
  it("stops both listening and telling", () => {
    const tabs = twoTabs();
    const { a, b } = tabs;
    sharedAccounts(a.manager, b.manager, ["alice", "bob"]);
    a.manager.setActive("alice");
    b.manager.setActive("alice");
    tabs.settled();
    b.mirror.stop();

    a.manager.setActive("bob");
    b.manager.setActive("bob");

    expect(b.changes).toEqual([]);
    expect(a.manager.active?.id).toBe("bob");
  });
});

describe("the cross-tab lock", () => {
  it("serialises through Web Locks where they exist", async () => {
    const held: string[] = [];
    const request = vi.fn(async (name: string, task: () => Promise<unknown>) => {
      held.push(name);
      return task();
    });
    vi.stubGlobal("navigator", { locks: { request } });

    await expect(withTabLock("session:alice", async () => "done")).resolves.toBe("done");
    expect(held).toEqual(["session:alice"]);
    vi.unstubAllGlobals();
  });

  it("runs anyway where they don't — plain HTTP has no lock manager", async () => {
    vi.stubGlobal("navigator", {});

    await expect(withTabLock("session:alice", async () => "done")).resolves.toBe("done");
    vi.unstubAllGlobals();
  });
});

/**
 * Latent until now: `adoptAccount` always calls `setActive`, so a new Account
 * reached the other tab as a side effect of `active-changed` adopting it from the
 * blob. Nothing guarantees that stays true, and the failure if it stops is the
 * other tab's `save()` rewriting the blob without the Account it never heard about.
 */
describe("mirroring an added account", () => {
  it("tells the other tab, without making it switch", () => {
    const tabs = twoTabs();
    sharedAccounts(tabs.a.manager, tabs.b.manager, ["alice"]);
    tabs.a.manager.setActive(tabs.a.manager.getAccount("alice") as any);
    tabs.b.manager.setActive(tabs.b.manager.getAccount("alice") as any);
    tabs.settled();

    tabs.a.manager.addAccount(testAccount("bob") as any);

    expect(tabs.bus.sent).toContainEqual({ type: "account-added", accountId: "bob" });
    // adding is not switching — alice is still the one signing in both tabs
    expect(tabs.b.manager.active?.id).toBe("alice");
  });

  it("picks the new account up from the blob", () => {
    const bus = createBus();
    const manager = new AccountManager<AccountMetadata>();
    const bob = testAccount("bob");
    const adopt = vi.fn(() => {
      manager.addAccount(bob as any);
      return bob;
    });
    createMirror({ manager, channel: bus.open(), persistence: { adopt } });

    bus.open().post({ type: "account-added", accountId: "bob" });

    expect(adopt).toHaveBeenCalledWith("bob");
    expect(manager.getAccount("bob")).toBe(bob);
    expect(manager.active).toBeFalsy(); // adopted, not switched to
  });

  it("does not echo the account it was just told about", () => {
    const bus = createBus();
    const manager = new AccountManager<AccountMetadata>();
    const bob = testAccount("bob");
    createMirror({
      manager,
      channel: bus.open(),
      persistence: { adopt: () => (manager.addAccount(bob as any), bob) },
    });

    const told = { type: "account-added", accountId: "bob" } as const;
    bus.open().post(told);

    // only what the other tab said — adopting it must not announce it back
    expect(bus.sent).toEqual([told]);
  });
});
