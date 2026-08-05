/**
 * Types for the vendored `profile-tagging.js`. Hand-written by us — see
 * ./README.md. Describes only the surface we call; widen as needed.
 */

/** An unsigned partial event: the builders deliberately omit pubkey/created_at. */
export interface UnsignedPartialEvent {
  kind: number;
  tags: string[][];
  content: string;
}

/** A tag-element identified for assertion purposes. */
export interface TagRef {
  authorPubkey: string;
  slug: string;
  /** The tag-element's signed event id — provenance `e`. Absent is legal. */
  eventId?: string | null;
}

/** +1 applies the tag, -1 disputes it. */
export type Polarity = 1 | -1;

/** Concept handle for the nostr-user-tag namespace under one pubkey. */
export function conceptNostrUserTag(pk: string): string;

export function buildProfileTagAssertion(args: {
  tag: TagRef;
  targetPubkey: string;
  polarity: Polarity;
  asserterPubkey: string;
  zHandlePubkeys: string[];
}): UnsignedPartialEvent;

/** Filter: every profile-tag assertion pointing at one pubkey. */
export function filterTagsAppliedToPubkey(args: {
  targetPubkey: string;
  zHandlePubkeys: string[];
}): Record<string, unknown>;

/** Filter: every profile-tag assertion that uses one tag. */
export function filterProfileTaggingsUsingTag(args: {
  tagAuthorPubkey: string;
  slug: string;
  zHandlePubkeys: string[];
}): Record<string, unknown>;

/** Filter: the tag-elements themselves, for discovery / the picker. */
export function filterTagElements(args: {
  zHandlePubkeys: string[];
}): Record<string, unknown>;

/** What `applyProfileTagging` managed to get onto the wire. */
export interface PublishedRef {
  kind: number;
  address: string;
  id: string;
}

/**
 * Partial-failure report. Present only when something reached the wire and a
 * later step failed — with nothing published yet, the SDK throws instead.
 */
export interface TaggingFailure {
  kind: number;
  what: "tag-element" | "assertion";
  error?: string;
}

export interface ApplyProfileTaggingResult {
  published: PublishedRef[];
  failedAt?: TaggingFailure;
}

/** Injected I/O — the SDK itself never signs, publishes, or reads a clock. */
export interface TaggingDeps {
  sign(unsigned: Record<string, unknown>): Promise<Record<string, unknown>>;
  publish(signed: Record<string, unknown>): Promise<unknown>;
  now(): number;
  /** Required only when minting a brand-new tag. */
  buildTagElement?: (args: {
    name: string;
    description?: string;
    taPubkeys: string[];
    applicabilityZ?: string;
  }) => UnsignedPartialEvent;
}

/**
 * Apply or dispute a tag on a pubkey, minting the tag-element first when the
 * tag is new. `tagInput` is `{ name, description }` to mint, or
 * `{ authorPubkey, slug, eventId? }` to reuse an existing tag.
 */
export function applyProfileTagging(args: {
  tagInput: { name: string; description?: string } | TagRef;
  targetPubkey: string;
  polarity: Polarity;
  asserterPubkey: string;
  zHandlePubkeys: string[];
  deps: TaggingDeps;
}): Promise<ApplyProfileTaggingResult>;
