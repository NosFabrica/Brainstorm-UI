import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Suites that need no DOM opt into the node environment — jsdom's TextEncoder
// hands back a foreign-realm Uint8Array, which @noble's strict checks reject, so
// anything that hashes or encrypts runs there instead.
const hasDom = typeof window !== "undefined";

// api.ts captures VITE_API_URL at module load — provide a stable test base URL.
if (hasDom) {
  window.__ENV__ = {
    VITE_API_URL: "http://test.local",
    VITE_NIP85_RELAY_URL: "wss://test.local",
  };
}

// jsdom has no ResizeObserver, and Radix primitives (Checkbox, Slider, …) call it
// in a layout effect — without this they throw on mount.
if (hasDom && typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * Node 26 exposes a native experimental `localStorage` global that is undefined
 * without `--localstorage-file`, and it shadows the one jsdom would provide. A
 * bare `localStorage.setItem(...)` in a test therefore throws "Cannot read
 * properties of undefined" in the `beforeEach` below, which takes out the
 * entire suite before a single assertion runs — 76 tests across 12 files on
 * `main` at the time of writing.
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
  // `window` only where there is a DOM: this branch runs a good part of the
  // suite under `@vitest-environment node`, where naming it throws and takes the
  // whole file down before a test runs — the same failure this shim exists to
  // prevent, arriving by the other door.
  for (const target of hasDom ? [globalThis, window] : [globalThis]) {
    Object.defineProperty(target, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

beforeEach(() => {
  if (hasDom) localStorage.clear();
});

afterEach(() => {
  if (hasDom) cleanup();
});
