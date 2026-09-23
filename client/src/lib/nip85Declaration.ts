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

/**
 * The Trusted List kinds Brainstorm's assistant publishes for a user: 30392
 * (pubkeys), 30393 (events), 30394 (addressable events). Other apps find a
 * user's lists through their 10040, one row per kind.
 */
export const LIST_KINDS = ["30392", "30393", "30394"] as const;

/** Who publishes a user's Trusted Lists, and where — from the server's /setup "30392" row. */
export interface ListDesignation {
  key: string;
  relay: string;
}

/** The 10040 rows naming the assistant for every Trusted List kind. */
export function listRows({ key, relay }: ListDesignation): string[][] {
  return LIST_KINDS.map((kind) => [kind, key, relay]);
}

/**
 * The user's 10040 tags with ours set: every row whose label we're setting is
 * replaced, every other tag — another provider's rows included — is kept. The
 * old publish rebuilt the whole 10040 from our two rows and dropped the rest.
 */
export function mergeDesignation(existing: string[][], rows: string[][]): string[][] {
  const ours = new Set(rows.map((r) => r[0]));
  return [...existing.filter((t) => !ours.has(t[0])), ...rows];
}

const sameRelay = (a: unknown, b: string) =>
  String(a ?? "").trim().replace(/\/+$/, "") === b.trim().replace(/\/+$/, "");

/** Does this 10040 already name `key` on `relay` for every Trusted List kind? */
export function declaresLists(event: { tags: string[][] } | null | undefined, { key, relay }: ListDesignation): boolean {
  if (!event || !key || !relay) return false;
  return LIST_KINDS.every((kind) => event.tags.some((t) => t[0] === kind && t[1] === key && sameRelay(t[2], relay)));
}
