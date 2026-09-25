/**
 * Reading a kind-0 already in hand. Pure, and apart from `services/nostr`, so
 * a page can parse the profile it follows without reaching for the network
 * layer (and a test that stubs the network layer still parses it).
 */
import type { NostrEvent } from "nostr-tools";
import { getProfileContent, isValidProfile, type ProfileContent } from "applesauce-core/helpers/profile";

/** A kind-0's content, parsed — leniently, as the share page always has. */
export function profileContentOf(event: NostrEvent | null | undefined): ProfileContent | undefined {
  if (!event) return undefined;
  try {
    if (isValidProfile(event as any)) return getProfileContent(event as any);
  } catch {}
  if (typeof event.content === "string") {
    try {
      return JSON.parse(event.content) as ProfileContent;
    } catch {}
  }
  return undefined;
}

/**
 * NIP-39 external identity claims from a kind-0 event — the `i` tags, e.g.
 * `["i", "github:alice", "<proof>"]`. Returns the raw `platform:identity`
 * claim strings (parsed for display by `lib/externalIdentity`).
 */
export function externalIdentitiesOf(event: NostrEvent | null | undefined): string[] {
  if (!event) return [];
  return (event.tags || [])
    .filter((t) => t[0] === "i" && typeof t[1] === "string" && t[1].includes(":"))
    .map((t) => t[1] as string);
}
