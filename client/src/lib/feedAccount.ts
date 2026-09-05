/**
 * Is this account a feed — a bot, an RSS mirror, a news wire? Legitimate
 * voices, but a page of them reads like a scraper, so people lead and feeds
 * follow. NIP-24 lets a profile say `bot: true`; most that don't say it in
 * the name instead ("Bitcoin Magazine (News Bot)", "Cryptovka | Feed").
 * Whole words only: "Robot Dreams" and "feedbackloop" are people.
 */
const FEED_WORD = /(?:^|[^a-z])(?:bot|rss|feed)(?:$|[^a-z])/i;

export function isFeedAccount(author: { bot?: boolean; name?: string; displayName?: string } | null | undefined): boolean {
  if (!author) return false;
  if (author.bot === true) return true;
  return FEED_WORD.test(author.name ?? "") || FEED_WORD.test(author.displayName ?? "");
}
