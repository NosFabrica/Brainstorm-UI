/**
 * Perspective is per-Account state, so it rides on the Active Account's metadata
 * rather than a pubkey-namespaced localStorage row. These run against the real
 * singleton, because that is what the non-hook accessors read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { accountManager } from "@/accounts";
import type { AccountMetadata } from "@/accounts/metadata";
import { getActivePerspective, hasStoredPerspective, setActivePerspective } from "./useActivePerspective";

class TestAccount extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "test-pov";
  // the real persistence is running here; serialise to something rather than throw
  toJSON() {
    return this.saveCommonFields({ signer: null as never });
  }
}

function signIn(): TestAccount {
  const key = generateSecretKey();
  const account = new TestAccount(getPublicKey(key), new PrivateKeySigner(key));
  account.metadata = { remembered: true };
  accountManager.addAccount(account as any);
  accountManager.setActive(account as any);
  return account;
}

afterEach(() => {
  for (const account of [...accountManager.accounts]) accountManager.removeAccount(account);
});

describe("the active perspective", () => {
  it("defaults to the house view, and says so", () => {
    expect(getActivePerspective()).toBe("nosfabrica");
    expect(hasStoredPerspective()).toBe(false);
  });

  it("is stored on the Account, not in a pubkey-namespaced row", () => {
    const account = signIn();

    setActivePerspective("mywot");

    expect(account.metadata?.perspective).toBe("mywot");
    expect(getActivePerspective()).toBe("mywot");
    expect(localStorage.getItem(`brainstorm_active_pov:${account.pubkey}`)).toBeNull();
  });

  it("a second Account keeps its own", () => {
    signIn();
    setActivePerspective("mywot");

    signIn();

    expect(getActivePerspective()).toBe("nosfabrica");
    expect(hasStoredPerspective()).toBe(false);
  });

  it("falls back to its own row while nobody is signed in", () => {
    setActivePerspective("mywot");

    expect(localStorage.getItem("brainstorm_active_pov:anon")).toBe("mywot");
    expect(getActivePerspective()).toBe("mywot");
  });
});
