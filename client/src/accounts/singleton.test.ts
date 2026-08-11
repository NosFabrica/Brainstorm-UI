/**
 * The production wiring, over real browser storage rather than the seam — the
 * automated half of "sign in on the old build, reload, still signed in". The
 * Unlock cache genuinely can't open here (jsdom has no IndexedDB), which is the
 * point: the envelope is carried across untouched, not re-minted.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getPublicKey, generateSecretKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

import { ACCOUNTS_KEY, ACTIVE_KEY } from "./persist";
import { V1_KEYS } from "./migrate";

const secretKey = generateSecretKey();
const pubkey = getPublicKey(secretKey);
const ENVELOPE = "v1.some-device-wrapped-envelope";

// seeded before the import, because the singleton bootstraps at module load
localStorage.setItem(V1_KEYS.encryptedKey, ENVELOPE);
localStorage.setItem(
  V1_KEYS.user,
  JSON.stringify({ pubkey, npub: nip19.npubEncode(pubkey), displayName: "Alice" }),
);
localStorage.setItem(`brainstorm_backup_done:${pubkey}`, "true");

let accountManager: import("applesauce-accounts").AccountManager;
/** What bootstrap left behind — the shared setup clears localStorage between tests. */
let written: Record<string, string | null>;

beforeAll(async () => {
  const module = await import("./index");
  accountManager = module.accountManager;
  // after the post-render migration, not before: retiring the v1 rows is the last
  // thing it does, and that is what this suite is here to see
  await module.accounts.migrated;
  written = Object.fromEntries(
    [ACCOUNTS_KEY, ACTIVE_KEY, V1_KEYS.user, V1_KEYS.encryptedKey, `brainstorm_backup_done:${pubkey}`].map(
      (key) => [key, localStorage.getItem(key)],
    ),
  );
});

describe("the accounts singleton", () => {
  it("comes up already signed in as the v1 user", () => {
    expect(accountManager.active?.pubkey).toBe(pubkey);
    expect(accountManager.accounts).toHaveLength(1);
  });

  it("reuses the existing envelope verbatim, so the device key is never touched", () => {
    const [entry] = JSON.parse(written[ACCOUNTS_KEY]!);
    expect(entry.signer.envelope).toBe(ENVELOPE);
    expect(entry.signer.key).toBeUndefined();
    expect(written[ACTIVE_KEY]).toBe(accountManager.active!.id);
  });

  it("carries v1's scattered per-user state onto the account", () => {
    expect(accountManager.active?.metadata).toMatchObject({
      remembered: true,
      name: "Alice",
      npub: nip19.npubEncode(pubkey),
      backedUp: true,
    });
  });

  it("retires the v1 rows, now that the blob it read back holds them instead", () => {
    expect(written[V1_KEYS.user]).toBeNull();
    expect(written[V1_KEYS.encryptedKey]).toBeNull();
    expect(written[`brainstorm_backup_done:${pubkey}`]).toBeNull();
    // and what replaced them is still there
    expect(written[ACCOUNTS_KEY]).not.toBeNull();
  });
});
