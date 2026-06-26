import { useLocation } from "wouter";
import { parseNoteContent } from "@/lib/noteContent";
import { decodeNostrEntity } from "@/lib/noteRefs";
import { useShareNav } from "@/components/share/ShareNavContext";
import { LinkChip, LinkPreviewCard } from "@/components/share/LinkPreview";
import { useLightbox } from "@/components/share/Lightbox";

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
  linkCard = false,
}: {
  content: string;
  compact?: boolean;
  profiles?: Map<string, ProfileLite>;
  /** Render a rich preview card for the primary link below the body. */
  linkCard?: boolean;
}) {
  const tokens = parseNoteContent(content);
  const requestNav = useShareNav();
  const openLightbox = useLightbox();
  const [, navigate] = useLocation();
  // The note's primary link gets a rich preview card below the body (not in
  // compact/embedded contexts). Inline URLs stay as compact favicon chips.
  const urlTokens = tokens.filter((t) => t.type === "url") as { value: string }[];
  const primaryUrl = urlTokens.length ? urlTokens[urlTokens.length - 1].value : null;
  // All image URLs in this note — the set the lightbox carousels through.
  const imageUrls = tokens.filter((t) => t.type === "image").map((t) => (t as { value: string }).value);
  return (
    <div className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
      {tokens.map((token, i) => {
        switch (token.type) {
          case "text":
            return <span key={i}>{token.value}</span>;
          case "url":
            return <LinkChip key={i} url={token.value} />;
          case "image":
            return (
              <img
                key={i}
                src={token.value}
                alt=""
                loading="lazy"
                data-noopen
                onClick={(e) => { e.stopPropagation(); openLightbox(imageUrls, Math.max(0, imageUrls.indexOf(token.value))); }}
                className={`mt-2 rounded-xl border border-slate-200 bg-slate-50 object-contain w-full cursor-zoom-in ${compact ? "max-h-[28rem]" : "max-h-[34rem]"}`}
              />
            );
          case "video":
            return (
              <video key={i} src={token.value} controls preload="metadata" className={`mt-2 rounded-xl border border-slate-200 bg-black object-contain w-full ${compact ? "max-h-[28rem]" : "max-h-[34rem]"}`} />
            );
          case "mention": {
            const { pubkey, id, address } = decodeNostrEntity(token.bech32);
            if (address) {
              // Links to the on-site article page; also embedded as a card below.
              return (
                <button key={i} type="button" onClick={() => navigate(`/a/${token.bech32}`)} className="text-indigo-500 font-medium hover:underline">
                  📄 article
                </button>
              );
            }
            if (pubkey) {
              const prof = profiles?.get(pubkey);
              const name = prof?.display_name || prof?.name;
              const label = name ? `@${name}` : `@${token.bech32.slice(0, 10)}…`;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => requestNav({ kind: "profile", target: token.bech32, label: name || token.bech32.slice(0, 12) + "…", picture: prof?.picture })}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  {label}
                </button>
              );
            }
            if (id) {
              // Links to the on-site event page; also embedded as a card below.
              return (
                <button key={i} type="button" onClick={() => navigate(`/e/${token.bech32}`)} className="text-indigo-500 font-medium hover:underline">
                  ↳ quoted note
                </button>
              );
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
      {primaryUrl && linkCard && <LinkPreviewCard url={primaryUrl} />}
    </div>
  );
}
