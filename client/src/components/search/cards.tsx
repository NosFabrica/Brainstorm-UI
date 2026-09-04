import { parseTrack } from "@/lib/trackEvent";
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
import { Code2, ExternalLink, File, FileAudio, FileVideo, ListChecks, MapPin, Package, Radio } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Chip } from "@/components/ui/chip";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { fetchRepoCounts, zapStoreUrl } from "@/services/search";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { FeedVideo } from "@/components/share/FeedVideo";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { MentionChip } from "@/components/share/MentionChip";
import { Favicon } from "@/components/share/LinkPreview";
import { formatEventDate, isOver, parseCalendarEvent, relativeEventTime } from "@/lib/calendarEvent";
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
  openInPlacement?: "corner" | "footer";
  openInSlotTestId?: string;
  /** Fill the grid cell so a row of cards shares one height. */
  fill?: boolean;
  /** A control for the top corner that isn't a link out (the RSVP button).
   *  Lives outside the card's own link like openIn does. */
  corner?: React.ReactNode;
  testId?: string;
}) {
  const footer = openInPlacement === "footer";
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
            className={
              footer
                ? "inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-brand-deep dark:text-brand-link hover:border-brand-accent/40 hover:bg-brand-primary/5 transition-colors"
                : "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-brand-link hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            }
            data-testid={openInTestId}
          >
            {openInHost ? <Favicon host={openInHost} className="h-3 w-3 shrink-0 rounded-sm" /> : <ExternalLink className="h-2.5 w-2.5" />}{" "}
            {openInLabel ?? "Open in…"}
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
            sourceLabel={host ?? undefined}
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
      {host && !isAudio && (
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">via {host}</p>
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

export function RepoCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  // The Repos tab is a mix: 30617 repo announcements, plus patches (1617) and
  // issues (1621/1618) that target a repo. A type chip tells them apart, and
  // a patch/issue names the repo it belongs to (from its a-tag) — the context
  // that makes a lone "fix: …" card mean something.
  const isRepo = event.kind === 30617;
  const typeLabel = event.kind === 1617 ? "Patch" : isRepo ? "Repo" : "Issue";
  const typeTone: "info" | "success" | "warning" = event.kind === 1617 ? "info" : isRepo ? "success" : "warning";
  const name = tagVal(event, "name") ?? tagVal(event, "subject") ?? tagVal(event, "d") ?? "Untitled";
  const description = tagVal(event, "description") ?? (isRepo ? "" : event.content.slice(0, 200));
  const repoRef = !isRepo ? tagVal(event, "a")?.split(":")[2] : undefined;
  const dest = repoDestination(event);
  // The "is anyone working on this?" signal — issue/patch counts for the repo
  // (announcements only; a lone patch/issue has none of its own).
  const d = tagVal(event, "d");
  const [counts, setCounts] = useState<{ issues: number; patches: number }>({ issues: 0, patches: 0 });
  useEffect(() => {
    if (!isRepo || !d) return;
    let alive = true;
    void fetchRepoCounts(`30617:${event.pubkey}:${d}`).then((c) => {
      if (alive) setCounts(c);
    });
    return () => {
      alive = false;
    };
  }, [isRepo, d, event.pubkey]);
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
          {repoRef && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">↳ in {repoRef}</p>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{description}</p>
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
 * A NIP-52 calendar event (kind 31922 date / 31923 time) as a card that reads
 * as an EVENT at a glance — the profile page's date tile (brand-tinted when
 * upcoming, grey once past), title, when + where, then the host. The link
 * out is the one thing you'd do next: add an upcoming event to your calendar,
 * or watch a past one's recording when there is one.
 */
export function EventCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const cal = parseCalendarEvent(event);
  // "Past" means over — an all-day event today or a running conference is not.
  const past = isOver(cal);
  // Past: the replay when there is one. Upcoming: "I'm going" — a NIP-52
  // RSVP under the reader's key, kept on Nostr (no calendar vendor).
  const openIn = past && cal.recordingUrl ? { url: cal.recordingUrl, label: "Watch replay", host: hostOf(cal.recordingUrl) ?? undefined } : null;
  const corner = !past && cal.startSec > 0 ? <RsvpButton event={event} /> : null;
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
        <EventDateTile startSec={cal.startSec} past={past} testId="event-date-tile" />
        {cal.image && (
          <img src={cal.image} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold text-slate-900 dark:text-slate-100 ${openIn || corner ? "pr-24" : ""}`}>{cal.title}</p>
          {cal.startSec > 0 && (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              <span className={past ? "" : "font-medium text-brand-deep dark:text-brand-link"}>{relativeEventTime(cal.startSec)}</span>
              <span className="text-slate-400 dark:text-slate-500"> · {formatEventDate(cal.startSec, cal.isDateOnly)}</span>
            </p>
          )}
          {cal.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{cal.location}</span>
            </p>
          )}
          {cal.summary && cal.summary !== cal.title && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{cal.summary}</p>
          )}
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

type MemberProfile = { name?: string; display_name?: string; picture?: string };

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
export function TrackCard({ event, author }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  const track = parseTrack(event);
  if (!track) return null;
  return (
    <div
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1"
      data-testid={`track-card-${event.id}`}
    >
      <EmbeddedTrackCard
        id={track.id}
        title={track.title}
        artist={track.artist ?? author?.displayName ?? author?.name}
        cover={track.cover}
        audio={track.audio}
        genre={track.genre}
        durationSec={track.durationSec}
        href={eventPath(event)}
      />
    </div>
  );
}
