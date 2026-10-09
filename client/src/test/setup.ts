import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { __resetAsks } from "@/lib/askOnce";
import { __resetListEdits } from "@/lib/listEdits";
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
// `.invalid` (RFC 6761) fails to resolve at once everywhere. It was `test.local`,
// which macOS sends to multicast DNS: a test that reached the network unmocked
// (the house observer's /.well-known lookup) waited ~5s and timed out, on a Mac only.
if (hasDom) {
  window.__ENV__ = {
    VITE_API_URL: "http://test.invalid",
    VITE_NIP85_RELAY_URL: "wss://test.invalid",
  };
}

// No test reaches the network. Each starts with a fetch that refuses and remembers;
// a test that mocks fetch (vi.stubGlobal, vi.spyOn) replaces it as before. One that
// asked the network anyway fails in afterEach — code under test usually swallows
// fetch errors, which is how 26 requests to wavlake, mempool.space, NIP-05 hosts and
// the test API went unnoticed (slow, and flaky offline). TEST_FETCH_GUARD=warn
// reports instead of failing.
const unmocked: string[] = [];
const refuse = (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  unmocked.push(url);
  return Promise.reject(new TypeError(`unmocked fetch in a test: ${url}`));
};
const realFetch = globalThis.fetch;
beforeEach(() => {
  unmocked.length = 0;
  // Only ever in place of the real one: a suite's own mock (some stub once, at the
  // top of the file) stays.
  if (globalThis.fetch === realFetch) globalThis.fetch = refuse as typeof fetch;
});
afterEach(() => {
  if (!unmocked.length) return;
  const urls = [...new Set(unmocked)];
  unmocked.length = 0;
  const message = `This test reached the network (mock fetch): ${urls.join(", ")}`;
  if (process.env.TEST_FETCH_GUARD === "warn") console.warn(`[fetch-guard] ${message}`);
  else throw new Error(message);
});

// No Web Locks unless a test brings its own. Node has them, and they are process-wide:
// a signer request a test leaves hanging under fake timers (never reaching its
// timeout) held accounts/extension's lock into every later test in the file.
if (typeof navigator !== "undefined" && "locks" in navigator)
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true, writable: true });

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
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

// No unit test talks to a real relay. Node ships a real WebSocket, so anything
// that reaches the relay pool unmocked would dial the public relays — and a
// connection that lands after its file has finished fires its event into the
// NEXT file's jsdom, failing a test that did nothing ("The "event" argument must
// be an instance of Event. Received an instance of Event"). This one never
// connects: a relay that is simply not answering. Suites that need a socket to
// behave stub their own.
class OfflineWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly url: string;
  readyState: number = OfflineWebSocket.CONNECTING;
  binaryType = "blob";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
  }

  send(): void {}

  close(): void {
    if (this.readyState === OfflineWebSocket.CLOSED) return;
    this.readyState = OfflineWebSocket.CLOSED;
    const event = new Event("close");
    this.onclose?.(event);
    this.dispatchEvent(event);
  }
}
globalThis.WebSocket = OfflineWebSocket as unknown as typeof WebSocket;

beforeEach(() => {
  if (hasDom) localStorage.clear();
  __resetAsks();
  __resetListEdits();
});

afterEach(() => {
  if (hasDom) cleanup();
});
