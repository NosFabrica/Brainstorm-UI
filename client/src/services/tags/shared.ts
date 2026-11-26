/** What every part of services/tags shares: the event shape, a tag's identity, and the inclusion rule. */

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

/** A tag as the UI cares about it. */
export interface TagIdentity {
  authorPubkey: string;
  slug: string;
  /** Display name from the tag-element's content; falls back to the slug. */
  name: string;
  description?: string;
  /**
   * What its creator made it for, when the tag says: "posts" for one created
   * while tagging a post, "people" for one created on a profile (the kit's
   * applicability hints). A hint about intent, never a rule about use.
   */
  madeFor?: "posts" | "people";
}

export const TAG_ELEMENT_KIND = 39999;

export function tagValue(ev: NostrEvent, name: string): string | undefined {
  return (ev.tags || []).find((t) => t[0] === name)?.[1];
}

/**
 * The kit's inclusion rule: a target counts when its trusted support beats its
 * trusted opposition (`INTEGRATION.md` C6 — "net apply−dispute > 0", restated
 * in ACCEPTANCE Floors B and D). Counting applications alone would leave
 * someone visible at 1 agree against 5 disagrees.
 */
export function netPositive(applications: number, disputes: number): boolean {
  return applications - disputes > 0;
}
