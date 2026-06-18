import { parseNoteContent } from "@/lib/noteContent";
import { decodeNostrEntity } from "@/lib/noteRefs";
import { useShareNav } from "@/components/share/ShareNavContext";

type ProfileLite = { name?: string; display_name?: string; picture?: string };

/**
 * Renders parsed kind-1 note content: text, links, inline images/video,
 * `nostr:` mentions (resolved to @DisplayName when a profile map is provided),
 * and hashtags. Event references (nevent/note) render as a subtle marker since
 * the quoted note itself is shown as an embedded card by the caller.
 */
export function NoteContent({
  content,
  compact = false,
  profiles,
}: {
  content: string;
  compact?: boolean;
  profiles?: Map<string, ProfileLite>;
}) {
  const tokens = parseNoteContent(content);
  const requestNav = useShareNav();
  return (
    <div className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
      {tokens.map((token, i) => {
        switch (token.type) {
          case "text":
            return <span key={i}>{token.value}</span>;
          case "url":
            return (
              <a key={i} href={token.value} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2 decoration-indigo-300 break-all">
                {token.value.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            );
          case "image":
            return (
              <img
                key={i}
                src={token.value}
                alt=""
                loading="lazy"
                className={`mt-2 rounded-xl border border-slate-200 object-cover w-full ${compact ? "max-h-48" : "max-h-80"}`}
              />
            );
          case "video":
            return (
              <video key={i} src={token.value} controls preload="metadata" className={`mt-2 rounded-xl border border-slate-200 w-full ${compact ? "max-h-48" : "max-h-80"}`} />
            );
          case "mention": {
            const { pubkey, id } = decodeNostrEntity(token.bech32);
            if (pubkey) {
              const prof = profiles?.get(pubkey);
              const name = prof?.display_name || prof?.name;
              const label = name ? `@${name}` : `@${token.bech32.slice(0, 10)}…`;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => requestNav({ kind: "profile", target: token.bech32, label: name || token.bech32.slice(0, 12) + "…" })}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  {label}
                </button>
              );
            }
            if (id) {
              // The quoted note is rendered as an embedded card below the body.
              return <span key={i} className="text-indigo-400 font-medium">↳ quoted note</span>;
            }
            return <span key={i} className="text-indigo-500 font-medium">@{token.bech32.slice(0, 10)}…</span>;
          }
          case "hashtag":
            return (
              <button
                key={i}
                type="button"
                onClick={() => requestNav({ kind: "hashtag", target: token.value, label: token.value })}
                className="text-indigo-500 font-medium hover:underline"
              >
                {token.value}
              </button>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
