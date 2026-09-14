/**
 * Query-term highlighting for result snippets — the Google-scan affordance:
 * eyes find their own words first. Only the TEXT of the query highlights;
 * syntax tokens (sort:, from:, include:spam, -exclusions) never do.
 */
import { liftQuery } from "@/lib/searchSyntax";

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryWords(query: string): string[] {
  return liftQuery(query)
    .search.split(/\s+/)
    .map((w) => w.replace(/^["'-]+|["']+$/g, ""))
    .filter((w) => w.length >= 2 && !w.includes(":"));
}

export function highlightTerms(text: string, query: string): HighlightSegment[] {
  const words = queryWords(query);
  if (words.length === 0 || !text) return [{ text, hit: false }];
  // Word-boundary prefix match: "defend" lights up "defenders" too.
  const re = new RegExp(`\\b(${words.map(escapeRegExp).join("|")})`, "giu");
  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ text: text.slice(last, at), hit: false });
    segments.push({ text: match[0], hit: true });
    last = at + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false });
  return segments.length ? segments : [{ text, hit: false }];
}
