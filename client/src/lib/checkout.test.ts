import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The thing worth testing here is the shape of the URL, because it was wrong
 * before: the previous resolver built `?tier=&rail=&pubkey=&return=` against
 * Flash's older documented surface, and our vault accepts none of it. A test
 * that pins the path form is what stops that regressing when someone reads the
 * public docs again and "fixes" it back.
 *
 * `env` is read at module scope in runtimeEnv, so each case re-imports with a
 * fresh mock rather than mutating a frozen object.
 */
async function withEnv(vars: Record<string, string>) {
  vi.resetModules();
  vi.doMock("@/lib/runtimeEnv", () => ({
    env: {
      VITE_FLASH_BASE_URL: "",
      VITE_FLASH_PRIORITY_CARD: "",
      ...vars,
    },
  }));
  return await import("./checkout");
}

const VAULT = "https://dev.server.vault.paywithflash.com";
const PLAN = "019eb7e1-c789-731e-9c9a-e84e83500097/019ef08a-3c5f-7228-a15b-4838937045f5";

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/runtimeEnv"));

describe("resolveCheckout", () => {
  it("deep-links to the plan, not the service interstitial", async () => {
    const { resolveCheckout } = await withEnv({
      VITE_FLASH_BASE_URL: VAULT,
      VITE_FLASH_PRIORITY_CARD: PLAN,
    });
    const t = resolveCheckout("priority", { rail: "card" });

    expect(t.external).toBe(true);
    expect(t.url).toBe(`${VAULT}/subscriptions/signup/${PLAN}`);
    // Both ids present → it's the plan URL, not the service one.
    expect(t.url.split("/subscriptions/signup/")[1].split("/")).toHaveLength(2);
  });

  it("carries no query string — Flash ignores every pre-fill param", async () => {
    const { resolveCheckout } = await withEnv({
      VITE_FLASH_BASE_URL: VAULT,
      VITE_FLASH_PRIORITY_CARD: PLAN,
    });
    expect(resolveCheckout("priority", { rail: "card" }).url).not.toContain("?");
  });

  it("tolerates stray slashes in configured values", async () => {
    const { resolveCheckout } = await withEnv({
      VITE_FLASH_BASE_URL: `${VAULT}/`,
      VITE_FLASH_PRIORITY_CARD: `/${PLAN}/`,
    });
    expect(resolveCheckout("priority", { rail: "card" }).url).toBe(
      `${VAULT}/subscriptions/signup/${PLAN}`,
    );
  });

  it("reports unconfigured rather than inventing an in-app checkout", async () => {
    // There is no way to take a payment without the vault, so the honest
    // answer is "not here" — a fake in-app checkout page would be worse than
    // an empty state.
    const { resolveCheckout } = await withEnv({});
    const t = resolveCheckout("priority", { rail: "card" });
    expect(t.external).toBe(false);
    expect(t.url).toBe("");
  });

  it("falls back for Lightning, which has no Flash plan yet", async () => {
    const { resolveCheckout } = await withEnv({
      VITE_FLASH_BASE_URL: VAULT,
      VITE_FLASH_PRIORITY_CARD: PLAN,
    });
    const t = resolveCheckout("priority", { rail: "flash-lightning" });
    expect(t.external).toBe(false);
  });

  it("defaults to the card rail", async () => {
    const { resolveCheckout } = await withEnv({
      VITE_FLASH_BASE_URL: VAULT,
      VITE_FLASH_PRIORITY_CARD: PLAN,
    });
    expect(resolveCheckout("priority").url).toContain(PLAN);
  });
});
