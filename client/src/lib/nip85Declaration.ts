import type { NostrEvent } from "applesauce-core/helpers";

/**
 * Does this kind-10040 declare `taPubkey` (publishing on `relayUrl`) as the
 * holder's trust provider? Brainstorm publishes rank AND followers assertions,
 * so a declaration only counts when both tags name our TA on our relay — the
 * semantics `isUsingBrainstorm` has always had, extracted so callers that
 * already hold the event (the dashboard's activation check) can ask the
 * question without re-fetching it.
 */
export function declaresTrustProvider(event: NostrEvent, taPubkey: string, relayUrl: string): boolean {
  if (!taPubkey || !relayUrl) return false;
  let rank = false;
  let followers = false;
  for (const tag of event.tags) {
    if (tag[1] !== taPubkey || String(tag[2]) !== String(relayUrl)) continue;
    if (tag[0] === "30382:rank") rank = true;
    if (tag[0] === "30382:followers") followers = true;
  }
  return rank && followers;
}
