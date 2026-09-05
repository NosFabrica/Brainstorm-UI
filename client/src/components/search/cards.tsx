import { parseTrack } from "@/lib/trackEvent";
import { formatListingPrice, parseListing } from "@/lib/listing";
import type { WavlakeSong } from "@/lib/wavlake";
import { useEffect, useState } from "react";
/**
 * Typed result cards for the verticals with no existing precedent —
 * media, code & git, live events, lists. Each is a compact, self-contained
 * card: author row, the thing itself, and a whole-card link to the in-app
 * event page (/e/:id — NoteContent renders video/audio/HLS there), with an
 * "Open in…" external link for the full native experience. Design-system
 * primitives per CLAUDE.md: Chip for status/counts, shared tier ring.
 */
import { Link, useLocation } from "wouter";
import { Bot, Code2, ExternalLink, File, FileAudio, FileVideo, ListChecks, MapPin, MessageSquare, Package, Radio, ShoppingBag } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Chip } from "@/components/ui/chip";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { brandForHost } from "@/lib/brands";
import { profileHrefOf } from "@/lib/upNext";
import { GIT_STATE_LABEL, GIT_STATE_TONE, gitAgentOf, gitItemLabel, gitLabelsOf, type GitState } from "@/lib/gitStatus";
import { ago } from "@/lib/ago";
import { gitItemSummaryOf, gitItemTitleOf } from "@/lib/gitPatch";
import { fetchRepoCounts, zapStoreUrl } from "@/services/search";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { FeedVideo } from "@/components/share/FeedVideo";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { MentionChip } from "@/components/share/MentionChip";
import { Favicon } from "@/components/share/LinkPreview";
import { formatEventDate, isOver, parseCalendarEvent, relativeEventTime, formatEventTime } from "@/lib/calendarEvent";
import { liveCategoryOf, liveHostOf, onAirLabel, parseLiveStream, type LiveState } from "@/lib/liveStream";
import { RsvpButton } from "@/components/share/RsvpButton";
import { EventDateTile } from "@/components/share/EventDateTile";

