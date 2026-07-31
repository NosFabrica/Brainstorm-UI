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

beforeEach(() => {
  if (hasDom) localStorage.clear();
});

afterEach(() => {
  if (hasDom) cleanup();
});
