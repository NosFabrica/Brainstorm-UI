import { env } from "@/lib/runtimeEnv";
import { fetchTrustProviderList } from "./nostr";

/**
 * Whose scores do we trust, and where do they live?
 *
 * ## Why this exists (issue #41 B1-proper)
 *
 * Tags were the only trust-consuming surface in the app that never asked this
 * question. Every other surface either delegates to the server (which resolves
 * the observer from the auth token) or reads the user's own kind-10040. Tags
 * read two hardcoded constants out of `tagging.config.json` instead:
 *
 *     trustRelays        ["wss://tags.brainstorm.world/relay"]   ← Tapestry's instance
 *     nip85AuthorPubkeys ["a68dbf56…", "bfb6e1e8…"]              ← Tapestry's TA keys
 *
 * Measured 2026-08-11: that relay holds 500 kind-30382 events, every one signed
 * by the RETIRED key and stamped 2026-05-26. So every trust decision in the tag
 * UI came from one day's snapshot, from a retired key, on another deployment —
 * and it was the same snapshot for every viewer, which is also why flipping the
 * Brainstorm/My-perspective toggle never changed a tag.
 *
 * ## The chain
 *
 *   observer pubkey  →  their kind-10040  →  ["30382:rank", <TA>, <relay>]  →  scores
 *
 * NIP-85's whole point is that the observer names their own scorer. Reading it
 * is not new machinery — `fetchTrustProviderList` already exists and is used by
 * the activation consent flow and the admin diagnostics panel. This module just
 * stops tags being the exception.
 *
 * Deliberately NOT using `GET /setup/<pubkey>`: it answers with the *deployment's*
 * assistant rather than the one the observer actually published, which would give
 * tags a different trust source than the rest of the app.
 */

/** A resolved place to read kind-30382 trust assertions from. */
export interface TrustSourceRef {
  /** The Trusted Assistant whose assertions we honor — the 10040's target. */
  taPubkey: string;
  /** Where that TA publishes them. */
  relay: string;
}

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * The house observer, discovered rather than configured.
 *
 * The client is deliberately built never to hardcode the house identity — it
 * expresses "house" as the ABSENCE of a token and lets the server decide
 * (`optionalAuthFetch`, and `opts.house` on the read helpers). That works for
 * REST, but a relay has no notion of "unauthenticated observer", so the tag path
 * has to name a pubkey.
 *
 * The server already publishes it: `brainstorm_server`'s `nip05_service.py`
 * serves `default_observer_pubkey()` under the reserved NIP-05 name `_`. So we
 * ask for it the same way any Nostr client would, and nothing is baked in.
 */
let housePubkeyPromise: Promise<string | null> | null = null;

export function resolveHouseObserver(): Promise<string | null> {
  if (!housePubkeyPromise) housePubkeyPromise = fetchHouseObserver();
  return housePubkeyPromise;
}

async function fetchHouseObserver(): Promise<string | null> {
  // Plain `fetch`, never `authenticatedFetch`: tag reads are anon-viewable and a
  // 401 on that path wipes local auth storage and hard-redirects to the home
  // page (.agents/memory/anon-public-data-fetch.md).
  const bases = [
    "", // same-origin — nginx serves /.well-known in staging/prod
    (env.VITE_API_URL || "").replace(/\/+$/, ""),
  ].filter((b, i, all) => all.indexOf(b) === i);

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/.well-known/nostr.json?name=_`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const doc = (await res.json()) as { names?: Record<string, string> };
      const pk = doc?.names?.["_"];
      if (pk && HEX64.test(pk)) return pk;
    } catch {
      /* try the next base */
    }
  }
  return null;
}

/**
 * Read `observerPubkey`'s kind-10040 and pull out where its rank scores live.
 *
 * Returns `null` when the observer has never published one — a real state, not
 * an error: an account that hasn't activated has no scorer, so it has no
 * perspective to compute from. Callers fall back to the house rather than to
 * "count everyone", because a missing declaration is not a reason to trust
 * strangers.
 */
const sourceCache = new Map<string, Promise<TrustSourceRef | null>>();

export function resolveTrustSource(observerPubkey: string): Promise<TrustSourceRef | null> {
  if (!observerPubkey || !HEX64.test(observerPubkey)) return Promise.resolve(null);
  let hit = sourceCache.get(observerPubkey);
  if (!hit) {
    hit = fetchTrustSource(observerPubkey);
    sourceCache.set(observerPubkey, hit);
  }
  return hit;
}

async function fetchTrustSource(observerPubkey: string): Promise<TrustSourceRef | null> {
  // `fetchTrustProviderList` reads from the observer's OUTBOX relays
  // (loadOutboxRelayListFromDb ∪ PROFILE_RELAYS). That matters: kind-10040s live
  // on general-purpose relays — nos.lol and purplepag.es carry hundreds — and
  // none at all sit on the tag hub or the nip85 relays. Querying the trust
  // relays for them finds nothing and looks like "this user never published one".
  const event = await fetchTrustProviderList(observerPubkey).catch(() => undefined);
  if (!event) return null;

  // NIP-85 keys the pointer per metric. We gate on `rank`, so that's the entry
  // that decides; the others (followers/hops/muters/reporters) are the same TA
  // in every declaration seen so far, but we don't rely on that.
  const tag = (event.tags || []).find((t: string[]) => t[0] === "30382:rank");
  const taPubkey = tag?.[1];
  const relay = tag?.[2];
  if (!taPubkey || !HEX64.test(taPubkey) || !relay) return null;

  return { taPubkey, relay };
}

/** Test seam — the caches are module-level and would leak between cases. */
export function __resetTrustSourceCaches(): void {
  sourceCache.clear();
  housePubkeyPromise = null;
}
