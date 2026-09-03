// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ExtensionAccount } from "applesauce-accounts/accounts";
import { ExtensionSigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { LocalAccount } from "./local-account";
import { LocalSigner } from "./local-signer";
import { updateMetadata, type BrainstormAccount } from "./metadata";
import { healthOf, isSelectable, isUnbackedUp, pickerIdentities, removalLosesKey, signerKindOf, withActiveAccount } from "./picker";
import { createFakeUnlockCache, keyFixture, type FakeUnlockCache } from "./test-fakes";

function localRow(
  data: { ncryptsec?: string; envelope?: string },
  unlockCache: FakeUnlockCache,
  pubkey: string,
): LocalAccount {
  return new LocalAccount(pubkey, new LocalSigner(pubkey, data, { unlockCache }));
}

function extensionRow(pubkey: string): BrainstormAccount {
  return new ExtensionAccount(pubkey, new ExtensionSigner()) as unknown as BrainstormAccount;
}

function remembered<T extends BrainstormAccount>(account: T, name?: string): T {
  updateMetadata(account, { remembered: true, name, npub: `npub-${account.pubkey.slice(0, 6)}` });
  return account;
}

describe("which signer is behind a row", () => {
  it("names the kinds it can tell apart", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();

    expect(signerKindOf(localRow({ envelope }, unlockCache, pubkey))).toBe("key");
    expect(signerKindOf(extensionRow(pubkey))).toBe("extension");
    // Every NIP-46 signer is one kind — nsec.app, Amber's bunker mode, Keycast.
    expect(signerKindOf({ type: "nostr-connect" } as BrainstormAccount)).toBe("remote");
    // Amber over intents is not one of them: it never touches a relay.
    expect(signerKindOf({ type: "amber-clipboard" } as BrainstormAccount)).toBe("amber");
  });
});

describe("a row that signs through Amber", () => {
  it("is a dead end where the browser can't hand off to it", async () => {
    // jsdom is not Android, so `AmberClipboardSigner.SUPPORTED` is false — the
    // same state a phone reaches with “Desktop site” on, or over plain HTTP.
    const amber = { type: "amber-clipboard", id: "amber-1" } as BrainstormAccount;
    expect(await healthOf(amber, "present")).toBe("signer-unusable");
    expect(isSelectable(await healthOf(amber, "present"))).toBe(false);
  });
});

describe("a row that signs through a remote signer", () => {
  it("is taken on trust — probing it is a relay round trip that can hang", async () => {
    const remote = { type: "nostr-connect", id: "remote-1" } as BrainstormAccount;
    expect(await healthOf(remote, "missing")).toBe("ok");
  });
});

describe("the health of a local key", () => {
  it("is well when the Unlock cache opens it and a Backup stands behind it", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();

    expect(await healthOf(localRow({ ncryptsec, envelope }, unlockCache, pubkey), "present")).toBe(
      "ok",
    );
  });

  it("is marked when nothing but this device holds the key", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();

    expect(await healthOf(localRow({ envelope }, unlockCache, pubkey), "present")).toBe("no-backup");
  });

  it("is well where the User pasted the key themselves — they hold it, not us", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope }, unlockCache, pubkey);
    updateMetadata(account as unknown as BrainstormAccount, { remembered: true, backedUp: true });

    expect(await healthOf(account, "present")).toBe("ok");
  });

  it("is well with only a Backup — selecting it asks for the password", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();

    expect(await healthOf(localRow({ ncryptsec }, unlockCache, pubkey), "present")).toBe("ok");
  });

  it("is the dead end when a stale cache is all there ever was", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope }, unlockCache, pubkey);
    unlockCache.wipe();

    expect(await healthOf(account, "present")).toBe("key-unavailable");
  });

  it("survives the check locked — the row was never chosen", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope }, unlockCache, pubkey);

    await healthOf(account, "present");

    expect(account.locked).toBe(true);
  });
});

