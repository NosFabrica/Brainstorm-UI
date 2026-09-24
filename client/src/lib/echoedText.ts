/**
 * Whether a link preview's words are already on screen. RSS bots post the
 * headline and the lede, then the link — whose Open Graph title and
 * description are that same headline and lede, so a card repeating them is
 * the story twice. Loose on purpose: outlets suffix titles with their name
 * ("… | G1"), truncate descriptions ("…"), and bots rephrase a word or two.
 * Strict where it counts: words must come in the same order (shared word
 * PAIRS, not shared words), so a chatty note full of "the"/"que"/"para"
 * never swallows an unrelated headline.
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

function pairs(ws: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < ws.length; i++) out.push(`${ws[i - 1]} ${ws[i]}`);
  return out;
}

/** The on-screen text, tokenized once for any number of checks. */
export interface EchoContext {
  joined: string;
  pairs: Set<string>;
}

export function echoContext(context: string | null | undefined): EchoContext | null {
  if (!context?.trim()) return null;
  // A link's path is not something the reader was told.
  const ws = words(context.replace(/\b(?:https?:\/\/|nostr:)\S+/gi, " "));
  if (ws.length === 0) return null;
  return { joined: ` ${ws.join(" ")} `, pairs: new Set(pairs(ws)) };
}

/** "Headline | G1", "Headline - The Verge", "Headline — Site": the headline. */
function withoutSiteSuffix(title: string): string {
  return title.replace(/\s+[|·•–—-]\s+[^|·•–—-]{1,40}$/u, "");
}

/** Under this many meaningful words, a snippet must appear whole, in order. */
const SHORT = 3;
/** At least this share of a snippet's word pairs on screen means it adds nothing. */
const ECHO = 0.6;

function echoes(snippet: string, ctx: EchoContext, allowShort: boolean): boolean {
  const ws = words(snippet);
  if (ws.filter((w) => w.length > 2).length < SHORT) {
    // "Liverpool F.C." shares a word with anything; only the whole phrase counts.
    return allowShort && ws.length > 0 && ctx.joined.includes(` ${ws.join(" ")} `);
  }
  const own = pairs(ws);
  return own.filter((p) => ctx.pairs.has(p)).length / own.length >= ECHO;
}

/**
 * True when `snippet` (a preview's title or description) says nothing the
 * context (the text already shown) doesn't. Empty snippets count as echoed.
 * Pass an `echoContext` when checking several snippets against one text.
 */
export function isEchoed(snippet: string | null | undefined, context: string | EchoContext | null | undefined): boolean {
  if (!snippet?.trim()) return true;
  const ctx = typeof context === "string" || context == null ? echoContext(context) : context;
  if (!ctx) return false;
  const trimmed = snippet.replace(/(?:\.\.\.|…)\s*$/u, "");
  if (echoes(trimmed, ctx, true)) return true;
  // The suffix-less headline must still be a real headline: "Tesla - Recall
  // hits 2M cars" is not echoed by a note that merely says "Tesla".
  const bare = withoutSiteSuffix(trimmed);
  return bare !== trimmed && echoes(bare, ctx, false);
}
