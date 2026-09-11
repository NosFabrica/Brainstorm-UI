/**
 * The Zap Store relay — the one place the release ASSET events (kind 3063:
 * the APK's url, mime, size, hash) actually live. Our search relay indexes
 * listings and releases but not these (docs/search/RELAY-ASKS.md #6), so the
 * app page makes one extra hop here. Lazy singleton over the shared pool,
 * mirroring searchRelay; a public relay with a fixed address, so no env key.
 */
import type { Relay } from "applesauce-relay";
import { pool } from "./relayPool";

export const ZAPSTORE_RELAY_URL = "wss://relay.zapstore.dev/";

let cached: Relay | null | undefined;

export function zapstoreRelay(): Relay | null {
  if (cached !== undefined) return cached;
  cached = pool.relay(ZAPSTORE_RELAY_URL);
  return cached;
}
