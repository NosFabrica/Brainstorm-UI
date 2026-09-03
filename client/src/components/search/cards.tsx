import { useEffect, useState } from "react";
/**
 * Typed result cards for the verticals with no existing precedent —
 * media, code & git, live events, lists. Each is a compact, self-contained
 * card: author row, the thing itself, and a whole-card link to the in-app
 * event page (/e/:id — NoteContent renders video/audio/HLS there), with an
 * "Open in…" external link for the full native experience. Design-system
 * primitives per CLAUDE.md: Chip for status/counts, shared tier ring.
 */
import { Link } from "wouter";
import { Code2, ExternalLink, File, FileAudio, FileVideo, ListChecks, Package, Radio } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Chip } from "@/components/ui/chip";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";

export function tagVal(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

function fmtWhen(created_at: number): string {
  try {
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

function CardShell({
  event,
  children,
  openInUrl,
  openInLabel,
  openInTestId,
  testId,
}: {
  event: NostrEvent;
  children: React.ReactNode;
  openInUrl?: string;
  openInLabel?: string;
  openInTestId?: string;
  testId?: string;
}) {
  return (
    <div
      className="relative w-full rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all duration-150"
      data-testid={testId}
    >
      <Link href={eventPath(event)} className="block p-3 sm:p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-xl">
        {children}
      </Link>
      {openInUrl && (
        <a
          href={openInUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-brand-link hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          data-testid={openInTestId}
        >
          <ExternalLink className="h-2.5 w-2.5" /> {openInLabel ?? "Open in…"}
        </a>
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
  const url = mediaUrlOf(event);
  const poster = mediaPosterOf(event);
  const isImage = !!url && IMAGE_RE.test(url);
  const isVideo = !!url && !isImage && isVideoUrl(event, url);
  const caption = (tagVal(event, "title") ?? event.content ?? "").slice(0, 200);
  return (
    <CardShell event={event} testId={`media-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {isImage || poster ? (
            <img src={isImage ? (url as string) : (poster as string)} alt="" loading="lazy" className="h-full w-full object-cover" data-testid={`media-thumb-${event.id}`} />
          ) : isVideo ? (
            // No poster published — a metadata-only <video> paints the first
            // frame as the thumbnail without downloading the file.
            <video
              src={`${url}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none h-full w-full object-cover"
              data-testid={`media-video-thumb-${event.id}`}
            />
          ) : (
            // Honest icon for what the file actually is — a PDF is not a video.
            (() => {
              const mime = tagVal(event, "m") ?? "";
              const Icon = mime.startsWith("audio/") || event.kind === 1222 ? FileAudio
                : mime.startsWith("video/") || !mime ? FileVideo
                : File;
              return <Icon className="h-6 w-6 text-slate-400 dark:text-slate-500" />;
            })()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <AuthorRow author={author} score={score} created_at={event.created_at} />
          {caption && (
            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200 break-words line-clamp-2">{caption}</p>
          )}
          {url && !isImage && (
            <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500">{url}</p>
          )}
        </div>
      </div>
    </CardShell>
  );
}

/** "android-arm64-v8a" and friends → one human word each, deduped. */
function platformWords(event: NostrEvent): string[] {
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
  const getIt = tagVal(event, "url") ?? tagVal(event, "repository");
  return (
    <CardShell event={event} openInUrl={getIt} openInLabel="Get it" openInTestId={`app-get-${event.id}`} testId={`app-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-sm">
          {icon ? (
            <img src={icon} alt="" loading="lazy" className="h-full w-full object-cover" data-testid={`app-icon-${event.id}`} />
          ) : (
            <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
          {summary && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{summary}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {platforms.map((p) => (
              <Chip key={p} size="sm" tone="slate">{p}</Chip>
            ))}
            {license && <Chip size="sm" tone="slate">{license}</Chip>}
          </div>
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
      </div>
    </CardShell>
  );
}

export function RepoCard({ event, author, score }: { event: NostrEvent; author: SearchResult | null; score?: number | null }) {
  // 30617 repo announcements carry name/description; patches (1617), issues
  // (1621) and snippets (1337) fall back to subject/description/content.
  const name = tagVal(event, "name") ?? tagVal(event, "subject") ?? tagVal(event, "d") ?? "Untitled";
  const description = tagVal(event, "description") ?? (event.kind === 30617 ? "" : event.content.slice(0, 200));
  const web = tagVal(event, "web");
  const naddr = naddrOf(event);
  const openIn = web ?? (naddr ? `https://gitworkshop.dev/${naddr}` : undefined);
  return (
    <CardShell event={event} openInUrl={openIn} openInLabel="Open repo" testId={`repo-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Code2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 break-words line-clamp-2">{description}</p>
          )}
          <div className="mt-1.5">
            <AuthorRow author={author} score={score} created_at={event.created_at} />
          </div>
        </div>
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
          <div className="flex items-center gap-2 min-w-0">
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
              {/* One quiet line: kicker + a small ringed face + name, the
                  date parked at the card's bottom-right corner. */}
              <div className="flex w-full items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/60 pt-2 sm:w-auto sm:ml-auto sm:border-0 sm:pt-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[10px] font-medium uppercase leading-none tracking-wide text-slate-400 dark:text-slate-500">
                    Curated by
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
                <span className="shrink-0 text-[11px] leading-none text-slate-400 dark:text-slate-500">{fmtWhen(event.created_at)}</span>
              </div>
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