/**
 * The two questions look alike and are not: `isUnbackedUp` asks whether the key
 * is portable, `removalLosesKey` whether the User has a copy of it anywhere but
 * here. A Backup minted at signup and never downloaded splits them, and that is
 * the state a skipped backup step leaves behind.
 */
describe("what removing an account costs", () => {
  it("loses the key where the Backup was minted but never taken", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope, ncryptsec: "ncryptsec1minted" }, unlockCache, pubkey);
    updateMetadata(account as unknown as BrainstormAccount, { remembered: true });

    expect(isUnbackedUp(account as unknown as BrainstormAccount)).toBe(false); // portable in principle
    expect(removalLosesKey(account as unknown as BrainstormAccount)).toBe(true); // and only here in fact
  });

  it("does not once the Backup has been handed over", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope, ncryptsec: "ncryptsec1minted" }, unlockCache, pubkey);
    updateMetadata(account as unknown as BrainstormAccount, { remembered: true, backedUp: true });

    expect(removalLosesKey(account as unknown as BrainstormAccount)).toBe(false);
  });

  it("says nothing about a key this browser never held", () => {
    const account = remembered(extensionRow("a".repeat(64)));

    expect(removalLosesKey(account)).toBe(false);
  });
});

describe("an account this device didn't keep", () => {
  it("is nowhere in a list — it dies with the tab, so offering it would be a lie", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope }, unlockCache, pubkey) as unknown as BrainstormAccount;
    updateMetadata(account, { remembered: false, name: "Alice" });

    expect(pickerIdentities([account], () => "ok")).toEqual([]);
  });

  it("still heads the switcher where it is the one signing", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope }, unlockCache, pubkey) as unknown as BrainstormAccount;
    updateMetadata(account, { remembered: false, name: "Alice", npub: "npub1alice" });

    const [identity] = withActiveAccount([], account);

    expect(identity.name).toBe("Alice");
    expect(identity.npub).toBe("npub1alice");
    // signing right now, so it is well — and not a way to switch to itself
    expect(identity.rows).toEqual([
      { account, signer: "key", health: "ok", selectable: false, sessionOnly: true },
    ]);
  });

  /**
   * The switcher asks a different question from the login picker: not "what will
   * be here next launch" but "what are you holding right now". Hiding a
   * session-only Account the moment it stops being Active left it signed in, with
   * its key unlocked in memory, and no way back to it but pasting the key again.
   */
  it("is listed in the switcher, marked as this tab's, even when it is not the active one", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = localRow({ envelope }, unlockCache, pubkey) as unknown as BrainstormAccount;
    updateMetadata(account, { remembered: false, name: "Alice", npub: "npub1alice" });

    const [identity] = pickerIdentities([account], () => "ok", { includeSessionOnly: true });

    expect(identity.rows).toEqual([
      { account, signer: "key", health: "ok", selectable: true, sessionOnly: true },
    ]);
  });

  it("is not confused with a kept one: only the unkept row is marked", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const kept = remembered(extensionRow(pubkey), "Alice");
    const unkept = localRow({ envelope }, unlockCache, pubkey) as unknown as BrainstormAccount;
    updateMetadata(unkept, { remembered: false });

    const [identity] = pickerIdentities([kept, unkept], () => "ok", { includeSessionOnly: true });

    expect(identity.rows.map((row) => row.sessionOnly)).toEqual([false, true]);
  });

  it("joins its identity rather than repeating the same face under a second heading", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const kept = remembered(extensionRow(pubkey), "Alice");
    const unkept = localRow({ envelope }, unlockCache, pubkey) as unknown as BrainstormAccount;
    const listed = pickerIdentities([kept], () => "ok");

    const identities = withActiveAccount(listed, unkept);

    expect(identities).toHaveLength(1);
    expect(identities[0].rows.map((row) => row.signer)).toEqual(["extension", "key"]);
  });

  it("leaves the list alone where the active account is already in it", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const kept = remembered(localRow({ envelope }, unlockCache, pubkey), "Alice");
    const listed = pickerIdentities([kept], () => "ok");

    expect(withActiveAccount(listed, kept as unknown as BrainstormAccount)).toBe(listed);
  });
});

