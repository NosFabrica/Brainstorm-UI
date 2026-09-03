/**
 * Inline rendering for short prose that arrives as raw text — release notes,
 * trust reviews: URLs become link chips (GitHub PR/issue URLs compress to #N
 * chips), nostr: mentions become the person, @handles are acknowledged in
 * weight, and light **bold** is honoured. Born in the app page's "What's new";
 * shared so every body of network prose reads the same.
 */
import { MentionChip } from "@/components/share/MentionChip";
import { Favicon, LinkChip } from "@/components/share/LinkPreview";

const NOTES_TOKEN_RE =
  /(https?:\/\/\S+|nostr:n(?:pub|profile)1[02-9ac-hj-np-z]+|@[A-Za-z0-9_[\]./-]+)/gi;
const GH_REF_RE = /github\.com\/[^/\s]+\/[^/\s]+\/(?:pull|issues)\/(\d+)/;

function PrChip({ url, n }: { url: string; n: string }) {
  let host = "github.com";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep default */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 align-middle rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 no-underline hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
    >
      <Favicon host={host} className="h-3 w-3 shrink-0" />
      #{n}
    </a>
  );
}

export function NotesInline({ text }: { text: string }) {
  const parts = text.split(NOTES_TOKEN_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^nostr:/i.test(part)) return <MentionChip key={i} uri={part} />;
        if (/^https?:\/\//i.test(part)) {
          const gh = part.match(GH_REF_RE);
          if (gh) return <PrChip key={i} url={part} n={gh[1]} />;
          return <LinkChip key={i} url={part} />;
        }
        if (part.startsWith("@")) {
          return (
            <span key={i} className="font-medium text-slate-800 dark:text-slate-100">
              {part}
            </span>
          );
        }
        // Light **bold** support — GitHub changelogs close with **Full Changelog**.
        const bold = part.split(/\*\*([^*]+)\*\*/g);
        return bold.map((seg, j) =>
          j % 2 === 1 ? (
            <strong key={`${i}-${j}`} className="font-semibold">
              {seg}
            </strong>
          ) : (
            <span key={`${i}-${j}`}>{seg}</span>
          ),
        );
      })}
    </>
  );
}
