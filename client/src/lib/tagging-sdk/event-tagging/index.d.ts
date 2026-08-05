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
