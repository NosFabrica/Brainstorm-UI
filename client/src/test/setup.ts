import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

// api.ts captures VITE_API_URL at module load — provide a stable test base URL.
window.__ENV__ = {
  VITE_API_URL: "http://test.local",
  VITE_NIP85_RELAY_URL: "wss://test.local",
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
