import { test, expect } from "./fixtures";

const nsec = process.env.E2E_TEST_NSEC;

test.skip(!nsec, "E2E_TEST_NSEC not set");

// One sign-in, then around the app the way a user would. Page checks are soft so
// one broken page doesn't hide the rest.
test("signed-in journey", async ({ page }) => {
  test.setTimeout(180_000);

  const openMenu = (item: string) => async () => {
    await page.getByTestId("button-user-menu").click();
    await page.getByTestId(item).click();
  };

  await test.step("sign in with a pasted key", async () => {
    await page.goto("/login");
    await page.getByTestId("link-use-nsec").click();
    await page.getByTestId("button-show-nsec-form").click();
    await page.getByTestId("input-nsec").fill(nsec!);
    await page.getByTestId("checkbox-remember-me").uncheck();
    await page.getByTestId("button-nsec-signin").click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  await test.step("dashboard", async () => {
    await openMenu("account-nav-dashboard")();
    await expect.soft(page.getByTestId("page-dashboard")).toBeVisible();
    await expect.soft(page.getByTestId("card-overall-trust-score")).toBeVisible();
  });

  await test.step("network", async () => {
    await openMenu("account-nav-network")();
    await expect.soft(page.getByTestId("page-network")).toBeVisible();
    await expect.soft(page.getByTestId("card-network-filters")).toBeVisible();
  });

  await test.step("insights", async () => {
    await openMenu("dropdown-insights")();
    await expect.soft(page.getByTestId("insights-score-row").first()).toBeVisible();
  });

  await test.step("my tags", async () => {
    await openMenu("dropdown-my-tags")();
    await expect.soft(page).toHaveURL(/\/tags\/mine/);
    await expect.soft(page.getByRole("heading").first()).toBeVisible();
  });

  await test.step("settings", async () => {
    await openMenu("dropdown-settings")();
    await expect.soft(page.getByTestId("card-settings-account")).toBeVisible();
    await expect.soft(page.getByTestId("card-settings-profile")).toBeVisible();
  });

  // Only linked from data-dependent dashboard cards, so reached by URL.
  await test.step("alerts", async () => {
    await page.goto("/alerts");
    await expect.soft(page.getByTestId("alerts-count")).toBeVisible();
  });

  await test.step("reading", async () => {
    await page.goto("/reading");
    await expect.soft(page.getByTestId("reading-list").or(page.getByTestId("reading-empty"))).toBeVisible();
  });
});
