/**
 * Text set for reading — the one renderer for every body of prose an event
 * page shows in full: a note, a listing's description, a calendar event's
 * About, a video's summary. Paragraphs, light markdown and the prose pass
 * come from `lib/noteBlocks`; this owns the type.
 *
 * Two sizes on one scale: `post` is the event itself (a note is the whole
 * page), `body` is a description under a hero that already has a title.
 *
 * Tokens render through `renderToken` when the caller has richer ones
 * (NoteContent embeds media, cards and mentions with profiles). Without it,
 * a description renders them quietly: links as underlined text, media as
 * links (the hero shows the media itself), mentions as the person.
 */
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { parseNoteContent, prettyUrlLabel, type NoteToken } from "@/lib/noteContent";
import { toNoteBlocks, parseInlineMarkdown, type InlineSpan } from "@/lib/noteBlocks";
import { decodeNostrEntity } from "@/lib/noteRefs";
import { htmlToText, looksLikeHtml } from "@/lib/htmlText";
import { MentionChip } from "@/components/share/MentionChip";
import { useShareNav } from "@/components/share/ShareNavContext";

export type ReadingSize = "post" | "body";

const SIZE: Record<ReadingSize, string> = {
  post: "text-[17px] sm:text-[18px] leading-[1.65] tracking-[-0.005em] text-slate-800 dark:text-slate-100",
  body: "text-[15px] sm:text-base leading-[1.65] text-slate-700 dark:text-slate-200",
};
// Headings relative to the body. A description sits under the hero's own
// title, so its headings stay below it.
const HEADING: Record<ReadingSize, [string, string, string]> = {
  post: ["text-[1.35em]", "text-[1.2em]", "text-[1.05em]"],
  body: ["text-[1.15em]", "text-[1.07em]", "text-[1em]"],
};

/** Inline emphasis spans as elements. */
export function renderSpans(spans: InlineSpan[], key: string): ReactNode[] {
  return spans.map((s, i) => {
    const k = `${key}.${i}`;
    if (s.type === "text") return s.value;
    if (s.type === "code") {
      return <code key={k} className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-slate-800 dark:text-slate-100 [overflow-wrap:anywhere]">{s.value}</code>;
    }
    return s.type === "strong"
      ? <strong key={k} className="font-semibold text-slate-900 dark:text-white">{renderSpans(s.children, k)}</strong>
      : <em key={k}>{renderSpans(s.children, k)}</em>;
  });
}

/** `host/short-path`, or just the host when the path is an opaque id (a
 *  blob hash, an upload key) — forty hex characters say nothing. */
export function readingLinkLabel(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    const stem = last.replace(/\.[a-z0-9]{1,5}$/i, "");
    if (/^[0-9a-f]{16,}$/i.test(stem) || (stem.length >= 20 && !/[-_.]/.test(stem) && /\d/.test(stem) && /[a-z]/i.test(stem))) {
      return u.hostname.replace(/^www\./, "");
    }
  } catch {
    /* not a URL — the pretty label falls back too */
  }
  return prettyUrlLabel(url);
}

/** A plain web link in running prose: underlined text, not a favicon chip —
 *  chips every few words break the line's rhythm. */
export function ReadingLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="font-medium text-brand-link underline decoration-brand-link/30 underline-offset-[3px] hover:decoration-brand-link [overflow-wrap:anywhere]"
      data-testid="reading-link"
    >
      {readingLinkLabel(url)}
    </a>
  );
}

export function ReadingText({
  text,
  tokens: given,
  size = "body",
  headline = size === "post",
  renderToken,
  after,
  className = "",
  testId,
}: {
  text?: string;
  /** Already-parsed tokens (NoteContent parses once for everything it does). */
  tokens?: NoteToken[];
  size?: ReadingSize;
  /** Promote a long text's short first line to a headline (see noteBlocks). */
  headline?: boolean;
  /** Richer rendering for non-text tokens; text runs still go through here. */
  renderToken?: (token: NoteToken, key: string) => ReactNode;
  /** Rendered inside the column after the text (a link card). */
  after?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const requestNav = useShareNav();
  const [, navigate] = useLocation();
  const tokens = given ?? parseNoteContent(text && looksLikeHtml(text) ? htmlToText(text) : text || "");

  const quiet = (t: NoteToken, key: string): ReactNode => {
    switch (t.type) {
      case "url":
      case "image":
      case "video":
      case "audio":
      case "live":
        return <ReadingLink key={key} url={t.value} />;
      case "hashtag":
        return (
          <button key={key} type="button" onClick={() => requestNav({ kind: "hashtag", target: t.value, label: t.value })} className="font-medium text-brand-link hover:underline">
            {t.value}
          </button>
        );
      case "mention": {
        const { pubkey, address } = decodeNostrEntity(t.bech32);
        if (pubkey) return <MentionChip key={key} uri={`nostr:${t.bech32}`} />;
        return (
          <button key={key} type="button" onClick={() => navigate(`/${address ? "a" : "e"}/${t.bech32}`)} className="font-medium text-brand-link hover:underline">
            {address ? "📄 article" : "↳ quoted note"}
          </button>
        );
      }
      default:
        return null;
    }
  };
  const inline = (ts: NoteToken[], key: string) =>
    ts.map((t, j) => {
      const k = `${key}.${j}`;
      if (t.type === "text") return <span key={k}>{renderSpans(parseInlineMarkdown(t.value), k)}</span>;
      return renderToken ? renderToken(t, k) : quiet(t, k);
    });
  const [h1, h2, h3] = HEADING[size];

  return (
    <div className={`note-reading max-w-[68ch] break-words ${SIZE[size]} ${className}`} data-testid={testId}>
      {toNoteBlocks(tokens, { headline }).map((b, i) => {
        const k = String(i);
        switch (b.type) {
          case "p":
            return <div key={k} className="whitespace-pre-wrap">{inline(b.tokens, k)}</div>;
          case "h": {
            const Tag = (["h2", "h3", "h4"] as const)[b.level - 1];
            return <Tag key={k} className={`${[h1, h2, h3][b.level - 1]} font-bold leading-snug tracking-tight text-slate-900 dark:text-white`} style={{ fontFamily: "var(--font-display)" }}>{inline(b.tokens, k)}</Tag>;
          }
          case "ul":
          case "ol": {
            const List = b.type;
            return (
              <List key={k} start={b.type === "ol" ? b.start : undefined} className={`${b.type === "ul" ? "list-disc" : "list-decimal"} space-y-1.5 pl-6 marker:text-slate-400 dark:marker:text-slate-500`}>
                {b.items.map((item, j) => <li key={j} className="whitespace-pre-wrap pl-1">{inline(item, `${k}.${j}`)}</li>)}
              </List>
            );
          }
          case "quote":
            return <blockquote key={k} className="whitespace-pre-wrap border-l-[3px] border-slate-300 dark:border-slate-600 pl-4 italic text-slate-600 dark:text-slate-300">{inline(b.tokens, k)}</blockquote>;
          case "code":
            return <pre key={k} className="overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3 font-mono text-[0.8em] leading-relaxed text-slate-800 dark:text-slate-100"><code>{b.text}</code></pre>;
          case "caption":
            return <p key={k} className="note-caption whitespace-pre-wrap text-[0.8em] leading-snug text-slate-500 dark:text-slate-400">{inline(b.tokens, k)}</p>;
          case "hr":
            return <hr key={k} className="mx-auto w-16 border-slate-200 dark:border-slate-700" />;
        }
      })}
      {after}
    </div>
  );
}
