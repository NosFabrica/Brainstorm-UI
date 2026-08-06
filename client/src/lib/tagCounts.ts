/**
 * Reading a tag's counts, now that the subject counts as an asserter.
 *
 * The kit counts distinct trusted asserters with no self exclusion, and
 * ACCEPTANCE C1 checks our net against the reference instance's — so
 * `applications` includes the subject's own assertion when they made one. That
 * is the right number to publish and the wrong number to phrase UI copy from:
 * "1 person added this" is misleading when that person is the subject.
 *
 * These two helpers are the whole difference. Pure and dependency-free so the
 * rule lives in one place and can be tested without the nostr stack.
 */

/** The shape both profile chips and tag-page rows share. */
export interface SelfAwareCount {
  /** Distinct asserters, the subject included. */
  applications: number;
  /** The subject applied it to themselves. */
  selfDeclared: boolean;
}

/**
 * Nobody but the subject has vouched. A claim, not a corroboration — worth
 * saying plainly rather than dressing up as network attestation.
 */
export function onlySelfDeclared(t: SelfAwareCount): boolean {
  return t.selfDeclared && t.applications <= 1;
}

/**
 * How many people OTHER than the subject vouched. What "N people added this"
 * should count, since the subject saying it about themselves isn't other people
 * saying it.
 */
export function corroborations(t: SelfAwareCount): number {
  return Math.max(0, t.applications - (t.selfDeclared ? 1 : 0));
}
