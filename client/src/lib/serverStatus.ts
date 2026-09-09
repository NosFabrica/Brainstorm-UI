/**
 * Whether the servers behind the app are answering.
 *
 * The UI is a JavaScript payload that never goes down; the Brainstorm API
 * (HTTP) and the search relay (a socket) do. This store notices, so the app
 * can say "taking a quick break" where the thing that is down would have
 * been — the dashboard when the API fails, the results when the relay does —
 * instead of a skeleton or a bare 500 (Benjamin + the dev, 2026-09-09).
 *
 * A verdict is never one failed call: two transport failures on different
 * routes inside a window earn a confirming probe, and only the probe's
 * answer decides. Framework-free; the React hook is at the bottom.
 */
import { useSyncExternalStore } from "react";
import { combineLatest, type Observable } from "rxjs";
import { env } from "@/lib/runtimeEnv";

export type Health = "ok" | "down";
export interface ServerStatus {
  api: Health;
  search: Health;
  /** Counts each return from down to ok — a page keys a restart on it. */
  recovery: number;
  /** An API probe is in flight. */
  checking: boolean;
  /** When the next automatic API probe is due, while down. */
  nextProbeAt: number | null;
}

const INITIAL: ServerStatus = { api: "ok", search: "ok", recovery: 0, checking: false, nextProbeAt: null };
let status: ServerStatus = { ...INITIAL };
const listeners = new Set<() => void>();
/**
 * `?sorry=api` / `?sorry=search` on the URL forces a scope down for this
 * page load — a preview for design review (the `?demo=display` precedent).
 * In memory only: a shared link must never persist an outage.
 */
const forced = new Set<"api" | "search">();
function readForced(): void {
  forced.clear();
  if (typeof window === "undefined") return;
  const want = new URLSearchParams(window.location.search).get("sorry");
  if (want === "api" || want === "search") forced.add(want);
}
const recoverListeners = new Set<() => void>();

/** Called once each time a server comes back, so the app can refill what it lost. */
export function onRecover(fn: () => void): () => void {
  recoverListeners.add(fn);
  return () => {
    recoverListeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((l) => l());
}
function set(patch: Partial<ServerStatus>) {
  const next = { ...status, ...patch };
  for (const scope of forced) next[scope] = "down";
  if ((Object.keys(next) as (keyof ServerStatus)[]).every((k) => next[k] === status[k])) return;
  const cameBack = (status.api === "down" && next.api === "ok") || (status.search === "down" && next.search === "ok");
  if (cameBack) next.recovery = status.recovery + 1;
  status = next;
  emit();
  if (cameBack) recoverListeners.forEach((fn) => fn());
}

export function getServerStatus(): ServerStatus {
  return status;
}
export function subscribeServerStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- the API ---

/** Two failures on different routes inside this window earn a probe. */
const FAILURE_WINDOW_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
/** While down: the wait before each further probe, the last one repeating. */
const RETRY_DELAYS_MS = [10_000, 20_000, 30_000];

const recentFailures = new Map<string, number>();
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probing = false;
let retries = 0;

function apiBase(): string {
  return env.VITE_API_URL.replace(/\/+$/, "");
}

/** A route the app already reads cross-origin, so the answer says only whether the server is there. */
function probeUrl(): string {
  return `${apiBase()}/.well-known/nostr.json?name=_`;
}

/** A transport-shaped failure: the network, a timeout, or a gateway saying the server is not there. */
export function isTransportFailure(x: unknown): boolean {
  if (x instanceof Response) return x.status === 502 || x.status === 503 || x.status === 504;
  if (typeof x === "object" && x !== null && "status" in x && typeof (x as { status: unknown }).status === "number") {
    const s = (x as { status: number }).status;
    return s === 502 || s === 503 || s === 504;
  }
  if (x instanceof TypeError) return true;
  const name = typeof x === "object" && x !== null ? (x as { name?: unknown }).name : undefined;
  return name === "TypeError" || name === "TimeoutError";
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * Wrap one API fetch so the store hears how it went. The promise is handed
 * back unchanged — a rejection still rejects, a 503 is still a 503 — and only
 * transport failures are reported, by route.
 */
export function observeApiFetch(result: Promise<Response>, url: string): Promise<Response> {
  const path = (() => {
    try {
      return new URL(url, typeof location !== "undefined" ? location.origin : "http://localhost").pathname;
    } catch {
      return url;
    }
  })();
  result.then(
    (res) => {
      if (isTransportFailure(res)) reportApiFailure(path);
    },
    (err) => {
      if (isTransportFailure(err)) reportApiFailure(path);
    },
  );
  return result;
}

/** A transport failure on an API route. `path` is the URL path, query string stripped. */
export function reportApiFailure(path: string): void {
  if (status.api === "down" || forced.has("api")) return;
  const now = Date.now();
  for (const [p, at] of recentFailures) if (now - at > FAILURE_WINDOW_MS) recentFailures.delete(p);
  recentFailures.set(path, now);
  if (recentFailures.size >= 2) scheduleProbe(0);
}

function scheduleProbe(delayMs: number) {
  // Offline is the reader's network, not our server: wait for `online`.
  if (probeTimer || probing || forced.has("api") || !online()) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void probe();
  }, delayMs);
  // Only a probe the page can wait for is worth announcing.
  if (status.api === "down") set({ nextProbeAt: Date.now() + delayMs });
}

