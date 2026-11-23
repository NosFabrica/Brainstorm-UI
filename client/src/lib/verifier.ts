/**
 * The one signature check every event goes through: the store's, the device
 * cache's, and the few call sites that verify an event before acting on it.
 *
 * Two speeds. nostr-tools' noble verifier is pure JavaScript and answers from
 * the first event; libsecp256k1 compiled to wasm (`nostr-wasm`) is about four
 * times faster (1.6 ms → 0.4 ms an event, measured in Node) but has to be
 * fetched and compiled first. So the noble one answers until the wasm one has
 * loaded, and nothing ever waits for it: a search that lands before it simply
 * pays the slower price for those first events. A browser that can't compile
 * wasm (a strict CSP, a WebView without it) stays on noble for good.
 *
 * And at most once a session per signature. An event this device has already
 * verified (the same id AND the same sig) is not checked again: the same
 * kind-10002 is read off the device and then added to the store, a pruned
 * event comes back, a note arrives from five relays. The id is still re-hashed
 * on such a hit — that is cheap next to a Schnorr check, and it is what makes
 * the shortcut safe: a copy with forged content under a genuine id and sig
 * (anything with script on this origin can write IndexedDB) hashes to a
 * different id and is checked, and fails, in full.
 */
import { getEventHash, verifiedSymbol, verifyEvent as nobleVerify } from "nostr-tools/pure";
import type { NostrEvent } from "nostr-tools";

type Verify = (event: NostrEvent) => boolean;

/** The wasm verifier, once compiled; until then (and if it never is) noble answers. */
let fast: Verify | null = null;
let loading: Promise<boolean> | null = null;

/**
 * The wasm build is fetched on demand, not at boot: it is ~120 KB gzipped, and
 * at boot it would share the link with the app's own first screen, for a visit
 * that may never verify more than a handful of events (an anonymous home page
 * verifies none). So the noble checks are counted, and the load starts once
 * they reach `demandAt` — a results page's first frames — after which the rest
 * of that page is verified at wasm speed.
 */
let demandAt = Infinity;
let slowChecks = 0;
let loadOnDemand: (() => void) | null = null;

/** Start the wasm load once `threshold` events have been verified the slow way (lib/eventStore). */
export function loadFastVerifierWhenBusy(threshold: number, load: () => Promise<Verify> = loadWasmVerifier): void {
  demandAt = threshold;
  slowChecks = 0;
  loadOnDemand = () => void startFastVerifier(load);
}

/**
 * Signatures verified this session, as `id:sig`. Bounded, oldest first out: it
 * is a shortcut, never the record of what is trusted, so forgetting one only
 * costs that event a full check next time.
 */
const verified = new Set<string>();
export const MAX_REMEMBERED = 10_000;

const memoKey = (event: NostrEvent) => `${event.id}:${event.sig}`;

function remember(key: string): void {
  verified.add(key);
  if (verified.size > MAX_REMEMBERED) {
    // A Set iterates in insertion order: the first is the oldest.
    const oldest = verified.values().next().value;
    if (oldest !== undefined) verified.delete(oldest);
  }
}

/**
 * Whether `event` is signed by its pubkey and its id is its hash. Never throws:
 * a malformed object (a tag that isn't a string, no sig at all) is `false`.
 */
export function verifySignature(event: NostrEvent): boolean {
  try {
    if (typeof event?.id !== "string" || typeof event.sig !== "string") return false;
    const key = memoKey(event);
    if (verified.has(key)) return getEventHash(event) === event.id;
    // An event signed in this tab carries nostr-tools' own "verified" mark,
    // which the store's default check always honoured: kept, so a publish of
    // ours is not checked again. Nothing read off a relay or out of storage
    // carries it — JSON and structured clones drop symbols.
    if ((event as { [verifiedSymbol]?: boolean })[verifiedSymbol] === true) return true;
    if (!fast && loadOnDemand && ++slowChecks >= demandAt) {
      const start = loadOnDemand;
      loadOnDemand = null;
      start();
    }
    const ok = (fast ?? nobleVerify)(event);
    if (ok) remember(key);
    return ok;
  } catch {
    return false;
  }
}

/** Whether `event`'s signature was verified this session, without verifying it. */
export function verifiedThisSession(event: NostrEvent): boolean {
  return typeof event?.id === "string" && verified.has(memoKey(event));
}

/**
 * Fetch and compile the wasm verifier, once; resolves whether it is now in use.
 * Fire-and-forget (`loadFastVerifierWhenBusy`): nothing awaits it.
 */
export function startFastVerifier(load: () => Promise<Verify> = loadWasmVerifier): Promise<boolean> {
  loading ??= load().then(
    (verify) => {
      fast = verify;
      return true;
    },
    () => false,
  );
  return loading;
}

/**
 * The binary ships inside its own lazy chunk (`nostr-wasm`'s default build
 * carries it base64-encoded), so there is no `.wasm` file to serve with the
 * right MIME type or to keep in the precache, and nginx's gzip covers it as
 * JavaScript. `WebAssembly.instantiate` on bytes compiles off the main thread.
 */
async function loadWasmVerifier(): Promise<Verify> {
  const [{ initNostrWasm }, { setNostrWasm, verifyEvent }] = await Promise.all([
    import("nostr-wasm"),
    import("nostr-tools/wasm"),
  ]);
  setNostrWasm(await initNostrWasm());
  // A self-test before trusting it with every event: a verifier that answered
  // `false` to everything would empty the app, and one that answered `true`
  // would let anything in.
  if (!verifyEvent({ ...SELF_TEST }) || verifyEvent({ ...SELF_TEST, content: "forged" }))
    throw new Error("wasm verifier failed its self-test");
  return verifyEvent as Verify;
}

/** A real, signed kind-1 (made once, with a throwaway key): the wasm build must accept it, and reject it altered. */
const SELF_TEST: NostrEvent = {
  id: "bc3c344b8278c3fdaa40aa7967874ba10f43c6ef055eeac8a35995aa6e5e7523",
  pubkey: "5d341e364158695643fe66257a78993166db45bd11a21865ef7426d8e138aaa2",
  created_at: 1700000000,
  kind: 1,
  tags: [],
  content: "brainstorm verifier self-test",
  sig: "439f6ef178a9938722d500333751fb1ca30fb2a5915c3eff41b71041e208b3cb60bd1f96f69eb231e62bb6a9831c808a39b67e4e4604e0d56e1b8a6dffe35580",
};

/** Test seam: forget the wasm verifier and every remembered signature. */
export function __resetVerifier(): void {
  fast = null;
  loading = null;
  verified.clear();
  demandAt = Infinity;
  slowChecks = 0;
  loadOnDemand = null;
}
