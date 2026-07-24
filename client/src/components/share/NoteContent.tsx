import { useState } from "react";
import { useLocation } from "wouter";
import { parseNoteContent, extractImageUrls, extractNoteTitle, toPlayableStreamUrl } from "@/lib/noteContent";
import { decodeNostrEntity } from "@/lib/noteRefs";
import { useShareNav } from "@/components/share/ShareNavContext";
import { LinkChip, LinkPreviewCard } from "@/components/share/LinkPreview";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { FeedVideo } from "@/components/share/FeedVideo";
import { LiveVideoPlayer } from "@/components/share/LiveVideoPlayer";
import { WavlakeTrackCard } from "@/components/share/WavlakeTrackCard";
import { wavlakeTrackId } from "@/lib/wavlake";
import { useLightbox } from "@/components/share/Lightbox";

/** Human-readable track name from a raw audio URL. Falls back to "Audio" for
 *  non-descriptive filenames (numeric ids, hashes/uuids) like `…/32939084.mp3`. */
function audioName(url: string): string {
  try {
    const last = (new URL(url).pathname.split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "");
    const decoded = decodeURIComponent(last);
    const bare = decoded.replace(/[\s._-]+/g, "");
    if (!decoded || /^\d+$/.test(bare) || /^[0-9a-f]{16,}$/i.test(bare)) return "Audio";
    return decoded.replace(/[._-]+/g, " ").trim() || "Audio";
  } catch {
    return "Audio";
  }
}

/** Short host label for a media URL (e.g. "podhome.fm"), used as the track's source tag. */
function hostLabel(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * An inline live/HLS stream in a note: our click-to-play HLS player with a LIVE
 * badge. If the stream can't load (dead/geo-blocked), it degrades to a link chip.
 */
function NoteLiveVideo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LinkChip url={url} />;
  return (
    <div className="relative mt-2" data-testid="note-live">
      <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
      </span>
      <LiveVideoPlayer src={toPlayableStreamUrl(url)} onError={() => setFailed(true)} />
    </div>
  );
}

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
  imageOpensThread = false,
  tags = [],
  authorName,
}: {
  content: string;
  compact?: boolean;
  profiles?: Map<string, ProfileLite>;
  /** Render a rich preview card for the primary link below the body. */
  linkCard?: boolean;
  /** In a clickable feed card: render images as cropped thumbnails whose click
   *  bubbles up to open the thread (instead of a lightbox). */
  imageOpensThread?: boolean;
  /** The event's tags — used to enrich the audio player (artwork + title). */
  tags?: string[][];
  /** The note author's display name — shown as the audio player's "artist". */
  authorName?: string;
}) {
  const tokens = parseNoteContent(content);
  // Shared metadata for a rich audio/podcast player: the note's own image as
  // artwork and its title/first-line as the track name (falling back per-URL).
  const audioCover = extractImageUrls(content, tags)[0];
  const audioTitle = extractNoteTitle(content, tags);
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
    <div className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
      {tokens.map((token, i) => {
        switch (token.type) {
          case "text":
            return <span key={i}>{token.value}</span>;
          case "url":
            if (wavlakeTrackId(token.value)) return <WavlakeTrackCard key={i} url={token.value} />;
            return <LinkChip key={i} url={token.value} />;
          case "audio":
            return (
              <div key={i} className="mt-2">
                <EmbeddedTrackCard
                  id={`audio:${token.value}`}
                  title={audioTitle || audioName(token.value)}
                  artist={authorName}
                  cover={audioCover}
                  audio={token.value}
                  sourceLabel={hostLabel(token.value)}
                />
              </div>
            );
          case "image":
            return imageOpensThread ? (
              // Clickable feed card: a tidy cropped thumbnail; the click bubbles
              // up to the card and opens the thread (full image + zoom live there).
              <img
                key={i}
                src={token.value}
                alt=""
                loading="lazy"
                className="mt-2 w-full max-h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 object-cover"
              />
            ) : (
              <img
                key={i}
                src={token.value}
                alt=""
                loading="lazy"
                data-noopen
                onClick={(e) => { e.stopPropagation(); openLightbox(imageUrls, Math.max(0, imageUrls.indexOf(token.value))); }}
                className={`mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 object-contain w-full cursor-zoom-in ${compact ? "max-h-[28rem]" : "max-h-[34rem]"}`}
              />
            );
          case "video":
            return <FeedVideo key={i} src={token.value} />;
          case "live":
            return <NoteLiveVideo key={i} url={token.value} />;
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
      {primaryUrl && linkCard && !wavlakeTrackId(primaryUrl) && <LinkPreviewCard url={primaryUrl} />}
    </div>
  );
}
