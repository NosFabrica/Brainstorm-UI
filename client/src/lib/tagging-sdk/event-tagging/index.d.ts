/**
 * Types for the vendored `event-tagging/` barrel. Hand-written by us — see
 * ../README.md. Declares only what floor B touches.
 *
 * Floor B does not tag notes, so almost none of this module is in play. We need
 * `buildTagElement` (injected into `applyProfileTagging` to mint a brand-new
 * tag) and `slug` (to predict a tag's identity before it is signed). The rest
 * of the barrel — the header/assertion builders, classifiers and taggings
 * helpers — stays undeclared until note tagging (rung C2) actually needs it.
 */

import type { UnsignedPartialEvent } from "../profile-tagging";

export type { UnsignedPartialEvent };

/**
 * Canonical slug derivation: lowercase, strip diacritics, non-alphanumerics to
 * hyphens, trim. A tag's `d` tag is the slug of its name, so this is also how
 * you predict a new tag's address before signing it.
 */
export function slug(name: string): string;

/** The tag-element's addressable coordinate: `39999:<author>:<slug>`. */
export function tagElementAddr(authorPubkey: string, slug: string): string;

/** Concept handle for the `tag` namespace under one pubkey. */
export function conceptTag(taPubkey: string): string;

/** Concept handle for the `nostr-event-tag` namespace — assertions about notes. */
export function conceptNostrEventTag(taPubkey: string): string;

/** Concept handle for the `tagging-with-specific-tag` namespace — the headers. */
export function conceptTaggingWithSpecificTag(taPubkey: string): string;

/**
 * Build a tag-element (the tag itself, as opposed to an assertion applying it).
 *
 * `taPubkeys` are the concept namespaces to join — ours is
 * `[canonicalConceptPubkey, localTaPubkey]`. `applicabilityZ` is an optional
 * hint about what the tag is for; a tag born tagging a person carries
 * `tag-for-nostr-pubkey`.
 */
export function buildTagElement(args: {
  name: string;
  description?: string;
  taPubkeys: string[];
  applicabilityZ?: string;
}): UnsignedPartialEvent;

/**
 * The relay filter that finds tag-elements carrying a context's applicability
 * z-hint — the HINT half of the HINT ∪ USAGE union.
 */
export function applicabilityHintFilter(context: "event" | "pubkey"): {
  kinds: number[];
  "#z": string[];
};

/**
 * Derive one context's applicable tags client-side: HINT ∪ USAGE, deduped by
 * a-coordinate, usage-descending (hint-only entries last, at zero).
 *
 * The fallback the kit prescribes when the house's published kind-30394
 * applicability lists are absent or unreachable.
 */
export function deriveApplicabilityMembers(args: {
  usageRows: Array<{
    tag: { authorPubkey: string; slug: string };
    byType: { event?: { applications: number }; profile?: { applications: number } };
  }>;
  hintEls: unknown[];
  context: "event" | "pubkey";
}): Array<{ a: string; authorPubkey: string | null; slug: string | null; applications: number }>;

// ─── Event tagging (rung C2) ─────────────────────────────────────────────────

/** A tagging target: a plain event by id, or an addressable one by coordinate. */
export type EventTagTarget =
  | { id: string; relays?: string[] }
  | { address: string };

/** Candidates that tag a given event. Results are candidates, not truth. */
export function filterTagsAppliedToEvent(args: { target: EventTagTarget }): Record<string, unknown>;

/** All taggings that apply a given tag, via its per-tag tagging header. */
export function filterTaggingsUsingTag(args: {
  headerAuthorPubkey: string;
  slug: string;
}): Record<string, unknown>;

/** The per-tag tagging headers that exist for a tag — is it event-taggable yet. */
export function filterTaggingHeadersForTag(args: {
  tagAuthorPubkey: string;
  slug: string;
  taPubkey: string;
}): Record<string, unknown>;

interface TaggingEntry {
  eventId: string;
  authorPubkey: string;
  createdAt: number;
  polarity: number;
}

/**
 * Group candidate taggings of ONE target by tag. A candidate counts only if its
 * descriptor header resolves AND joins an honored `tagging-with-specific-tag`
 * namespace; unresolvable headers surface in `unverifiable` rather than vanish.
 */
export function classifyEventTaggings(args: {
  candidates: unknown[];
  headers: unknown[];
  honoredAuthorities: string[];
  isAsserterTrusted?: (pubkey: string) => boolean;
  viewerPubkey?: string;
}): {
  tags: Array<{
    tag: { authorPubkey: string; slug: string };
    applications: TaggingEntry[];
    disputes: TaggingEntry[];
  }>;
  unverifiable: Array<{
    eventId: string;
    authorPubkey: string;
    descriptor: string;
    createdAt: number;
  }>;
  mine: Array<{
    tag: { authorPubkey: string; slug: string };
    stance: "apply" | "dispute";
    eventId: string;
    createdAt: number;
  }>;
};

/** The forward complement: candidates for ONE tag, grouped by target note. */
export function groupTaggingsByTarget(args: {
  candidates: unknown[];
  headers: unknown[];
  honoredAuthorities: string[];
  isAsserterTrusted?: (pubkey: string) => boolean;
  viewerPubkey?: string;
  tag: { authorPubkey: string; slug: string };
}): {
  targets: Array<{
    target: { id?: string; address?: string };
    applications: TaggingEntry[];
    disputes: TaggingEntry[];
  }>;
  mine: Array<{
    target: { id?: string; address?: string };
    stance: "apply" | "dispute";
    eventId: string;
    createdAt: number;
  }>;
};

/**
 * Apply (or dispute) a tag on an event, minting whatever intermediate objects
 * are missing. 1, 2 or 3 publishes — everything is signed before anything is
 * published, so cancelling the signer aborts cleanly.
 */
export function applyEventTagging(args: {
  tagInput: { name: string; description?: string } | { authorPubkey: string; slug: string };
  target: EventTagTarget;
  polarity: 1 | -1;
  asserterPubkey: string;
  taPubkeys: string[];
  deps: {
    findHeaders?: (args: { tagAuthorPubkey: string; slug: string }) => Promise<Array<{ author: string }>>;
    sign: (unsigned: Record<string, unknown>) => Promise<Record<string, unknown>>;
    publish: (signed: Record<string, unknown>) => Promise<unknown>;
    now: () => number;
  };
}): Promise<{
  sequence: "a" | "b" | "c";
  published: Array<{ kind: number; address: string; id: string }>;
  failedAt?: { kind: number; address: string; error?: string };
}>;
