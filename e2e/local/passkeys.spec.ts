/**
 * Every passkey user flow, end to end: the real UI (vite) against the real
 * brainstorm_server (Postgres + Redis, its own migrations), in Chromium with a
 * virtual authenticator that does PRF. Run it with `npm run e2e:local`, which
 * starts that stack; external hosts are unresolvable, so nothing reaches a
 * public relay. ADR 0009 is the design; `docs/agents/passkey-checklist.md` is
 * what only a real phone can tell.
 *
 * One device, one authenticator, accounts carried from flow to flow — the order
 * is the story, so the flows run in series and later ones build on earlier ones.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

import { ACCOUNTS_KEY, addAuthenticator, localAccount, signedOut, sql, vaultOpens, wipeDevice } from "./stack";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let alice = ""; // signs up with a passkey
let bob = ""; // signs up with a recovery password
const PASSWORD = "correct horse battery";

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  page = await context.newPage();
  await addAuthenticator(context, page);
});

test.afterAll(async () => {
  await context.close();
});

/** Signed in: the page has left /login for wherever the app sends a new session. */
async function signedIn() {
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** The picker's first row: the test never knows names, only that a row exists. */
async function pickFirstRow() {
  await page.goto("/login");
  await page.getByText("npub1", { exact: false }).first().click();
}

/** Settings › Add a passkey, including the second tap a Locked account asks for. */
async function addPasskeyInSettings() {
  await page.goto("/settings");
  const add = page.getByTestId("button-add-passkey");
  const rows = page.locator('[data-testid^="row-passkey-"]');
  await expect(add).toBeVisible();
  const before = await rows.count();
  await add.click();
  await page.waitForTimeout(800);
  if (/Continue/.test((await add.textContent()) ?? "")) await add.click();
  await expect(rows).toHaveCount(before + 1);
}

test("A. sign up with a passkey: no password, a seal on the account, a row on the server", async () => {
  await page.goto("/login");
  await expect(page.getByTestId("button-signin-passkey")).toBeVisible();

  await page.getByTestId("link-create-identity").click();
  await page.getByTestId("input-create-display-name").fill("Alice Passkey");
  await page.getByTestId("button-create-passkey").click();
  await expect(page.getByTestId("text-create-passkey-done")).toBeVisible();

  await expect.poll(async () => (await localAccount(page))?.signer.passkeys?.[0]?.synced).toBe(true);
  const account = (await localAccount(page))!;
  alice = account.pubkey;
  expect(account.signer.ncryptsec, "a passkey signup mints no Backup").toBeUndefined();
  expect(sql(`select credential_id from passkey_vault where pubkey='${alice}'`)).toBe(
    account.signer.passkeys![0].credentialId,
  );

  await test.step("a reload needs no prompt (the Unlock cache)", async () => {
    await page.goto("/settings");
    await expect(page.getByTestId("row-account-passkeys")).toBeVisible();
    await expect(page.getByTestId("modal-unlock")).toHaveCount(0);
  });

  await test.step("the backup reminder is worded for a passkey account", async () => {
    await page.goto("/");
    await expect(page.getByTestId("backup-reminder-title")).toContainText("only yours");
  });
});

test("B. a wiped device signs in with the passkey alone", async () => {
  await wipeDevice(page);
  await page.goto("/login");
  await page.getByTestId("button-signin-passkey").click();
  await signedIn();

  expect((await localAccount(page))?.pubkey).toBe(alice);
  // The real server verified the assertion and recorded the use.
  expect(sql(`select last_used_at is not null from passkey_vault where pubkey='${alice}'`)).toBe("t");
  // One clock for both columns: the use comes after the creation, never hours before it.
  expect(sql(`select last_used_at >= created_at from passkey_vault where pubkey='${alice}'`)).toBe("t");
});

test("C. on a device that holds the account", async () => {
  await test.step("the passkey button opens it in place, without the server", async () => {
    await signedOut(page, { dropCache: false });
    const opens = vaultOpens();
    await page.goto("/login");
    await page.getByTestId("button-signin-passkey").click();
    await signedIn();
    expect(vaultOpens()).toBe(opens);
  });

  await test.step("with no Unlock cache, the unlock modal asks for the passkey and no password", async () => {
    await signedOut(page, { dropCache: true });
    await pickFirstRow();
    await expect(page.getByTestId("button-unlock-passkey")).toBeVisible();
    await expect(page.getByTestId("button-unlock-use-password")).toHaveCount(0);
    await page.getByTestId("button-unlock-passkey").click();
    await signedIn();
  });

  await test.step("C3: a device whose provider lacks the passkey: no error, and what else works", async () => {
    await signedOut(page, { dropCache: true });
    const blob = await page.evaluate((key) => localStorage.getItem(key), ACCOUNTS_KEY);
    // Park the live app, or its next save writes the sign-out back meanwhile.
    await page.goto("about:blank");

    const other = await context.browser()!.newContext({ viewport: { width: 420, height: 900 } });
    const otherPage = await other.newPage();
    await addAuthenticator(other, otherPage);
    await otherPage.goto("/login");
    await otherPage.evaluate(([key, value]) => localStorage.setItem(key, value!), [ACCOUNTS_KEY, blob]);
    await otherPage.goto("/login");
    await otherPage.getByText("npub1", { exact: false }).first().click();
    await otherPage.getByTestId("button-unlock-passkey").click();
    await expect(otherPage.getByTestId("text-unlock-passkey-missing")).toBeVisible();
    await expect(otherPage.getByTestId("text-unlock-passkey-error")).toHaveCount(0);
    await other.close();

    await pickFirstRow();
    await page.getByTestId("button-unlock-passkey").click();
    await signedIn();
  });
});

test("D. settings", async () => {
  await test.step("lists the passkey with what the server recorded", async () => {
    await page.goto("/settings");
    const row = page.locator('[data-testid^="row-passkey-"]').first();
    await expect(row).toContainText("Used today");
  });

  await test.step("refuses a second passkey on the same provider rather than swapping it in", async () => {
    await page.getByTestId("button-add-passkey").click();
    // Inline in the section, not a toast: the provider's Touch ID sheet comes first and hid one.
    await expect(page.getByTestId("text-add-passkey-error")).toContainText("already has a passkey for this account");
    expect(sql(`select count(*) from passkey_vault where pubkey='${alice}'`)).toBe("1");
  });
});

test("E. a passkey with no server copy says it isn't ready, and offers the key", async () => {
  const row = sql(`select row_to_json(p)::text from passkey_vault p where pubkey='${alice}'`);
  sql(`delete from passkey_vault where pubkey='${alice}'`);
  try {
    await wipeDevice(page);
    await page.goto("/login");
    await page.getByTestId("button-signin-passkey").click();
    await expect(page.getByTestId("modal-passkey-not-ready")).toContainText("no copy for this passkey");
    await expect(page.getByTestId("button-passkey-use-key")).toBeVisible();
  } finally {
    sql(
      `insert into passkey_vault select * from json_populate_record(null::passkey_vault, '${row.replace(/'/g, "''")}')`,
    );
  }
});

test("F. a password account, then a passkey", async () => {
  await test.step("sign up with a recovery password instead", async () => {
    await wipeDevice(page);
    await page.goto("/login");
    await page.getByTestId("link-create-identity").click();
    await page.getByTestId("input-create-display-name").fill("Bob Password");
    await page.getByTestId("button-create-use-password").click();
    await page.getByTestId("input-create-password").fill(PASSWORD);
    await page.getByTestId("input-create-confirm").fill(PASSWORD);
    await page.getByTestId("button-create-submit").click();
    await expect(page.getByTestId("status-create-success")).toBeVisible();
    await expect.poll(async () => (await localAccount(page))?.pubkey).toBeTruthy();
    bob = (await localAccount(page))!.pubkey;
  });

  await test.step("'Not now' to the offer is remembered", async () => {
    await signedOut(page, { dropCache: true });
    await pickFirstRow();
    await page.getByTestId("input-unlock-password").fill(PASSWORD);
    await page.getByTestId("button-unlock-submit").click();
    await page.getByTestId("button-passkey-offer-decline").click();

    await signedOut(page, { dropCache: true });
    await pickFirstRow();
    await page.getByTestId("input-unlock-password").fill(PASSWORD);
    await page.getByTestId("button-unlock-submit").click();
    await signedIn();
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("modal-passkey-offer")).toHaveCount(0);
  });

  await test.step("settings adds a passkey; the Backup stays", async () => {
    await addPasskeyInSettings();
    const account = (await localAccount(page, bob))!;
    expect(account.signer.passkeys).toHaveLength(1);
    expect(account.signer.ncryptsec).toBeTruthy();
    expect(sql(`select count(*) from passkey_vault where pubkey='${bob}'`)).toBe("1");
  });

  await test.step("its unlock leads with the passkey; the password still works", async () => {
    await signedOut(page, { dropCache: true });
    await pickFirstRow();
    await expect(page.getByTestId("button-unlock-passkey")).toBeVisible();
    await page.getByTestId("button-unlock-use-password").click();
    await page.getByTestId("input-unlock-password").fill(PASSWORD);
    await page.getByTestId("button-unlock-submit").click();
    await signedIn();
  });

  await test.step("removing the passkey takes the seal and the server copy", async () => {
    await page.goto("/settings");
    await page.locator('[data-testid^="button-remove-passkey-"]').first().click();
    await page.getByTestId("button-remove-passkey-confirm").click();
    await expect(page.locator('[data-testid^="row-passkey-"]')).toHaveCount(0);
    expect((await localAccount(page, bob))!.signer.passkeys).toBeUndefined();
    expect(sql(`select count(*) from passkey_vault where pubkey='${bob}'`)).toBe("0");
  });
});

test("G. with two accounts' passkeys on the device, the one picked signs in", async () => {
  await addPasskeyInSettings(); // Bob's back: the authenticator now holds Alice's and Bob's
  await wipeDevice(page);
  await page.goto("/login");
  await page.getByTestId("button-signin-passkey").click();
  await signedIn();
  expect([alice, bob]).toContain((await localAccount(page))?.pubkey);
});

test("H. a browser without PRF offers no passkey anywhere", async ({ browser }) => {
  const plain = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await plain.addInitScript(() => {
    (PublicKeyCredential as unknown as { getClientCapabilities: () => Promise<object> }).getClientCapabilities =
      async () => ({ "extension:prf": false });
  });
  const plainPage = await plain.newPage();
  await plainPage.goto("/login");
  await expect(plainPage.getByTestId("button-signin-extension")).toBeVisible();
  await plainPage.waitForTimeout(1500);
  await expect(plainPage.getByTestId("button-signin-passkey")).toHaveCount(0);
  await plainPage.getByTestId("link-create-identity").click();
  await expect(plainPage.getByTestId("input-create-password")).toBeVisible();
  await expect(plainPage.getByTestId("button-create-passkey")).toHaveCount(0);
  await plain.close();
});
