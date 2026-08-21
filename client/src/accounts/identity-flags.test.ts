// @vitest-environment node
/**
 * One identity can hold several Accounts — an extension row and a local row for
 * the same key both stand, and `adoptAccount` reorders them on every re-login.
 * These are the facts that must not depend on which row is asked: v1 kept them in
 * one pubkey-namespaced row per identity, and losing that would re-offer an
 * activation the user has already made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountManager, BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import type { AccountMetadata, BrainstormAccount } from "./metadata";

// `accountFor`/`accountsFor` read the app's singleton; this stands in for it so
// the suite never bootstraps real storage.
const held = vi.hoisted(() => ({ manager: undefined as unknown }));
vi.mock("@/accounts", async () => {
  const { AccountManager: Manager } = await import("applesauce-accounts");
  held.manager = new Manager();
  return { accountManager: held.manager, accounts: {}, accountMirror: {} };
});

import { accountFor, accountsFor } from "./login";
import { identityHas } from "./display";

const manager = () => held.manager as AccountManager<AccountMetadata>;

const key = generateSecretKey();
const PUBKEY = getPublicKey(key);

class Extensionish extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "extensionish";
}
class Localish extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "localish";
}

function add(Kind: typeof Extensionish | typeof Localish, metadata: Partial<AccountMetadata>) {
  const account = new Kind(PUBKEY, new PrivateKeySigner(key)) as unknown as BrainstormAccount;
  account.metadata = { remembered: true, ...metadata };
  manager().addAccount(account);
  return account;
}

beforeEach(() => {
  for (const account of [...manager().accounts]) manager().removeAccount(account);
});

describe("two Accounts for one identity", () => {
  it("both answer to the identity", () => {
    add(Extensionish, {});
    add(Localish, {});
    expect(accountsFor(PUBKEY)).toHaveLength(2);
  });

  it("resolves to the Active one, not to whichever was added first", () => {
    add(Extensionish, {});
    const local = add(Localish, {});
    manager().setActive(local);

    expect(accountFor(PUBKEY)?.type).toBe("localish");
  });

  it("carries a flag written on one row across to the other", () => {
    add(Extensionish, { nip85Activated: true });
    const local = add(Localish, {});
    manager().setActive(local);

    // the kind-10040 is published under the key, so switching Signer must not
    // re-offer the activation
    expect(identityHas(PUBKEY, "nip85Activated")).toBe(true);
  });

  it("is false only when no row for the identity carries it", () => {
    add(Extensionish, {});
    add(Localish, {});
    expect(identityHas(PUBKEY, "nip85Activated")).toBe(false);
    expect(identityHas(PUBKEY, "createdInApp")).toBe(false);
  });

  it("is false for an identity this device doesn't hold", () => {
    expect(identityHas(getPublicKey(generateSecretKey()), "createdInApp")).toBe(false);
    expect(identityHas(undefined, "createdInApp")).toBe(false);
  });
});

/**
 * The read above is `some()` across every row; the NIP-85 writes used to touch
 * one. Deactivating in Settings wrote the local row, `isNip85Activated` still
 * found `true` on the extension row, and the CTA never came back.
 */
describe("the NIP-85 activation flag", () => {
  it("clears every row, so a deactivation actually reads as one", async () => {
    const { markNip85Activated, clearNip85Activated, isNip85Activated } = await import("@/lib/nip85Activation");
    add(Extensionish, {});
    add(Localish, {});

    markNip85Activated(PUBKEY);
    expect(isNip85Activated(PUBKEY)).toBe(true);

    clearNip85Activated(PUBKEY);
    expect(isNip85Activated(PUBKEY)).toBe(false);
  });

  it("marks every row, so the answer doesn't depend on which one is asked", async () => {
    const { markNip85Activated } = await import("@/lib/nip85Activation");
    const extension = add(Extensionish, {});
    const local = add(Localish, {});

    markNip85Activated(PUBKEY);

    expect(extension.metadata?.nip85Activated).toBe(true);
    expect(local.metadata?.nip85Activated).toBe(true);
  });
});
