/**
 * Types for the vendored `trust.js`. Hand-written by us — see ./README.md.
 *
 * The whole point of this module is that every read surface funnels "does this
 * asserter count?" through one shape: `(pubkey) => boolean`. Later phases swap
 * the source behind that predicate; UI code never changes.
 */

/** The POV predicate. Synchronous by contract — classifiers require it. */
export type TrustPredicate = (pubkey: string) => boolean;

/** Everyone counts. The explicit degraded-mode predicate. */
export function trustEveryone(): TrustPredicate;

export interface HouseTrustSource {
  /**
   * Warm the cache for the asserters you actually saw. Call this before
   * classifying — a pubkey never passed through `ensure` falls under
   * `unknownPolicy`. Never throws: a failed chunk is left uncached so a later
   * call retries it.
   */
  ensure(pubkeys: string[]): Promise<void>;
  predicate: TrustPredicate;
}

/**
 * Build a lazy, cached house-POV trust source from NIP-85 kind-30382 assertions.
 *
 * `fetchEvents` MUST be wired to the trust relays — the house's TA-signed
 * artifacts are not on the tag hub, and a hub-only reader silently degrades to
 * counting everyone.
 *
 * `assertionAuthorPubkeys` is a list because the house's signing key rotates;
 * latest event per subject wins across all honored keys.
 */
export function createHouseTrustSource(opts: {
  fetchEvents: (filter: Record<string, unknown>) => Promise<unknown[]>;
  assertionAuthorPubkeys: string[];
  /** Minimum rank (round(influence * 100)) to count. Default 1. */
  minRank?: number;
  /** Maximum hops to count; 999 means unreachable. Default 20. */
  maxHops?: number;
  /** How to treat a pubkey with no assertion at all. Default 'trusted'. */
  unknownPolicy?: "trusted" | "everyone";
}): HouseTrustSource;

/**
 * The house's published "which tags are for events / for pubkeys" split, as
 * sets of tag a-coordinates (`39999:<author>:<slug>`). Returns empty sets when
 * unpublished or unreachable — callers fall back to client-side derivation.
 */
export function fetchApplicabilityLists(args: {
  fetchEvents: (filter: Record<string, unknown>) => Promise<unknown[]>;
  houseAssistantPubkey: string;
}): Promise<{ event: Set<string>; pubkey: Set<string> }>;
