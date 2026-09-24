/**
 * Text set for reading — the one renderer for every body of prose an event
 * page shows in full: a note, a listing's description, a calendar event's
 * About, a video's summary. Paragraphs, light markdown and the prose pass
 * come from `lib/noteBlocks`; this owns the type.
 *
 * Every block picks its own direction (`dir="auto"`, lists and quotes on
 * logical sides), so an Arabic, Persian or Hebrew paragraph reads right to
 * left beside an English one; code stays left to right.
 *
 * Two sizes on one scale: `post` is the event itself (a note is the whole
 * page), `body` is a description under a hero that already has a title.
 *
 * Tokens render through `renderToken` when the caller has richer ones
 * (NoteContent embeds media, cards and mentions with profiles). Without it,
 * a description renders them quietly: links as underlined text, media as
 * links (the hero shows the media itself), mentions as the person.
 */
import { useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { parseNoteContent, prettyUrlLabel, type NoteToken } from "@/lib/noteContent";
import { toNoteBlocks, parseInlineMarkdown, type InlineSpan } from "@/lib/noteBlocks";
import { decodeNostrEntity } from "@/lib/noteRefs";
import { READER_KINDS } from "@/lib/shareId";
import { nip19 } from "nostr-tools";
import { htmlToText, looksLikeHtml } from "@/lib/htmlText";
import { MentionChip } from "@/components/share/MentionChip";
import { useShareNav } from "@/components/share/ShareNavContext";
import { GH_REF_RE, splitProse } from "@/components/share/NotesInline";

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

/** Plain text with its bare domains linked and @handles given weight. */
function renderProse(text: string, key: string): ReactNode[] {
  return splitProse(text).map((p, i) =>
    p.type === "domain" ? <ReadingLink key={`${key}~${i}`} url={p.url} label={p.value} />
    : p.type === "handle" ? <span key={`${key}~${i}`} dir="auto" className="font-medium text-slate-900 dark:text-slate-100">{p.value}</span>
    : p.value,
  );
}

/** Inline emphasis spans as elements. `prose` also links bare domains and
 *  weighs @handles — for descriptions, which have no richer token pass. */
export function renderSpans(spans: InlineSpan[], key: string, prose = false): ReactNode[] {
  return spans.map((s, i) => {
    const k = `${key}.${i}`;
    if (s.type === "text") return prose ? renderProse(s.value, k) : s.value;
    if (s.type === "code") {
      return <code key={k} className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-slate-800 dark:text-slate-100 [overflow-wrap:anywhere]">{s.value}</code>;
    }
    return s.type === "strong"
      ? <strong key={k} className="font-semibold text-slate-900 dark:text-white">{renderSpans(s.children, k, prose)}</strong>
      : <em key={k}>{renderSpans(s.children, k, prose)}</em>;
  });
}

/** `host/short-path`, or just the host when the path is an opaque id (a
 *  blob hash, an upload key) — forty hex characters say nothing. */
export function readingLinkLabel(url: string): string {
  const gh = url.match(GH_REF_RE);
  if (gh) return `${gh[1]}/${gh[2]}#${gh[3]}`;
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
export function ReadingLink({ url, label }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      dir="auto"
      className="font-medium text-brand-link underline decoration-brand-link/30 underline-offset-[3px] hover:decoration-brand-link [overflow-wrap:anywhere]"
      data-testid="reading-link"
    >
      {label ?? readingLinkLabel(url)}
    </a>
  );
}

/** What an addressable event is, for a link that names it. */
const ADDRESS_LABEL: Record<number, string> = {
  31337: "🎵 track", 30402: "🛍 listing", 31922: "📅 event", 31923: "📅 event", 30311: "🔴 live stream",
  32267: "📱 app", 30617: "📁 repository", 34235: "🎬 video", 34236: "🎬 video", 30000: "👥 list",
};

function addressKind(bech32: string): number | null {
  try {
    const d = nip19.decode(bech32);
    return d.type === "naddr" ? d.data.kind : null;
  } catch {
    return null;
  }
}

/** A link for an address with no reader here (a track, a listing…), or null
 *  for articles, wiki pages and specs, which open on /a/. */
export function addressLink(bech32: string, key: string | number): ReactNode | null {
  const kind = addressKind(bech32);
  if (kind === null || READER_KINDS.has(kind)) return null;
  return <ReadingLink key={key} url={`https://njump.me/${bech32}`} label={ADDRESS_LABEL[kind] ?? "↗ linked post"} />;
}

export function ReadingText({
  text,
  tokens: given,
  source,
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
  /** The text `tokens` came from — code blocks show it verbatim. */
  source?: string;
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
  // Parsed once per text, not per render: the event page re-renders as its
  // author, trust and reference queries land.
  const plain = useMemo(() => (given ? undefined : text && looksLikeHtml(text) ? htmlToText(text) : text || ""), [given, text]);
  const tokens = useMemo(() => given ?? parseNoteContent(plain ?? ""), [given, plain]);
  const blocks = useMemo(() => toNoteBlocks(tokens, { headline, source: source ?? plain }), [tokens, headline, source, plain]);

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
          <button key={key} type="button" dir="auto" onClick={() => requestNav({ kind: "hashtag", target: t.value, label: t.value })} className="font-medium text-brand-link hover:underline">
            {t.value}
          </button>
        );
      case "mention": {
        const { pubkey, address } = decodeNostrEntity(t.bech32);
        if (pubkey) return <MentionChip key={key} uri={`nostr:${t.bech32}`} />;
        // Only articles, wiki pages and specs have a reader here; any other
        // address (a track, a listing) opens where every client can show it.
        const other = address ? addressLink(t.bech32, key) : null;
        if (other) return other;
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
      if (t.type === "text") return <span key={k}>{renderSpans(parseInlineMarkdown(t.value), k, !renderToken)}</span>;
      return renderToken ? renderToken(t, k) : quiet(t, k);
    });
  const [h1, h2, h3] = HEADING[size];

  return (
    <div className={`note-reading w-full max-w-[68ch] break-words [container-type:inline-size] ${SIZE[size]} ${className}`} data-testid={testId}>
      {blocks.map((b, i) => {
        const k = String(i);
        switch (b.type) {
          case "p":
            return <div key={k} dir="auto" className="whitespace-pre-wrap">{inline(b.tokens, k)}</div>;
          case "h": {
            const Tag = (["h2", "h3", "h4"] as const)[b.level - 1];
            return <Tag key={k} dir="auto" className={`${[h1, h2, h3][b.level - 1]} font-bold leading-snug tracking-tight text-slate-900 dark:text-white`} style={{ fontFamily: "var(--font-display)" }}>{inline(b.tokens, k)}</Tag>;
          }
          case "ul":
          case "ol": {
            const List = b.type;
            return (
              <List key={k} dir="auto" start={b.type === "ol" ? b.start : undefined} className={`${b.type === "ul" ? "list-disc" : "list-decimal"} space-y-1.5 ps-6 marker:text-slate-400 dark:marker:text-slate-500`}>
                {b.items.map((item, j) => <li key={j} className="whitespace-pre-wrap ps-1">{inline(item, `${k}.${j}`)}</li>)}
              </List>
            );
          }
          case "quote":
            return <blockquote key={k} dir="auto" className="whitespace-pre-wrap border-s-[3px] border-slate-300 dark:border-slate-600 ps-4 italic text-slate-600 dark:text-slate-300">{inline(b.tokens, k)}</blockquote>;
          case "code": {
            // Art fits the column: monospace glyphs are ~0.6em wide, so the
            // longest line sets the size (never above the code size, never
            // below 7px — past that it scrolls). Code keeps its size.
            const cols = b.art ? Math.max(...b.text.split("\n").map((l) => l.replace(/\t/g, "    ").length)) : 0;
            const fit = cols ? { fontSize: `clamp(7px, calc((100cqw - 2rem) / ${(cols * 0.6).toFixed(1)}), 0.8em)` } : undefined;
            return <pre key={k} dir="ltr" style={fit} className="overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3 font-mono text-[0.8em] leading-relaxed text-slate-800 dark:text-slate-100"><code>{b.text}</code></pre>;
          }
          case "caption":
            return <p key={k} dir="auto" className="note-caption whitespace-pre-wrap text-[0.8em] leading-snug text-slate-500 dark:text-slate-400">{inline(b.tokens, k)}</p>;
          case "hr":
            return <hr key={k} className="mx-auto w-16 border-slate-200 dark:border-slate-700" />;
        }
      })}
      {after}
    </div>
  );
}
