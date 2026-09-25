import { test as base, expect, type Page } from "@playwright/test";

const OUR_HOSTS = [
  new URL(process.env.E2E_BASE_URL ?? "https://brainstorm-staging.nosfabrica.com").host,
  new URL(process.env.E2E_API_URL ?? "https://brainstormserver-staging.nosfabrica.com").host,
];
// Proxies for third-party content: their 5xx is usually the upstream site's.
const PROXY_PATHS = ["/link-preview", "/img/"];

/** Fails the test on uncaught page errors or a 5xx from our own services. */
export function watchHealth(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (r.status() < 500 || !OUR_HOSTS.includes(url.host)) return;
    if (PROXY_PATHS.some((p) => url.pathname.startsWith(p))) return;
    problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return () => expect(problems, problems.join("\n")).toEqual([]);
}

const BLOCKED = new Set(["image", "media", "font"]);

export const test = base.extend<{ healthy: void; lean: void }>({
  // Skip images, video and fonts unless E2E_LOAD_MEDIA=1: they're most of the bytes and none of the checks.
  lean: [
    async ({ context }, use) => {
      if (!process.env.E2E_LOAD_MEDIA) {
        await context.route("**/*", (r) => (BLOCKED.has(r.request().resourceType()) ? r.abort() : r.fallback()));
      }
      await use();
    },
    { auto: true },
  ],
  healthy: [
    async ({ page }, use) => {
      const check = watchHealth(page);
      await use();
      check();
    },
    { auto: true },
  ],
});

export { expect };
