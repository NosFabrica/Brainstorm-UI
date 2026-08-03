// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AccountManager, BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";

import type { AccountMetadata, BrainstormAccount } from "./metadata";
import {
  displayNameOf,
  displayOf,
  displayStream,
  npubOf,
  rememberProfile,
  type AccountDisplay,
} from "./display";

class TestAccount extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
  static readonly type = "test-identity";
}

function account(metadata: Partial<AccountMetadata> = {}): BrainstormAccount {
  const key = generateSecretKey();
  const created = new TestAccount(getPublicKey(key), new PrivateKeySigner(key));
  created.metadata = { remembered: true, ...metadata };
  return created as unknown as BrainstormAccount;
}

describe("the display of an account", () => {
  it("reads the display fields from metadata", () => {
    const a = account({ name: "Lira Flint", picture: "https://x/y.png", nip05: "lira@x" });

    expect(displayOf(a)).toMatchObject({
      pubkey: a.pubkey,
      displayName: "Lira Flint",
      picture: "https://x/y.png",
      nip05: "lira@x",
    });
  });

  it("uses the stored npub rather than re-encoding the pubkey", () => {
    const a = account({ npub: "npub1stored" });

    expect(npubOf(a)).toBe("npub1stored");
  });

  it("encodes the pubkey only when no npub was stored", () => {
    const a = account();

    expect(npubOf(a)).toBe(npubEncode(a.pubkey));
  });

  it("has no display name when the profile has never arrived", () => {
    expect(displayNameOf(account())).toBeUndefined();
  });

  it("is an admin only when this account's own session says so", () => {
    expect(displayOf(account()).isAdmin).toBe(false);
    expect(displayOf(account({ session: { token: "t", isAdmin: false } })).isAdmin).toBe(false);
    expect(displayOf(account({ session: { token: "t", isAdmin: true } })).isAdmin).toBe(true);
  });
});

describe("remembering a profile", () => {
  it("caches the display fields on the account", () => {
    const a = account({ createdInApp: true });

    rememberProfile(a, { name: "Lira", picture: "pic", nip05: "lira@x" });

    expect(a.metadata).toMatchObject({
      name: "Lira",
      picture: "pic",
      nip05: "lira@x",
      createdInApp: true,
    });
  });

  it("keeps what the profile doesn't mention", () => {
    const a = account({ name: "Lira", picture: "pic" });

    rememberProfile(a, { name: "Lira Flint" });

    expect(a.metadata).toMatchObject({ name: "Lira Flint", picture: "pic" });
  });

  it("clears a field the profile mentions as empty — a removed avatar goes", () => {
    const a = account({ name: "Lira", picture: "pic", nip05: "lira@x" });

    rememberProfile(a, { name: "Lira", picture: undefined, nip05: "" });

    expect(a.metadata).toMatchObject({ name: "Lira" });
    expect(a.metadata?.picture).toBeUndefined();
    expect(a.metadata?.nip05).toBeUndefined();
  });

  it("writes nothing when nothing changed, so no save is triggered", () => {
    const a = account({ name: "Lira", picture: "pic" });
    const seen = vi.fn();
    (a as unknown as BaseAccount<any, any, AccountMetadata>).metadata$.subscribe(seen);
    seen.mockClear();

    rememberProfile(a, { name: "Lira", picture: "pic" });

    expect(seen).not.toHaveBeenCalled();
  });
});

describe("the active account's display", () => {
  function watch() {
    const manager = new AccountManager<AccountMetadata>();
    const seen: (AccountDisplay | null)[] = [];
    const sub = displayStream(manager).subscribe((identity) => seen.push(identity));
    return { manager, seen, stop: () => sub.unsubscribe() };
  }

  it("is null while nobody is signed in", () => {
    const { seen, stop } = watch();

    expect(seen).toEqual([null]);
    stop();
  });

  it("follows the active account", () => {
    const { manager, seen, stop } = watch();
    const a = account({ name: "Lira" });

    manager.addAccount(a as any);
    manager.setActive(a as any);

    expect(seen.at(-1)).toMatchObject({ pubkey: a.pubkey, displayName: "Lira" });
    stop();
  });

  it("emits again when the profile metadata arrives after login", () => {
    const { manager, seen, stop } = watch();
    const a = account();
    manager.addAccount(a as any);
    manager.setActive(a as any);

    rememberProfile(a, { name: "Lira", picture: "pic" });

    expect(seen.at(-1)).toMatchObject({ displayName: "Lira", picture: "pic" });
    stop();
  });

  it("ignores metadata writes that change nothing it shows", () => {
    const { manager, seen, stop } = watch();
    const a = account({ name: "Lira" });
    manager.addAccount(a as any);
    manager.setActive(a as any);
    const before = seen.length;

    a.metadata = { ...a.metadata!, initialSetupDone: true };

    expect(seen.length).toBe(before);
    stop();
  });

  it("goes back to null when the account is signed out", () => {
    const { manager, seen, stop } = watch();
    const a = account();
    manager.addAccount(a as any);
    manager.setActive(a as any);

    manager.removeAccount(a as any);

    expect(seen.at(-1)).toBeNull();
    stop();
  });
});
