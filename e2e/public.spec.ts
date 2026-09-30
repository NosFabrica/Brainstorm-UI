import { test, expect } from "./fixtures";

test("search finds a profile and opens it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: /search people/i }).fill("jack");
  await page.getByTestId("button-home-search").click();
  await expect(page.getByTestId("people-strip")).toBeVisible();

  await page.getByTestId("knowledge-panel-profile").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByTestId("share-hero")).toBeVisible();
  await expect(page.getByTestId("share-name")).not.toBeEmpty();
  await expect(page.getByTestId("share-stats")).toBeVisible();
});

test("hashtag page lists posts", async ({ page }) => {
  await page.goto("/t/nostr");
  await expect(page.getByTestId("hashtag-page")).toBeVisible();
  await expect(page.getByTestId("hashtag-count")).toBeVisible();
});

test("tag index loads", async ({ page }) => {
  await page.goto("/tags");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByTestId("notfound-home")).toHaveCount(0);
});

for (const path of ["/about", "/pricing", "/faq", "/developers", "/what-is-wot", "/how-search-works"]) {
  test(`static page ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByTestId("notfound-home")).toHaveCount(0);
  });
}
