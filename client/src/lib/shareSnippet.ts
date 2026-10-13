/**
 * What a shared event page's link preview says under its title. A note is its
 * text; a kind whose content is not words — a voice message's file address, a
 * reaction's "+", a follow list's nothing, a repost's JSON — is said the way
 * its search row says it (lib/resultSummary), or named.
 */
import { summarizeResult } from "@/lib/resultSummary";

type SnippetEvent = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content: string };

const MAX = 160;

function words(ev: SnippetEvent): string {
  switch (ev.kind) {
    case 1222:
      return "A voice message";
    case 1244:
      return "A voice reply";
    case 3:
      // "Follows 120 people" — the people themselves are keys, no words for a preview.
      return summarizeResult(ev).title ?? "";
    case 7:
    case 17: {
      // "Reacted ❤", and the page an external reaction was on.
      const s = summarizeResult(ev);
      return [s.title, s.body].filter(Boolean).join(" ");
    }
    case 6:
    case 16:
      // The reposted note's words when the repost carries it (NIP-18), else what it is.
      return summarizeResult(ev).body || "A repost";
    default:
      return ev.content;
  }
}

export function shareSnippet(ev: SnippetEvent): string {
  return words(ev).replace(/\s+/g, " ").trim().slice(0, MAX);
}
