import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

// api.ts captures VITE_API_URL at module load — provide a stable test base URL.
window.__ENV__ = {
  VITE_API_URL: "http://test.local",
  VITE_NIP85_RELAY_URL: "wss://test.local",
};

/**
 * Node 26 exposes a native experimental `localStorage` global that is undefined
 * without `--localstorage-file`, and it shadows the one jsdom would provide. A
 * bare `localStorage.setItem(...)` in a test therefore throws "Cannot read
 * properties of undefined", which took out all 121 tests in this suite.
 *
 * Install a minimal in-memory Storage when nothing usable is present. A no-op
 * on Node 20/22, where jsdom's own implementation is already there.
 */
if (typeof globalThis.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
