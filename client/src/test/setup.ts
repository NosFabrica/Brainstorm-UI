import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Suites that need no DOM opt into the node environment — jsdom's TextEncoder
// hands back a foreign-realm Uint8Array, which @noble's strict checks reject, so
// anything that hashes or encrypts runs there instead.
const hasDom = typeof window !== "undefined";

// Billing dates and money render in the reader's locale, so assertions here
// spell out the en-US form and `npm test` pins LC_ALL to match. Node resolves
// the default locale at process start, which is why the pin lives in the
// script rather than in this file.

// api.ts captures VITE_API_URL at module load — provide a stable test base URL.
if (hasDom) {
  window.__ENV__ = {
    VITE_API_URL: "http://test.local",
    VITE_NIP85_RELAY_URL: "wss://test.local",
  };
}

// jsdom has no matchMedia either, and usePrefersReducedMotion calls it at
// MODULE LOAD (so any suite importing the share components needs it).
if (hasDom && typeof window.matchMedia === "undefined") {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
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

// jsdom has no IntersectionObserver; FeedVideo's autoplay-in-view needs it.
if (hasDom && typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

beforeEach(() => {
  if (hasDom) localStorage.clear();
});

afterEach(() => {
  if (hasDom) cleanup();
});