async function probe(): Promise<void> {
  probing = true;
  set({ checking: true, nextProbeAt: null });
  let answered = false;
  try {
    const res = await fetch(probeUrl(), { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    answered = res.status < 500;
  } catch {
    answered = false;
  } finally {
    probing = false;
  }
  recentFailures.clear();
  set({ api: answered ? "ok" : "down", checking: false });
  if (answered) {
    retries = 0;
    return;
  }
  // Still down: ask again, a little later each time, until it answers.
  scheduleProbe(RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)]);
  retries++;
}

/**
 * The page's Try again. For the API: a probe now instead of at the loop's
 * next tick. For search: the relay reconnects on its own schedule and offers
 * no lever, so the search is taken as back — counted as a recovery, which
 * restarts the page's stream — and the watcher says down again if it is not.
 */
export function retryNow(scope: "api" | "search"): void {
  if (forced.has(scope)) return;
  if (scope === "api") {
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = null;
    scheduleProbe(0);
    return;
  }
  set({ search: "ok" });
}

// --- the search relay ---

/** The three signals the relay library keeps for its own reconnects. */
export interface WatchedRelay {
  connected$: Observable<boolean>;
  ready$: Observable<boolean>;
  error$: Observable<Error | null>;
}

/**
 * Read the relay's own state: `ready` goes false during its reconnect backoff
 * and `error` is set on a failed connect (cleared on open). Not connected and
 * either of those is an outage; not connected with neither is the library
 * closing an idle socket, which is nothing. Returns the unsubscribe.
 */
export function watchRelay(relay: WatchedRelay): () => void {
  const sub = combineLatest([relay.connected$, relay.ready$, relay.error$]).subscribe(([connected, ready, error]) => {
    if (forced.has("search")) return;
    if (connected) set({ search: "ok" });
    else if (!ready || error) set({ search: "down" });
  });
  return () => sub.unsubscribe();
}

/** A search request that could not be served because the socket is gone. */
export function reportSearchFailure(): void {
  set({ search: "down" });
}

/** Tests: forget everything (and re-read the URL's preview switch). */
export function __resetServerStatus(): void {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
  probing = false;
  retries = 0;
  recentFailures.clear();
  recoverListeners.clear();
  readForced();
  status = { ...INITIAL, api: forced.has("api") ? "down" : "ok", search: forced.has("search") ? "down" : "ok" };
}

// Back online, or back to the tab: if anything was in doubt, one probe settles it.
if (typeof window !== "undefined") {
  readForced();
  status = { ...INITIAL, api: forced.has("api") ? "down" : "ok", search: forced.has("search") ? "down" : "ok" };
  const settle = () => {
    if (status.api === "down" || recentFailures.size >= 2) scheduleProbe(0);
  };
  window.addEventListener("online", settle);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") settle();
  });
}

/** The status as React sees it. */
export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(subscribeServerStatus, getServerStatus, getServerStatus);
}
