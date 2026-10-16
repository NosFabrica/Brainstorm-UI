/**
 * The poll kinds and NIP-88's one counting rule, apart from the rest of
 * lib/polls: a feed card or a vote's page needs to know a poll when it sees
 * one, and what a response casts, without loading the poll card's code
 * (components/share/LazyPollCard).
 */
export const POLL_KIND = 1068;
export const POLL_RESPONSE_KIND = 1018;
export const ZAP_POLL_KIND = 6969;
/** Kinds drawn with a poll card under their question. */
export const POLL_KINDS: ReadonlySet<number> = new Set([POLL_KIND, ZAP_POLL_KIND]);

/**
 * What a response actually casts. NIP-88: on a single-choice poll the first
 * `response` tag is the answer — a response naming every option casts nothing
 * valid rather than one vote each; on a multiple-choice poll each id counts
 * once, order aside. Ids the poll never declared are dropped.
 */
export function acceptedChoices(poll: { options: { id: string }[]; multiple: boolean }, codes: string[]): string[] {
  const valid = new Set(poll.options.map((o) => o.id));
  if (!poll.multiple) return codes[0] !== undefined && valid.has(codes[0]) ? [codes[0]] : [];
  return Array.from(new Set(codes.filter((c) => valid.has(c))));
}
