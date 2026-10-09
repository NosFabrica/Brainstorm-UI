import { devices } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * The installed app (PWA): what makes it installable, opens with no signal, and
 * gets around with no browser toolbar. Happy paths only, like the rest.
 */

test("the manifest is served and installable", async ({ page, request }) => {
  const res = await request.get("/site.webmanifest");
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("manifest+json");
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192/any", "512x512/any", "512x512/maskable"]));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
});

test("opens offline once the service worker has it", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("combobox", { name: /search people/i })).toBeVisible();
  await context.setOffline(false);
});

test("a web+nostr: link opens the person it names", async ({ page }) => {
  const npub = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";
  await page.goto(`/open?text=${encodeURIComponent(`web+nostr:${npub}`)}`);
  await expect(page).toHaveURL(new RegExp(`/p/${npub}$`));
  await expect(page.getByTestId("share-hero")).toBeVisible();
});

test.describe("running as the installed phone app", () => {
  // A phone, minus `defaultBrowserType`: the project's Chromium stays.
  const { defaultBrowserType: _browser, ...pixel } = devices["Pixel 7"];
  test.use(pixel);

  test("a screen opened from search has its own Back", async ({ page }) => {
    // Chromium won't emulate display-mode: answer that one query as an installed app does.
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes("display-mode: standalone")
          ? ({ ...real(query), matches: true, media: query } as MediaQueryList)
          : real(query);
    });

    await page.goto("/");
    await expect(page.getByTestId("header-back")).toHaveCount(0);
    await page.getByRole("combobox", { name: /search people/i }).fill("jack");
    await page.getByTestId("button-home-search").click();
    // On a phone the knowledge panel is folded: open a person from the People strip.
    await page.getByTestId("people-strip").locator('[data-testid^="serp-person-"]').first().click();
    await expect(page).toHaveURL(/\/p\//);

    await page.getByTestId("header-back").click();
    await expect(page).not.toHaveURL(/\/p\//);
  });
});
