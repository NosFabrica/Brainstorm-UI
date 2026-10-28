import { getPublicKey, nip19 } from "nostr-tools";

import { test, expect } from "./fixtures";

const nsec = process.env.E2E_TEST_NSEC;
const API = process.env.E2E_API_URL ?? "https://brainstormserver-staging.nosfabrica.com";

test.skip(!nsec, "E2E_TEST_NSEC not set");

/**
 * The passkey round trip on staging, with Chromium's virtual authenticator: add
 * a passkey to the test account, sign in with it on a wiped device, take it away.
 * Publishes nothing to relays. Every flow, including signup, runs locally against
 * the real stack in `e2e/local/` (`npm run e2e:local`).
 */
test("passkey: add, sign in on a new device, remove", async ({ page, context, request }) => {
  test.setTimeout(180_000);

  const vault = await request.post(`${API}/passkeyVault/challenge`);
  test.skip(vault.status() === 404, "this backend has no passkey vault yet");

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
  const pubkey = getPublicKey(nip19.decode(nsec!).data as Uint8Array);
  const rows = page.locator('[data-testid^="row-passkey-"]');

  /** Remove every passkey the account lists — a run that died midway leaves one behind. */
  const removeAll = async () => {
    await page.goto("/settings");
    await expect(page.getByTestId("row-account-passkeys")).toBeVisible();
    await page.waitForTimeout(2000); // the server's half of the list
    while ((await rows.count()) > 0) {
      const before = await rows.count();
      await page.locator('[data-testid^="button-remove-passkey-"]').first().click();
      await page.getByTestId("button-remove-passkey-confirm").click();
      await expect(rows).toHaveCount(before - 1);
    }
  };

  await test.step("sign in with a pasted key", async () => {
    await page.goto("/login");
    await page.getByTestId("link-use-nsec").click();
    await page.getByTestId("input-nsec").fill(nsec!);
    await page.getByTestId("checkbox-remember-me").uncheck();
    await page.getByTestId("button-nsec-signin").click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  try {
    await test.step("start clean", removeAll);

    await test.step("add a passkey in settings", async () => {
      await page.getByTestId("button-add-passkey").click();
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).not.toContainText("This device only"); // the server holds its copy
    });

    await test.step("a wiped device signs in with the passkey alone", async () => {
      await page.evaluate(async () => {
        localStorage.clear();
        sessionStorage.clear();
        for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
      });
      await page.goto("/login");
      await page.getByTestId("button-signin-passkey").click();
      await expect(page).not.toHaveURL(/\/login/);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("brainstorm_accounts_v2") || "[]"));
      expect(stored.map((account: { pubkey: string }) => account.pubkey)).toContain(pubkey);
    });
  } finally {
    await test.step("remove it again", removeAll);
  }
});
