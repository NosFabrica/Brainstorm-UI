import { test, expect } from "./fixtures";

const nsec = process.env.E2E_TEST_NSEC;

test.skip(!nsec, "E2E_TEST_NSEC not set");

// The key lives in the page's memory, so each test signs in afresh.
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("link-use-nsec").click();
  await page.getByTestId("button-show-nsec-form").click();
  await page.getByTestId("input-nsec").fill(nsec!);
  await page.getByTestId("checkbox-remember-me").uncheck();
  await page.getByTestId("button-nsec-signin").click();
  await expect(page).not.toHaveURL(/\/login/);
});

test("dashboard shows the overall trust score", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("page-dashboard")).toBeVisible();
  await expect(page.getByTestId("card-overall-trust-score")).toBeVisible();
});

test("network lists connections", async ({ page }) => {
  await page.goto("/network");
  await expect(page.getByTestId("page-network")).toBeVisible();
  await expect(page.getByTestId("card-network-filters")).toBeVisible();
});

test("insights shows score rows", async ({ page }) => {
  await page.goto("/insights");
  await expect(page.getByTestId("insights-score-row").first()).toBeVisible();
});

test("alerts loads", async ({ page }) => {
  await page.goto("/alerts");
  await expect(page.getByTestId("alerts-count")).toBeVisible();
});

test("reading list loads", async ({ page }) => {
  await page.goto("/reading");
  await expect(page.getByTestId("reading-list").or(page.getByTestId("reading-empty"))).toBeVisible();
});

test("settings shows account and profile", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("card-settings-account")).toBeVisible();
  await expect(page.getByTestId("card-settings-profile")).toBeVisible();
});

test("my tags loads", async ({ page }) => {
  await page.goto("/tags/mine");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page).toHaveURL(/\/tags\/mine/);
});
