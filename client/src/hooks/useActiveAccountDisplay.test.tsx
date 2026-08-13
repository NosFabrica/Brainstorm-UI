import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AccountManager, BaseAccount } from "applesauce-accounts";
import { AccountsProvider, EventStoreProvider } from "applesauce-react/providers";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { rememberProfile } from "@/accounts/display";
import { eventStore } from "@/lib/eventStore";
import type { AccountMetadata, BrainstormAccount } from "@/accounts/metadata";
import { useActiveAccountDisplay } from "./useActiveAccountDisplay";

class TestAccount extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "test-identity-hook";
}

function account(metadata: Partial<AccountMetadata> = {}): BrainstormAccount {
  const key = generateSecretKey();
  const created = new TestAccount(getPublicKey(key), new PrivateKeySigner(key));
  created.metadata = { remembered: true, ...metadata };
  return created as unknown as BrainstormAccount;
}

function AccountDisplay() {
  const identity = useActiveAccountDisplay();
  if (!identity) return <p>signed out</p>;
  return (
    <p>
      {identity.displayName ?? "Anon"}
      {identity.isAdmin ? " (admin)" : ""}
    </p>
  );
}

function renderWith(manager: AccountManager<AccountMetadata>) {
  // The hook reads the ProfileModel now, so it needs the store the app mounts.
  return render(
    <EventStoreProvider eventStore={eventStore}>
      <AccountsProvider manager={manager as any}>
        <AccountDisplay />
      </AccountsProvider>
    </EventStoreProvider>,
  );
}

describe("useActiveAccountDisplay", () => {
  it("has the identity on the very first render", () => {
    const manager = new AccountManager<AccountMetadata>();
    const a = account({ name: "Lira Flint" });
    manager.addAccount(a as any);
    manager.setActive(a as any);

    renderWith(manager);

    expect(screen.getByText("Lira Flint")).toBeInTheDocument();
  });

  it("shows the name and admin badge once they arrive after login", () => {
    const manager = new AccountManager<AccountMetadata>();
    const a = account();
    manager.addAccount(a as any);
    manager.setActive(a as any);
    renderWith(manager);
    expect(screen.getByText("Anon")).toBeInTheDocument();

    act(() => {
      rememberProfile(a, { name: "Lira Flint" });
      a.metadata = { ...a.metadata!, session: { token: "t", isAdmin: true } };
    });

    expect(screen.getByText("Lira Flint (admin)")).toBeInTheDocument();
  });

  it("clears when the account signs out", () => {
    const manager = new AccountManager<AccountMetadata>();
    const a = account({ name: "Lira Flint" });
    manager.addAccount(a as any);
    manager.setActive(a as any);
    renderWith(manager);

    act(() => manager.removeAccount(a as any));

    expect(screen.getByText("signed out")).toBeInTheDocument();
  });
});

/**
 * What ticket 05 is actually for. The display cache paints first and the model
 * is the truth, so a kind-0 arriving from anywhere — a late relay, another tab,
 * the user's own edit — reaches every name and avatar on screen without a
 * refetch or a reload.
 */
describe("a newer kind-0 arriving after the first paint", () => {
  /**
   * The store verifies every event it is given, and verification hashes. Under
   * jsdom that throws "expected Uint8Array, got object" — jsdom's typed arrays
   * come from a different realm than the one @noble's strict `instanceof` checks
   * expect, which is why every hashing suite in this repo opts into the node
   * environment. A component test cannot: it needs a DOM.
   *
   * So verification is off for these three, and only these three. What is under
   * test is whether a kind-0 reaching the store reaches the screen; whether the
   * store checks signatures is the store's business and its own concern.
   */
  const realVerify = eventStore.verifyEvent;
  beforeAll(() => { eventStore.verifyEvent = undefined; });
  afterAll(() => { eventStore.verifyEvent = realVerify; });

  function withKey() {
    const key = generateSecretKey();
    const created = new TestAccount(getPublicKey(key), new PrivateKeySigner(key));
    created.metadata = { remembered: true };
    return { pubkey: getPublicKey(key), account: created as unknown as BrainstormAccount };
  }

  /**
   * Built rather than signed: the app's store has no `verifyEvent`, and signing
   * here would only drag @noble's Uint8Array realm check into jsdom for nothing.
   */
  let nextId = 0;
  function kind0(pubkey: string, content: Record<string, unknown>) {
    return {
      id: `${nextId++}`.padStart(64, "e"),
      pubkey,
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(content),
      sig: "s".repeat(128),
    };
  }

  it("replaces the cached name, with no refetch", () => {
    const { pubkey, account: held } = withKey();
    rememberProfile(held, { name: "Cached" });
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(held as never);
    manager.setActive(held as never);

    renderWith(manager);
    expect(screen.getByText("Cached")).toBeTruthy();

    act(() => {
      eventStore.add(kind0(pubkey, { name: "From the relay" }));
    });

    expect(screen.getByText("From the relay")).toBeTruthy();
  });

  it("writes what it learned back to the cache, so the picker keeps up", () => {
    const { pubkey, account: held } = withKey();
    rememberProfile(held, { name: "Cached" });
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(held as never);
    manager.setActive(held as never);

    renderWith(manager);
    act(() => {
      eventStore.add(kind0(pubkey, { name: "From the relay" }));
    });

    expect(held.metadata?.name).toBe("From the relay");
  });

  // A kind-0 is the whole profile document, so a picture missing from it means
  // the avatar was removed. Keeping the cached one would leave a deleted avatar
  // on screen until the next reload.
  it("clears a cached avatar the newer profile no longer carries", () => {
    const { pubkey, account: held } = withKey();
    rememberProfile(held, { name: "Cached", picture: "https://example.test/a.png" });
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(held as never);
    manager.setActive(held as never);

    renderWith(manager);
    act(() => {
      eventStore.add(kind0(pubkey, { name: "Renamed" }));
    });

    expect(held.metadata?.picture).toBeUndefined();
  });
});
