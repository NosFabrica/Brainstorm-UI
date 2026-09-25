import { test as base, expect, type Page } from "@playwright/test";

/** Fails the test on uncaught page errors or any 5xx the page receives. */
export function watchHealth(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return () => expect(problems, problems.join("\n")).toEqual([]);
}

export const test = base.extend<{ healthy: void }>({
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
