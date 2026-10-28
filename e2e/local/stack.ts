/**
 * What the local passkey check reaches besides the page: the Postgres the real
 * backend writes to, its request log, and a virtual WebAuthn authenticator.
 * `scripts/passkeys-local.sh` starts all of it and hands the details over in
 * the environment.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { BrowserContext, CDPSession, Page } from "@playwright/test";

export const ACCOUNTS_KEY = "brainstorm_accounts_v2";

const PG_PORT = process.env.PASSKEYS_PG_PORT ?? "55432";
const SERVER_LOG = process.env.PASSKEYS_SERVER_LOG ?? "";

/** One value out of the backend's database, as `psql -At` prints it. */
export function sql(query: string): string {
  return execFileSync("psql", ["-h", "localhost", "-p", PG_PORT, "-U", "postgres", "brainstorm", "-At", "-c", query])
    .toString()
    .trim();
}

/** How many times the server has handed out a vault. */
export function vaultOpens(): number {
  return (readFileSync(SERVER_LOG, "utf8").match(/POST \/passkeyVault\/[0-9a-f]{64}\/open/g) ?? []).length;
}

/**
 * A platform authenticator that does PRF and says yes to everything.
 *
 * Don't toggle its user-verification flag to fake a closed sheet: in Chrome,
 * once `setUserVerified(false)` has run, the authenticator refuses every later
 * request — even after it is set back and the page reloads. A second device
 * whose authenticator lacks the passkey is the realistic stand-in (see C3).
 */
export async function addAuthenticator(context: BrowserContext, page: Page): Promise<CDPSession> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

type StoredAccount = {
  pubkey: string;
  type: string;
  signer: { ncryptsec?: string; envelope?: string; passkeys?: { credentialId: string; synced?: boolean }[] };
  metadata?: { session?: unknown };
};

export async function storedAccounts(page: Page): Promise<StoredAccount[]> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), ACCOUNTS_KEY);
}

export async function localAccount(page: Page, pubkey?: string): Promise<StoredAccount | undefined> {
  return (await storedAccounts(page)).find((a) => a.type === "brainstorm-local" && (!pubkey || a.pubkey === pubkey));
}

/**
 * Signed out as a reload after sign-out leaves it: no Active Account, no Session
 * and, with `dropCache`, no Unlock cache — so the next sign-in has to unlock.
 */
export async function signedOut(page: Page, { dropCache }: { dropCache: boolean }) {
  await page.evaluate(
    ({ key, dropCache }) => {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      for (const account of stored) {
        if (dropCache && account.signer) delete account.signer.envelope;
        if (account.metadata) delete account.metadata.session;
      }
      localStorage.setItem(key, JSON.stringify(stored));
      localStorage.removeItem("brainstorm_active_account");
    },
    { key: ACCOUNTS_KEY, dropCache },
  );
}

/** Everything this origin keeps, gone: what a new device starts from. */
export async function wipeDevice(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
  });
}