export function tagVal(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

/** How real-time a card is: seconds → minutes → hours → days, then a
 *  plain date once "N days ago" stops meaning anything (~a month). */
function fmtWhen(created_at: number): string {
  try {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - created_at);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return new Date(created_at * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function AuthorRow({
  author,
  score,
  created_at,
}: {
  author: SearchResult | null;
  score?: number | null;
  created_at: number;
}) {
  const tierRing = useTierRing();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className={`h-6 w-6 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}>
        {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
        {author ? getDisplayLabel(author) : "Unknown"}
      </span>
      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{fmtWhen(created_at)}</span>
    </div>
  );
}

/** The enterprise footer both people-facing cards close on: a hairline,
 *  a kicker, a small ringed face + name, and the date at the far right. */
function CuratorFooter({
  kicker,
  author,
  score,
  created_at,
}: {
  kicker: string;
  author: SearchResult | null;
  score?: number | null;
  created_at: number;
}) {
  const tierRing = useTierRing();
  return (
    <div className="flex w-full items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/60 pt-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-medium uppercase leading-none tracking-wide text-slate-400 dark:text-slate-500">
          {kicker}
        </span>
        <Avatar className={`h-5 w-5 shrink-0 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null, false, "sm", true) ?? ""}`}>
          {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-xs font-medium leading-none text-slate-600 dark:text-slate-300">
          {author ? getDisplayLabel(author) : "Unknown"}
        </span>
      </span>
      <span className="shrink-0 text-[11px] leading-none text-slate-400 dark:text-slate-500">{fmtWhen(created_at)}</span>
    </div>
  );
}

function CardShell({
  event,
  children,
  openInUrl,
  openInLabel,
  openInHost,
  openInTestId,
  openInPlacement = "corner",
  openInSlotTestId,
  fill = false,
  corner,
  testId,
}: {
  event: NostrEvent;
  children: React.ReactNode;
  openInUrl?: string;
  openInLabel?: string;
  /** When set, the link wears the destination's favicon (GitHub, gitworkshop…)
   *  instead of the generic external-link glyph — the affiliated look. */
  openInHost?: string;
  openInTestId?: string;
  /** Where the external link sits: the top corner (default) or the footer's
   *  right end, app-store style. Either way it lives OUTSIDE the card's own
   *  link — never an anchor inside an anchor — so the card body leaves it room. */
  /** `corner-icon`: the favicon alone in a small pill, for cards whose corner
   *  sits over a photo — the label becomes the hover title. */
  openInPlacement?: "corner" | "footer" | "corner-icon";
  openInSlotTestId?: string;
  /** Fill the grid cell so a row of cards shares one height. */
  fill?: boolean;
  /** A control for the top corner that isn't a link out (the RSVP button).
   *  Lives outside the card's own link like openIn does. */
  corner?: React.ReactNode;
  testId?: string;
}) {
  const footer = openInPlacement === "footer";
  const iconOnly = openInPlacement === "corner-icon";
  return (
    <div
      className={`relative w-full rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all duration-150 ${fill ? "h-full" : ""}`}
      data-testid={testId}
    >
      <Link href={eventPath(event)} className={`block p-3 sm:p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-xl ${fill ? "h-full" : ""}`}>
        {children}
      </Link>
      {corner && <span className="absolute right-2.5 top-2.5" data-testid="card-corner">{corner}</span>}
      {openInUrl && (
        <span className={footer ? "absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3" : "absolute right-2.5 top-2.5"} data-testid={openInSlotTestId}>
          <a
            href={openInUrl}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            title={iconOnly ? openInLabel ?? "Open in…" : undefined}
            aria-label={iconOnly ? openInLabel ?? "Open in…" : undefined}
            className={
              footer
                ? "inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-brand-deep dark:text-brand-link hover:border-brand-accent/40 hover:bg-brand-primary/5 transition-colors"
                : iconOnly
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-white/90 dark:bg-slate-900/90 shadow-sm ring-1 ring-black/5 dark:ring-white/10 hover:bg-white dark:hover:bg-slate-900 transition-colors"
                  : "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-brand-link hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            }
            data-testid={openInTestId}
          >
            {openInHost ? <Favicon host={openInHost} className={iconOnly ? "h-3.5 w-3.5 shrink-0 rounded-sm" : "h-3 w-3 shrink-0 rounded-sm"} /> : <ExternalLink className={iconOnly ? "h-3 w-3 text-slate-500" : "h-2.5 w-2.5"} />}
            {!iconOnly && <> {openInLabel ?? "Open in…"}</>}
          </a>
        </span>
      )}
    </div>
  );
}

function naddrOf(event: NostrEvent): string | null {
  const d = tagVal(event, "d");
  if (d === undefined) return null;
  try {
    return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
  } catch {
    return null;
  }
}

/** First usable image/video URL: imeta `url …`, a url tag, or a bare URL in content. */
export function mediaUrlOf(event: NostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const urlPart = tag.slice(1).find((p) => p.startsWith("url "));
      if (urlPart) return urlPart.slice(4).trim();
    }
  }
  const url = tagVal(event, "url") ?? tagVal(event, "thumb") ?? tagVal(event, "image");
  if (url) return url;
  const inContent = event.content.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|mp4|webm|mov)\b\S*/i);
  return inContent ? inContent[0] : null;
}

/** The poster IMAGE for a media event — imeta's image/thumb parts (NIP-71
 *  publishes video previews there) or plain thumb/image tags. Null means
 *  "no still exists"; the card then pulls a first frame from the video. */
export function mediaPosterOf(event: NostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      for (const key of ["image ", "thumb "]) {
        const part = tag.slice(1).find((p) => p.startsWith(key));
        if (part) return part.slice(key.length).trim();
      }
    }
  }
  return tagVal(event, "thumb") ?? tagVal(event, "image") ?? null;
}

/** Video by declared mime first (imeta "m video/…"), extension second. */
export function isVideoUrl(event: NostrEvent, url: string): boolean {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const mime = tag.slice(1).find((p) => p.startsWith("m "));
      if (mime) return mime.slice(2).trim().startsWith("video/");
    }
  }
  const m = tagVal(event, "m");
  if (m) return m.startsWith("video/");
  return /\.(?:mp4|webm|mov|m3u8)(?:\?|#|$)/i.test(url);
}

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;

export function MediaCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const [, navigate] = useLocation();
  const url = mediaUrlOf(event);
  const poster = mediaPosterOf(event);
  const mime = (() => {
    for (const tag of event.tags) {
      if (tag[0] === "imeta") {
        const m = tag.slice(1).find((p) => p.startsWith("m "));
        if (m) return m.slice(2).trim();
      }
    }
    return tagVal(event, "m") ?? "";
  })();
  const isImage = !!url && (mime.startsWith("image/") || IMAGE_RE.test(url));
  const isAudio =
    !!url && (mime.startsWith("audio/") || event.kind === 1222 || /\.(?:mp3|m4a|ogg|wav|flac|aac|opus)(?:\?|#|$)/i.test(url));
  const isVideo = !!url && !isImage && !isAudio && isVideoUrl(event, url);
  // The caption is the words, never the URL — the media itself is the link.
  // nostr: mentions stay IN and render as the person below.
  const caption = (tagVal(event, "title") ?? event.content ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\S\n]+/g, " ")
    .trim()
    .slice(0, 300);
  const host = (() => {
    try {
      return url ? new URL(url).hostname.replace(/^www\./, "") : null;
    } catch {
      return null;
    }
  })();
  const brand = brandForHost(host);
  const open = () => navigate(eventPath(event));
  return (
    // A div-with-navigate, not an <a>: the media inside is INTERACTIVE
    // (click-to-play video, the audio player) and those clicks must not
    // yank the user to the thread mid-play.
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, video, [data-noopen]")) return;
        open();
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      className="relative w-full cursor-pointer rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all duration-150 p-3 sm:p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid={`media-card-${event.id}`}
    >
      <AuthorRow author={author} score={score} created_at={event.created_at} />
      {caption && (
        <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200 break-words line-clamp-2">
          {caption.split(/(nostr:n(?:pub|profile)1[02-9ac-hj-np-z]+)/gi).map((part, i) =>
            /^nostr:/i.test(part) ? <MentionChip key={i} uri={part} /> : <span key={i}>{part}</span>,
          )}
        </p>
      )}
      {isVideo && url ? (
        <FeedVideo src={url} poster={poster ?? undefined} />
      ) : isAudio && url ? (
        <div className="mt-2" data-noopen>
          <EmbeddedTrackCard
            id={`search:${event.id}`}
            title={caption || "Audio"}
            artist={author ? getDisplayLabel(author) : undefined}
            cover={poster ?? undefined}
            audio={url}
            sourceLabel={brand?.name}
          />
        </div>
      ) : (isImage || poster) && url ? (
        <img
          src={isImage ? url : (poster as string)}
          alt=""
          loading="lazy"
          className="mt-2 w-full max-h-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 object-cover"
          data-testid={`media-thumb-${event.id}`}
        />
      ) : (
        <div className="mt-2 flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          {(() => {
            const Icon = mime.startsWith("audio/") ? FileAudio : mime && !mime.startsWith("video/") ? File : FileVideo;
            return <Icon className="h-6 w-6 text-slate-400 dark:text-slate-500" />;
          })()}
        </div>
      )}
      {/* The byline exists only for a brand people recognise — a CDN hostname
          tells a reader nothing, and the picture speaks for itself. */}
      {brand && !isAudio && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          via{" "}
          {/* The partner's own mark, with its x-height of clear space. */}
          <span className="inline-flex items-center px-1 py-0.5">
            <brand.Wordmark />
          </span>
        </p>
      )}
    </div>
  );
}

/** "android-arm64-v8a" and friends → one human word each, deduped. */
export function platformWords(event: NostrEvent): string[] {
  const words = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== "f" || !tag[1]) continue;
    const f = tag[1].toLowerCase();
    if (f.startsWith("android")) words.add("Android");
    else if (f.startsWith("ios")) words.add("iOS");
    else if (f.includes("darwin") || f.includes("mac")) words.add("macOS");
    else if (f.includes("windows")) words.add("Windows");
    else if (f.includes("linux")) words.add("Linux");
    else if (f.includes("web")) words.add("Web");
  }
  return [...words];
}

/**
 * A Zap Store listing (kind 32267) as a real app-store card: the app's own
 * icon, name, summary, platforms, license — and "Get it" out to the app's
 * site (falling back to its repository). Vitor's split, the
 * Apps half: listings stop masquerading as "code".
 */
export function AppCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const name = tagVal(event, "name") ?? tagVal(event, "d") ?? "Untitled app";
  const summary = tagVal(event, "summary") ?? event.content.slice(0, 200);
  const icon = tagVal(event, "icon") ?? tagVal(event, "image");
  const license = tagVal(event, "license");
  const platforms = platformWords(event);
  // Where you actually GET it: the app's Zap Store page (signature-verified
  // installs), falling back to the site / repo only for listings without one.
  const getIt = zapStoreUrl(event) ?? tagVal(event, "url") ?? tagVal(event, "repository");
  return (
    <CardShell
      event={event}
      openInUrl={getIt}
      openInLabel="Get it"
      openInHost={getIt ? hostOf(getIt) ?? undefined : undefined}
      openInTestId={`app-get-${event.id}`}
      openInPlacement="footer"
      openInSlotTestId={`app-get-slot-${event.id}`}
      fill
      testId={`app-card-${event.id}`}
    >
      {/* One shape for every card, app-store style: text on the left, the
          app's icon in the top-right corner, a two-line summary slot that is
          reserved even when the summary is short, one line of chips, and a
          footer pushed to the bottom — so a grid row lines up edge to edge. */}
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
            <p
              className="mt-0.5 min-h-[2rem] text-xs leading-4 text-slate-500 dark:text-slate-400 break-words line-clamp-2"
              data-testid={`app-summary-${event.id}`}
            >
              {summary}
            </p>
          </div>
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10">
            {icon ? (
              <img src={icon} alt="" loading="lazy" className="h-full w-full object-cover" data-testid={`app-icon-${event.id}`} />
            ) : (
              <Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            )}
          </div>
        </div>
        <div className="mt-2 flex h-5 items-center gap-1.5 overflow-hidden">
          {platforms.map((p) => (
            <Chip key={p} size="sm" tone="slate">{p}</Chip>
          ))}
          {license && <Chip size="sm" tone="slate">{license}</Chip>}
        </div>
        {/* Get it sits in the footer's corner (66px wide with its favicon) —
            the footer leaves it that room plus a gap, so the timestamp never
            touches it. Live at 375px, pr-16 left them flush. */}
        <div className={`mt-auto pt-2.5 ${getIt ? "pr-20" : ""}`}>
          <CuratorFooter kicker="Published by" author={author} score={score} created_at={event.created_at} />
        </div>
      </div>
    </CardShell>
  );
}

/** Git hosts people recognize by name; anything else shows as its hostname. */
const FORGE_LABELS: Record<string, string> = {
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "codeberg.org": "Codeberg",
  "bitbucket.org": "Bitbucket",
  "gitworkshop.dev": "gitworkshop",
  "git.iris.to": "iris",
};
/** Clone URLs on these hosts double as browsable repo pages. */
const BROWSABLE_FORGES = new Set(["github.com", "gitlab.com", "codeberg.org", "bitbucket.org"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A host as a card label: known forges by name; npub-subdomain hosts
 *  (npub1….nsite.lol, npub1….pages.gittr.space) collapse to the site people
 *  would recognize; anything still long gets bounded so it can't swamp the
 *  corner. */
function hostLabel(host: string): string {
  if (FORGE_LABELS[host]) return FORGE_LABELS[host];
  const trimmed = host
    .split(".")
    .filter((seg) => !seg.startsWith("npub1"))
    .join(".");
  return trimmed.length > 22 ? `${trimmed.slice(0, 21)}…` : trimmed;
}

/**
 * Where a repo-tab card's external link goes, and whose brand it wears.
 * Repo announcements: their `web` page → a browsable forge clone URL → the
 * repo on gitworkshop (every 30617 is addressable, so this always exists).
 * Patches/issues aren't addressable and rarely carry a web link, but their
 * a-tag names the parent repo — so they connect to it on gitworkshop.
 */
export function repoDestination(event: NostrEvent): { url: string; host: string; label: string } | null {
  const branded = (url: string, host: string) => ({ url, host, label: hostLabel(host) });
  const gitworkshop = (naddr: string) => branded(`https://gitworkshop.dev/${naddr}`, "gitworkshop.dev");
  if (event.kind === 30617) {
    const web = tagVal(event, "web");
    const webHost = web ? hostOf(web) : null;
    if (web && webHost) return branded(web, webHost);
    for (const t of event.tags) {
      if (t[0] !== "clone" || !t[1]) continue;
      const h = hostOf(t[1]);
      if (h && BROWSABLE_FORGES.has(h)) return branded(t[1].replace(/\.git$/, ""), h);
    }
    const naddr = naddrOf(event);
    return naddr ? gitworkshop(naddr) : null;
  }
  const a = tagVal(event, "a");
  if (!a) return null;
  const [kind, pubkey, ...rest] = a.split(":");
  if (kind !== "30617" || !pubkey) return null;
  try {
    return gitworkshop(nip19.naddrEncode({ kind: 30617, pubkey, identifier: rest.join(":") }));
  } catch {
    return null;
  }
}

type MemberProfile = { name?: string; display_name?: string; picture?: string };

export function RepoCard({
  event,
  author,
  score,
  state,
  comments,
  forkOf,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  state?: GitState;
  /** Comments on this issue or patch, when the page fetched them. */
  comments?: number;
  /** For a fork shown under its original: the original's name. */
  forkOf?: string;
}) {
  // The Repos tab is a mix: 30617 repo announcements, plus patches (1617) and
  // issues (1621/1618) that target a repo. A type chip tells them apart, and
  // a patch/issue names the repo it belongs to (from its a-tag) — the context
  // that makes a lone "fix: …" card mean something.
  const isRepo = event.kind === 30617;
  const typeLabel = isRepo ? "Repo" : gitItemLabel(event.kind);
  const typeTone: "info" | "success" | "warning" = event.kind === 1617 || event.kind === 1618 ? "info" : isRepo ? "success" : "warning";
  // A repo is named by its announcement; an issue, patch or PR by the one
  // title rule — a patch without a subject tag is titled from its own text.
  const name = isRepo ? tagVal(event, "name") ?? tagVal(event, "d") ?? "Unnamed repo" : gitItemTitleOf(event);
  const description = isRepo ? tagVal(event, "description") ?? "" : gitItemSummaryOf(event);
  const repoRef = !isRepo ? tagVal(event, "a")?.split(":")[2] : undefined;
  // How the maintainer triaged it — up to three labels; the strip has the rest.
  const labels = isRepo ? [] : gitLabelsOf(event);
  const agent = isRepo ? null : gitAgentOf(event, author);
  const dest = repoDestination(event);
  // The "is anyone working on this?" signal — issue/patch counts for the repo
  // (announcements only; a lone patch/issue has none of its own).
  const d = tagVal(event, "d");
  const [counts, setCounts] = useState<{ issues: number; patches: number; contributors: string[]; lastAt: number | null }>({ issues: 0, patches: 0, contributors: [], lastAt: null });
  useEffect(() => {
    if (!isRepo || !d) return;
    let alive = true;
    void fetchRepoCounts(`30617:${event.pubkey}:${d}`).then((c) => {
      if (alive) setCounts({ issues: c.issues, patches: c.patches, contributors: c.contributors ?? [], lastAt: c.lastAt ?? null });
    });
    return () => {
      alive = false;
    };
  }, [isRepo, d, event.pubkey]);
  // Who stands behind it: up to three contributors, ringed by trust, and
  // their names when a profile is at hand.
  const faces = counts.contributors.slice(0, 3);
  const faceScoreOf = useAuthorScores(faces);
  const faceRing = useTierRing();
  const [faceProfiles, setFaceProfiles] = useState<Map<string, MemberProfile>>(new Map());
  useEffect(() => {
    if (faces.length === 0) return;
    let alive = true;
    void fetchProfileMap(faces).then((res) => {
      if (!alive || res.size === 0) return;
      setFaceProfiles(new Map([...res].map(([pk, c]) => [pk, c as MemberProfile])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces.join(",")]);
  return (
    // Identity flush left, the code glyph balancing the top-right corner —
    // the App/List/Repo-page anatomy, now on the card too.
    <CardShell
      event={event}
      openInUrl={dest?.url}
      openInLabel={dest?.label}
      openInHost={dest?.host}
      openInTestId={`repo-open-${event.id}`}
      testId={`repo-card-${event.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* The branded link sits absolutely in the corner — the title row
              leaves it room so a long title's type chip never slides under it. */}
          <div className={`flex items-center gap-2 min-w-0 ${dest ? (dest.label.length > 12 ? "pr-36" : "pr-24") : ""}`}>
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
            <Chip size="sm" tone={typeTone}>{typeLabel}</Chip>
          </div>
          {isRepo && forkOf && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500" data-testid={`repo-fork-of-${event.id}`}>
              ↳ fork of {forkOf}
            </p>
          )}
          {/* The item's line: which repo, what became of it (the newest NIP-34
              status; none means open), and who filed it when that was an agent.
              Below the title so the title keeps its room. */}
          {!isRepo && (repoRef || state || agent) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              {repoRef && <span className="truncate">↳ in {repoRef}</span>}
              {state && (
                <Chip size="sm" tone={GIT_STATE_TONE[state]} data-testid={`git-state-${event.id}`}>
                  {GIT_STATE_LABEL[state]}
                </Chip>
              )}
              {agent && (
                <Chip size="sm" tone="slate" icon={Bot} title={`Filed by ${agent}, an agent`} data-testid={`git-agent-${event.id}`}>
                  agent
                </Chip>
              )}
            </div>
          )}
          {labels.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1" data-testid={`git-labels-${event.id}`}>
              {labels.slice(0, 3).map((l) => (
                <Chip key={l} size="sm" tone="slate">{l}</Chip>
              ))}
            </div>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{description}</p>
          )}
          {!isRepo && (comments ?? 0) > 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400" data-testid={`git-comments-${event.id}`}>
              <MessageSquare className="h-3 w-3" /> {comments} {comments === 1 ? "comment" : "comments"}
            </p>
          )}
          {isRepo && (counts.issues > 0 || counts.patches > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid={`repo-counts-${event.id}`}>
              {counts.issues > 0 && (
                <Chip size="sm" tone="warning">{counts.issues} {counts.issues === 1 ? "issue" : "issues"}</Chip>
              )}
              {counts.patches > 0 && (
                <Chip size="sm" tone="info">{counts.patches} {counts.patches === 1 ? "patch" : "patches"}</Chip>
              )}
            </div>
          )}
          {isRepo && (counts.contributors.length > 0 || counts.lastAt) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              {counts.contributors.length > 0 && (
                <span className="inline-flex items-center gap-1.5" data-testid={`repo-contributors-${event.id}`}>
                  <span className="flex -space-x-1.5">
                    {faces.map((pk) => {
                      const profile = faceProfiles.get(pk);
                      return (
                        <Avatar
                          key={pk}
                          title={profile?.display_name || profile?.name || undefined}
                          className={`h-5 w-5 border border-white dark:border-slate-900 ${faceRing(faceScoreOf(pk) ?? null, false, "sm", true) ?? ""}`}
                          data-testid={`repo-contributor-face-${pk}`}
                        >
                          {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
                          <AvatarFallback className="overflow-hidden">
                            <DefaultAvatarImg />
                          </AvatarFallback>
                        </Avatar>
                      );
                    })}
                  </span>
                  {counts.contributors.length} {counts.contributors.length === 1 ? "contributor" : "contributors"}
                </span>
              )}
              {counts.lastAt && (
                <span data-testid={`repo-active-${event.id}`}>active {ago(counts.lastAt)}</span>
              )}
            </div>
          )}
          <div className="mt-2">
            <CuratorFooter kicker={isRepo ? "Maintained by" : "By"} author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
        {/* CardShell parks the external "Open repo" link absolutely in this
            corner (it must live outside the card's own link — nested anchors
            are invalid). The glyph is decorative, the type chip already names
            the kind — so it only takes the corner when nothing else does. */}
        {!dest && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800" data-testid={`repo-glyph-${event.id}`}>
            <Code2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
        )}
      </div>
    </CardShell>
  );
}

const LIVE_TONES: Record<string, "success" | "neutral" | "info"> = {
  live: "success",
  ended: "neutral",
  planned: "info",
};

export function LiveCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const title = tagVal(event, "title") ?? tagVal(event, "name") ?? "Live event";
  const status = (tagVal(event, "status") ?? "").toLowerCase();
  const summary = tagVal(event, "summary") ?? "";
  const image = tagVal(event, "image");
  const naddr = naddrOf(event);
  const openIn = event.kind === 30311 && naddr ? `https://zap.stream/${naddr}` : undefined;
  return (
    <CardShell event={event} openInUrl={openIn} openInLabel="Watch" testId={`live-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {image ? (
            <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Radio className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {/* The Watch link sits in the corner — the title row leaves it room
              so a long title and the live chip never run beneath it. */}
          <div className={`flex items-center gap-2 min-w-0 ${openIn ? "pr-14" : ""}`}>
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            {status && (
              <Chip size="sm" tone={LIVE_TONES[status] ?? "neutral"} dot={status === "live"} data-testid={`live-status-${event.id}`}>
                {status}
              </Chip>
            )}
          </div>
          {summary && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{summary}</p>
          )}
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

/**
 * A stream the way YouTube and Twitch show one: the thumbnail IS the card. A
 * 16:9 poster wearing its state — a red LIVE pill with the viewer count, or
 * Upcoming, or Replay — and how long it has been on; the title below; then
 * the channel: the streamer the `p host` tag names (platforms publish for
 * their streamers, so the author is usually zap.stream), with one quiet
 * category. The tile opens our stream page, which plays it in place; the
 * corner keeps the way out to zap.stream.
 */
export function LiveTile({ event, author, score, state, hostScore }: { event: NostrEvent; author: SearchResult | null; score?: number | null; state: LiveState; hostScore?: number | null }) {
  const stream = parseLiveStream(event);
  const title = tagVal(event, "title") ?? tagVal(event, "name") ?? stream?.title ?? "Live";
  const image = tagVal(event, "image") ?? undefined;
  // Barnoldswick's "image" was the venue's web page: when a poster fails to
  // load it gives way, and the channel's own art stands in.
  const [posterBroken, setPosterBroken] = useState(false);
  const viewers = stream?.viewers;
  const starts = Number(tagVal(event, "starts")) || 0;
  const hostPk = liveHostOf(event);
  const hostIsAuthor = !hostPk || hostPk === event.pubkey;
  const faces = useFaceProfiles(hostIsAuthor ? [] : [hostPk as string]);
  const hostProfile = hostIsAuthor ? undefined : faces.get(hostPk as string);
  const channelName = hostProfile ? hostProfile.display_name || hostProfile.name || "" : author ? getDisplayLabel(author) : "";
  const channelPicture = hostProfile ? hostProfile.picture : author?.picture;
  const tierRing = useTierRing();
  const ring = tierRing(hostIsAuthor ? score : hostScore, false, "sm", true) ?? "";
  const category = liveCategoryOf(event);
  const onAir = state === "live" ? onAirLabel(starts) : null;
  const naddr = naddrOf(event);
  const openIn = event.kind === 30311 && naddr ? `https://zap.stream/${naddr}` : undefined;
  // Bespoke overlays, not Chips: pills over a picture need their own contrast.
  const pill =
    state === "live"
      ? "bg-red-600 text-white"
      : state === "upcoming"
        ? "bg-white/90 text-slate-900 dark:bg-slate-900/90 dark:text-slate-100"
        : "bg-black/70 text-white";
  return (
    <div className="group relative min-w-0" data-testid={`live-tile-${event.id}`}>
      <Link href={eventPath(event)} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          {image && !posterBroken ? (
            <img src={image} alt="" loading="lazy" onError={() => setPosterBroken(true)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : channelPicture ? (
            <div className="relative h-full w-full" data-testid={`live-art-${event.id}`}>
              <img src={channelPicture} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl opacity-60" />
              <span className="absolute inset-0 bg-slate-900/30" aria-hidden="true" />
              <img src={channelPicture} alt="" className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover ring-2 ring-white/80" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900" data-testid={`live-art-${event.id}`}>
              <Radio className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
          )}
          <span
            className={`absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow-sm ${pill}`}
            data-testid={`live-status-${event.id}`}
          >
            {state === "live" && <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />}
            {state === "live" ? <span className="tracking-wide">LIVE</span> : state === "upcoming" ? "Upcoming" : "Replay"}
            {state === "live" && viewers != null && viewers > 0 && (
              <span className="font-medium tabular-nums opacity-90">· {viewers}</span>
            )}
          </span>
          {onAir && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white" data-testid={`live-onair-${event.id}`}>
              {onAir}
            </span>
          )}
          {state === "upcoming" && starts > 0 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {relativeEventTime(starts)} · {formatEventTime(starts, false)}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">{title}</p>
      </Link>
      <div className={`mt-1.5 flex items-center gap-2 ${openIn ? "pr-7" : ""}`}>
        <Avatar className={`h-6 w-6 shrink-0 ${ring}`}>
          {channelPicture ? <AvatarImage src={channelPicture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-300">{channelName}</span>
        {category && <span className="shrink-0 truncate text-[11px] text-slate-400 dark:text-slate-500">· {category}</span>}
      </div>
      {openIn && (
        <a
          href={openIn}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-brand-link dark:hover:bg-slate-800"
          aria-label="Watch on zap.stream"
          title="Watch on zap.stream"
          data-testid={`live-watch-${event.id}`}
        >
          <Favicon host="zap.stream" className="h-3.5 w-3.5 rounded-sm" />
        </a>
      )}
    </div>
  );
}

/**
 * A NIP-52 calendar event (kind 31922 date / 31923 time) as a card that reads
 * as an EVENT at a glance — the profile page's date tile (brand-tinted when
 * upcoming, grey once past), title, when + where, then the host. The link
 * out is the one thing you'd do next: add an upcoming event to your calendar,
 * or watch a past one's recording when there is one.
 */
/** Profiles for a few faces: the store first, one fetch for the rest. */
function useFaceProfiles(pubkeys: string[]): Map<string, MemberProfile> {
  const [profiles, setProfiles] = useState<Map<string, MemberProfile>>(new Map());
  const key = pubkeys.join(",");
  useEffect(() => {
    if (!key) return;
    const known = new Map<string, MemberProfile>();
    const missing: string[] = [];
    for (const pk of key.split(",")) {
      const stored = eventStore.getReplaceable(0, pk);
      if (stored) {
        try {
          known.set(pk, JSON.parse(stored.content) as MemberProfile);
        } catch { /* unparseable — fallback face */ }
      } else missing.push(pk);
    }
    setProfiles(known);
    if (missing.length === 0) return;
    let alive = true;
    void fetchProfileMap(missing).then((res) => {
      if (!alive || res.size === 0) return;
      setProfiles((prev) => {
        const next = new Map(prev);
        for (const [pk, content] of res) next.set(pk, content as MemberProfile);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return profiles;
}

/**
 * A calendar event the way Luma lays one out: the start time leads, then
 * the title, who hosts it, where, and who said they are going — faces with
 * a count — with the cover as a square on the right. The date is not here:
 * the Events tab says it once, in the day header above.
 */
export function EventCard({
  event,
  author,
  score,
  going = 0,
  faces = [],
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  /** People whose latest RSVP is "accepted", and up to a few of their faces. */
  going?: number;
  faces?: string[];
}) {
  const cal = parseCalendarEvent(event);
  // "Past" means over — an all-day event today or a running conference is not.
  const past = isOver(cal);
  // Past: the replay when there is one. Upcoming: "I'm going" — a NIP-52
  // RSVP under the reader's key, kept on Nostr (no calendar vendor).
  const openIn = past && cal.recordingUrl ? { url: cal.recordingUrl, label: "Watch replay", host: hostOf(cal.recordingUrl) ?? undefined } : null;
  const corner = !past && cal.startSec > 0 ? <RsvpButton event={event} /> : null;
  const shownFaces = faces.slice(0, 4);
  const faceProfiles = useFaceProfiles(shownFaces);
  const faceScoreOf = useAuthorScores(shownFaces);
  const tierRing = useTierRing();
  return (
    <CardShell
      event={event}
      openInUrl={openIn?.url}
      openInLabel={openIn?.label}
      openInHost={openIn?.host}
      openInTestId={`event-open-${event.id}`}
      corner={corner}
      testId={`event-card-${event.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {cal.startSec > 0 && (
            <p className={`text-xs font-semibold ${past ? "text-slate-400 dark:text-slate-500" : "text-brand-deep dark:text-brand-link"}`} data-testid={`event-time-${event.id}`}>
              {formatEventTime(cal.startSec, cal.isDateOnly)}
              {past && <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">· {relativeEventTime(cal.startSec)}</span>}
            </p>
          )}
          <p className={`mt-0.5 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100 line-clamp-2 ${openIn || corner ? "pr-24" : ""}`}>{cal.title}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <Avatar className={`h-4 w-4 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null, false, "sm", true) ?? ""}`}>
              {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden">
                <DefaultAvatarImg />
              </AvatarFallback>
            </Avatar>
            <span className="truncate">By {author ? getDisplayLabel(author) : "an unknown host"}</span>
          </div>
          {cal.location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{cal.location}</span>
            </p>
          )}
          {going > 0 && (
            <div className="mt-2 flex items-center gap-2" data-testid={`event-going-${event.id}`}>
              <span className="flex -space-x-1.5">
                {shownFaces.map((pk) => {
                  const profile = faceProfiles.get(pk);
                  return (
                    <Avatar key={pk} className={`h-5 w-5 border border-white dark:border-slate-900 ${tierRing(faceScoreOf(pk) ?? null, false, "sm", true) ?? ""}`} data-testid={`event-going-face-${pk}`}>
                      {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="overflow-hidden">
                        <DefaultAvatarImg />
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{going} going</span>
            </div>
          )}
        </div>
        {cal.image && (
          <img src={cal.image} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 object-cover sm:h-24 sm:w-24" data-testid={`event-cover-${event.id}`} />
        )}
      </div>
    </CardShell>
  );
}

export function ListCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const title = tagVal(event, "title") ?? tagVal(event, "name") ?? tagVal(event, "d") ?? "Untitled list";
  const description = tagVal(event, "description") ?? "";
  const members = event.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1]);
  const otherItems = event.tags.filter((t) => t[0] === "e" || t[0] === "a" || t[0] === "r").length;
  // A people-list (Brainstorm's pinned-tag follow sets are kind 30000) counts
  // MEMBERS and shows their faces; mixed lists keep the generic item count.
  const isPeopleList = members.length > 0 && otherItems === 0;
  const count = members.length + otherItems;
  const tierRing = useTierRing();
  const memberScoreOf = useAuthorScores(isPeopleList ? members.slice(0, 5) : []);
  const [profiles, setProfiles] = useState<Map<string, MemberProfile>>(new Map());
  useEffect(() => {
    if (!isPeopleList) return;
    const shown = members.slice(0, 5);
    const known = new Map<string, MemberProfile>();
    const missing: string[] = [];
    for (const pk of shown) {
      const stored = eventStore.getReplaceable(0, pk);
      if (stored) {
        try {
          known.set(pk, JSON.parse(stored.content) as MemberProfile);
        } catch { /* unparseable — fallback face */ }
      } else missing.push(pk);
    }
    setProfiles(known);
    if (missing.length === 0) return;
    let alive = true;
    void fetchProfileMap(missing).then((res) => {
      if (!alive || res.size === 0) return;
      setProfiles((prev) => {
        const next = new Map(prev);
        for (const [pk, content] of res) next.set(pk, content as MemberProfile);
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);
  return (
    <CardShell event={event} testId={`list-card-${event.id}`}>
      {/* Content flush left, the list glyph balancing the top-right corner —
          the same anatomy the app and repo pages settled on. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <Chip size="sm" tone={isPeopleList ? "info" : "slate"} data-testid={`list-count-${event.id}`}>
              {count} {isPeopleList ? (count === 1 ? "member" : "members") : count === 1 ? "item" : "items"}
            </Chip>
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{description}</p>
          )}
          {isPeopleList ? (
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-start gap-2.5" data-testid={`list-members-${event.id}`}>
              {members.slice(0, 5).map((pk, i) => {
                const profile = profiles.get(pk);
                const memberName = profile?.display_name || profile?.name;
                return (
                  // Phones fit 3 faces + the counter on ONE row; sm+ shows 5.
                  <span key={pk} className={`w-12 flex-col items-center gap-1 ${i >= 3 ? "hidden sm:flex" : "flex"}`}>
                    <Avatar
                      className={`h-8 w-8 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(memberScoreOf(pk) ?? null, false, "sm", true) ?? ""}`}
                    >
                      {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="overflow-hidden">
                        <DefaultAvatarImg />
                      </AvatarFallback>
                    </Avatar>
                    <span className="w-full truncate text-center text-[10px] leading-tight text-slate-600 dark:text-slate-300">
                      {memberName ?? "…"}
                    </span>
                  </span>
                );
              })}
              {members.length > 3 && (
                <span className="flex w-12 flex-col items-center gap-1 sm:hidden">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    +{members.length - 3}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">more</span>
                </span>
              )}
              {members.length > 5 && (
                <span className="hidden w-12 flex-col items-center gap-1 sm:flex">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    +{members.length - 5}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">more</span>
                </span>
              )}
              </div>
              {/* The curator balances the pile on the right on desktop; on
                  phones it takes its own full-width row, flush left with
                  everything else — whose web of trust this list speaks for
                  is part of the value, not a footnote crammed underneath. */}
              <CuratorFooter kicker="Curated by" author={author} score={score} created_at={event.created_at} />
            </div>
          ) : (
            <div className="mt-1.5">
              <AuthorRow author={author} score={score} created_at={event.created_at} />
            </div>
          )}
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <ListChecks className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
      </div>
    </CardShell>
  );
}


/**
 * A native track in the results — the same row the profile page plays, on
 * the card surface every other vertical uses. The cover is the play button;
 * the title opens the event; the artist is Flash's field or, failing that,
 * the author's name, since most publishers are the artist.
 */
export function TrackCard({ event, author, flat }: { event: NostrEvent; author: SearchResult | null; score?: number | null; flat?: boolean }) {
  const track = parseTrack(event);
  if (!track) return null;
  // The row draws its own frame; the card adds no second one.
  return (
    <div data-testid={`track-card-${event.id}`}>
      <EmbeddedTrackCard
        id={track.id}
        title={track.title}
        artist={track.artist ?? author?.displayName ?? author?.name}
        cover={track.cover}
        audio={track.audio}
        genre={track.genre}
        durationSec={track.durationSec}
        href={eventPath(event)}
        artistHref={author ? `/p/${author.npub}` : undefined}
        artistPubkey={event.pubkey}
        flat={flat}
      />
    </div>
  );
}


/**
 * A song Wavlake has for the words — the same row as a native track, with the
 * source named, and the title opening the song's Wavlake page (zaps, album,
 * artist live there; there is no Nostr event to open).
 */
export function WavlakeSongCard({ song, flat }: { song: WavlakeSong; flat?: boolean }) {
  return (
    <div data-testid={`wavlake-song-${song.id}`}>
      <EmbeddedTrackCard
        id={song.id}
        title={song.title}
        artist={song.artist}
        cover={song.cover}
        audio={song.audio}
        durationSec={song.durationSec}
        sourceLabel="Wavlake"
        onOpen={() => window.open(song.url, "_blank", "noopener")}
        pageUrl={song.url}
        artistHref={profileHrefOf(song.artistNpub)}
        flat={flat}
      />
    </div>
  );
}


/**
 * A marketplace listing as a buyer sees it: the photo first, the price as
 * the seller wrote it, the title, where it is, and who is selling — with
 * their trust ring, which is the one thing no store can show. The corner
 * opens the seller's own page for it when the app published one.
 */
export function ListingCard({
  event,
  author,
  score,
  showAuthor = true,
  group,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  showAuthor?: boolean;
  /** When this card stands for one product published as several listings
   *  (sizes, colours): the shared title and how many options there are. */
  group?: { title: string; options: number };
}) {
  const l = parseListing(event);
  if (!l) return null;
  const host = l.shopUrl ? hostOf(l.shopUrl) ?? undefined : undefined;
  return (
    <CardShell
      event={event}
      openInUrl={l.shopUrl ?? undefined}
      openInLabel="Visit shop"
      openInHost={host}
      openInPlacement="corner-icon"
      openInTestId={`listing-open-${event.id}`}
      fill
      testId={`listing-card-${event.id}`}
    >
      <div className="-mx-1 -mt-1 relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        {l.images[0] ? (
          <img src={l.images[0]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <ShoppingBag className="h-7 w-7" />
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-slate-900/85 px-2 py-0.5 text-xs font-semibold text-white" data-testid={`listing-price-${event.id}`}>
          {l.price ? formatListingPrice(l.price) : "Price on request"}
        </span>
        {l.images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{l.images.length} photos</span>
        )}
        {group && group.options > 1 && (
          <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800" data-testid={`listing-options-${event.id}`}>
            {group.options} options
          </span>
        )}
      </div>
      <p className={`mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100 ${l.shopUrl ? "pr-2" : ""}`}>{group?.title ?? l.title}</p>
      {(l.location || l.summary) && (
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{l.location ?? l.summary}</p>
      )}
      {showAuthor && (
        <div className="mt-2">
          <AuthorRow author={author} score={score} created_at={event.created_at} />
        </div>
      )}
    </CardShell>
  );
}
