/**
 * Who is going to an event, through the reader's lens (Show and Tell: everyone
 * counts, and who the reader trusts is shown first). "N going" counts every
 * RSVP whose newest answer is yes; "K you trust" counts those whose authors
 * are in the reader's web of trust. The faces lead with the reader's own
 * RSVP, then the people they trust, then everyone else, each group newest
 * answer first.
 */

export interface GoingThroughLens {
  going: number;
  /** Going and in the reader's web of trust, the reader aside. */
  trusted: number;
  /** Whose faces to show, in order. */
  faces: string[];
  /** The reader is among them. */
  mine: boolean;
}

export function goingThroughLens(
  goers: readonly string[],
  isTrusted: (pubkey: string) => boolean,
  me: string | null,
  max: number,
): GoingThroughLens {
  const mine = !!me && goers.includes(me);
  const others = goers.filter((pk) => pk !== me);
  const trusted = others.filter(isTrusted);
  const rest = others.filter((pk) => !isTrusted(pk));
  return {
    going: goers.length,
    trusted: trusted.length,
    faces: [...(mine ? [me!] : []), ...trusted, ...rest].slice(0, max),
    mine,
  };
}
