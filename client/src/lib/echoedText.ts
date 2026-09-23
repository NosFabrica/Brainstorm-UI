/**
 * Whether a link preview's words are already on screen. RSS bots post the
 * headline and the lede, then the link — whose Open Graph title and
 * description are that same headline and lede, so a card repeating them is
 * the story twice. Loose on purpose: outlets suffix titles with their name
 * ("… | G1"), truncate descriptions ("…"), and bots rephrase a word or two.
 */

/** Lowercase words, accents folded, punctuation gone. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** "Headline | G1", "Headline - The Verge", "Headline — Site": the headline. */
function withoutSiteSuffix(title: string): string {
  return title.replace(/\s+[|·•–—-]\s+[^|·•–—-]{1,40}$/u, "");
}

/** Share of `snippet`'s meaningful words that `context` already has. A
 *  short snippet ("Liverpool F.C.") shares a word with anything, so under
 *  three words it must appear whole, in order. */
function overlap(snippet: string, context: string[], contextSet: Set<string>): number {
  const all = words(snippet);
  const own = all.filter((w) => w.length > 2);
  if (own.length < 3) return ` ${context.join(" ")} `.includes(` ${all.join(" ")} `) ? 1 : 0;
  return own.filter((w) => contextSet.has(w)).length / own.length;
}

/** At least this share of a snippet's words on screen means it adds nothing. */
const ECHO = 0.75;

/**
 * True when `snippet` (a preview's title or description) says nothing the
 * `context` (the text already shown) doesn't. Empty snippets count as echoed.
 */
export function isEchoed(snippet: string | null | undefined, context: string | null | undefined): boolean {
  if (!snippet?.trim()) return true;
  if (!context?.trim()) return false;
  // A link's path is not something the reader was told.
  const ctx = words(context.replace(/\b(?:https?:\/\/|nostr:)\S+/gi, " "));
  if (ctx.length === 0) return false;
  const ctxSet = new Set(ctx);
  const trimmed = snippet.replace(/(?:\.\.\.|…)\s*$/u, "");
  return overlap(trimmed, ctx, ctxSet) >= ECHO || overlap(withoutSiteSuffix(trimmed), ctx, ctxSet) >= ECHO;
}