describe("the health of an extension", () => {
  it("says nothing until the wait is over — extensions inject late", async () => {
    const pubkey = getPublicKey(generateSecretKey());

    expect(await healthOf(extensionRow(pubkey), "checking")).toBe("checking");
  });

  it("is well once one has answered", async () => {
    const pubkey = getPublicKey(generateSecretKey());

    expect(await healthOf(extensionRow(pubkey), "present")).toBe("ok");
  });

  it("is marked when none appeared", async () => {
    const pubkey = getPublicKey(generateSecretKey());

    expect(await healthOf(extensionRow(pubkey), "missing")).toBe("extension-missing");
  });
});

describe("the rows of the picker", () => {
  it("lists only the Accounts this device kept", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const kept = remembered(localRow({ envelope }, unlockCache, pubkey), "Alice");
    const forThisTab = localRow({ envelope }, unlockCache, getPublicKey(generateSecretKey()));

    const identities = pickerIdentities([kept, forThisTab], () => "ok");

    expect(identities).toHaveLength(1);
    expect(identities[0].name).toBe("Alice");
  });

  it("gives an identity with one Signer a single row", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = remembered(localRow({ envelope }, unlockCache, pubkey));

    const [identity] = pickerIdentities([account], () => "ok");

    expect(identity.rows).toHaveLength(1);
    expect(identity.pubkey).toBe(pubkey);
  });

  it("gathers two Signers for one identity under one heading", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const key = remembered(localRow({ envelope }, unlockCache, pubkey), "Alice");
    const extension = remembered(extensionRow(pubkey), "Alice");

    const identities = pickerIdentities([key, extension], () => "ok");

    expect(identities).toHaveLength(1);
    expect(identities[0].rows.map((row) => row.signer)).toEqual(["key", "extension"]);
  });

  it("keeps separate identities apart, in the order they were added", async () => {
    const unlockCache = createFakeUnlockCache();
    const first = remembered(
      localRow({ ncryptsec: "x" }, unlockCache, getPublicKey(generateSecretKey())),
      "Bob",
    );
    const second = remembered(
      localRow({ ncryptsec: "y" }, unlockCache, getPublicKey(generateSecretKey())),
      "Carol",
    );

    const identities = pickerIdentities([first, second], () => "ok");

    expect(identities.map((identity) => identity.name)).toEqual(["Bob", "Carol"]);
  });

  it("takes the identity's face from whichever Signer knows it", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const anonymous = remembered(localRow({ envelope }, unlockCache, pubkey));
    const known = remembered(extensionRow(pubkey), "Alice");
    updateMetadata(known, { picture: "https://example.test/alice.png" });

    const [identity] = pickerIdentities([anonymous, known], () => "ok");

    expect(identity.name).toBe("Alice");
    expect(identity.picture).toBe("https://example.test/alice.png");
  });

  it("refuses to sign in with a row whose Signer can't sign here", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const dead = remembered(localRow({ envelope }, unlockCache, pubkey), "Dave");
    const gone = remembered(extensionRow(getPublicKey(generateSecretKey())), "Erin");
    const well = remembered(
      localRow({ ncryptsec: "x" }, unlockCache, getPublicKey(generateSecretKey())),
      "Frank",
    );

    const [deadRow] = pickerIdentities([dead], () => "key-unavailable");
    const [goneRow] = pickerIdentities([gone], () => "extension-missing");
    const [wellRow] = pickerIdentities([well], () => "no-backup");

    expect(deadRow.rows[0].selectable).toBe(false);
    expect(goneRow.rows[0].selectable).toBe(false);
    expect(wellRow.rows[0].selectable).toBe(true);
  });
});
