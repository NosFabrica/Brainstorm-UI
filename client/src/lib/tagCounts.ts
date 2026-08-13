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

/** Anything identified by a tag coordinate. */
export interface HasTagRef {
  tag: { authorPubkey: string; slug: string };
}

/**
 * The viewer's own stances that the trust filter dropped entirely.
 *
 * Every read path here produces two lists: a trust-filtered one (what counts)
 * and the viewer's own (`mine`, deliberately unfiltered). Mapping over the
 * filtered list alone is a trap — a tag whose ONLY asserter is the viewer, under
 * a POV that doesn't count them, is absent from it, so the viewer's own action
 * silently disappears. ACCEPTANCE Floor B requires the opposite: it must stay
 * visible, "dimmed/struck, not vanished".
 *
 * This returns the entries that need synthesising with zero support so the
 * viewer's stance can INTRODUCE a row rather than only annotate one. It caught a
 * real regression on 2026-08-06: a note tagged solely by the viewer vanished
 * from its own page the moment the POV stopped trusting them.
 */
export function stanceOnlyRefs<Trusted extends HasTagRef, Mine extends HasTagRef>(
  trusted: Trusted[],
  mine: Mine[],
): Mine[] {
  return mine.filter(
    (m) =>
      !trusted.some(
        (t) => t.tag.authorPubkey === m.tag.authorPubkey && t.tag.slug === m.tag.slug,
      ),
  );
}
