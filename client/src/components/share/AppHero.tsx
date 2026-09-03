/**
 * The app page (kind 32267 on /e) — the click-through Vitor's Apps tab
 * deserved: an app-store presentation built entirely from the listing
 * event, plus one relay lookup for the Zap Store releases ("is it
 * maintained?" + what's new + version history), and a publisher row so
 * the trust story — WHO signed this build — is one tap away.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { Code2, Download, ExternalLink, Globe, Package } from "lucide-react";
import { useLightbox } from "@/components/share/Lightbox";
import { MentionChip } from "@/components/share/MentionChip";
import { Favicon, LinkChip } from "@/components/share/LinkPreview";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { Chip } from "@/components/ui/chip";
import { eventPath } from "@/lib/shareId";
import {
  appAddress,
  fetchReleaseAsset,
  fetchReleases,
  fetchSimilarApps,
  kind0ToSearchResult,
  zapStoreUrl,
  type AppRelease,
  type ReleaseAsset,
} from "@/services/search";
import { formatBytes } from "@/lib/formatBytes";

// Structural minimum (EventPage hands heroes MinimalEvent, which has no sig).
type AppEvent = {
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
};

function tagVal(event: AppEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

function tagVals(event: AppEvent, name: string): string[] {
  return event.tags.filter((t) => t[0] === name && t[1]).map((t) => t[1]);
}

function platformWords(event: AppEvent): string[] {
  const words = new Set<string>();
  for (const f of tagVals(event, "f")) {
    const v = f.toLowerCase();
    if (v.startsWith("android")) words.add("Android");
    else if (v.startsWith("ios")) words.add("iOS");
    else if (v.includes("darwin") || v.includes("mac")) words.add("macOS");
    else if (v.includes("windows")) words.add("Windows");
    else if (v.includes("linux")) words.add("Linux");
    else if (v.includes("web")) words.add("Web");
  }
  return [...words];
}

function releaseAge(at: number): string {
  const days = Math.floor((Date.now() / 1000 - at) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function releaseDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


// ---------------------------------------------------------------------------
// Release-notes rendering: GitHub-flavored changelogs arrive as raw markdown.
// Headings and bullets get real structure; PR/issue URLs compress to #N chips;
// nostr: mentions become the person; @handles are acknowledged in weight.
// ---------------------------------------------------------------------------

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

function NotesInline({ text }: { text: string }) {
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

type NotesBlock =
  | { type: "heading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "para"; text: string };

function parseNotes(notes: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", text: heading[1] });
      continue;
    }
    const bullet = line.match(/^[*-]\s+(.*)$/);
    if (bullet) {
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "bullets") prev.items.push(bullet[1]);
      else blocks.push({ type: "bullets", items: [bullet[1]] });
      continue;
    }
    blocks.push({ type: "para", text: line });
  }
  return blocks;
}

function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      {parseNotes(notes).map((block, i) => {
        if (block.type === "heading") {
          return (
            <div key={i} className="pt-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {block.text}
            </div>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2 break-words">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
                  <span className="min-w-0">
                    <NotesInline text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="break-words">
            <NotesInline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}


/** "Updates ~weekly/~monthly/~every N mo" from the median gap between releases. */
function cadenceLabel(releases: AppRelease[]): string | null {
  if (releases.length < 2) return null;
  const gaps = releases
    .slice(0, -1)
    .map((r, i) => (r.at - releases[i + 1].at) / 86400)
    .sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median < 10) return "~weekly";
  if (median < 45) return "~monthly";
  return `~every ${Math.max(2, Math.round(median / 30))}mo`;
}

/** Store-first publisher profile, with a relay fallback — MentionChip's move. */
function usePublisher(pubkey: string): SearchResult | null {
  const known = eventStore.getReplaceable(0, pubkey);
  const [fetched, setFetched] = useState<SearchResult | null>(null);
  useEffect(() => {
    if (known) return;
    let alive = true;
    void fetchProfileMap([pubkey]).then((map) => {
      const profile = map.get(pubkey);
      if (alive && profile) {
        setFetched(
          kind0ToSearchResult({
            kind: 0,
            pubkey,
            content: JSON.stringify(profile),
            tags: [],
            created_at: 0,
            id: "",
            sig: "",
          } as NostrEvent),
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [known, pubkey]);
  if (known) return kind0ToSearchResult(known as NostrEvent);
  return fetched;
}

const HISTORY_MAX = 5;
const SECONDARY_PILL =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors sm:py-1.5";

export function AppHero({ event }: { event: AppEvent }) {
  const name = tagVal(event, "name") ?? tagVal(event, "d") ?? "Untitled app";
  const summary = tagVal(event, "summary");
  const icon = tagVal(event, "icon");
  const url = tagVal(event, "url");
  const repository = tagVal(event, "repository");
  const license = tagVal(event, "license");
  const shots = tagVals(event, "image");
  const platforms = platformWords(event);
  const appD = tagVal(event, "d");

  const openLightbox = useLightbox();
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [similar, setSimilar] = useState<NostrEvent[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Category t-tags, minus the ones that just restate a platform word.
  const platformSet = new Set(platforms.map((p) => p.toLowerCase()));
  const categories = [...new Set(tagVals(event, "t"))]
    .filter((t) => !platformSet.has(t.toLowerCase()))
    .slice(0, 4);
  const address = appD ? appAddress({ pubkey: event.pubkey, tags: event.tags }) : null;

  useEffect(() => {
    if (!appD) return;
    let alive = true;
    void fetchReleases(appD, event.pubkey).then((r) => {
      if (alive) setReleases(r);
    });
    return () => {
      alive = false;
    };
  }, [appD, event.pubkey]);
  useEffect(() => {
    if (!address || categories.length === 0) return;
    let alive = true;
    void fetchSimilarApps(categories, address).then((r) => {
      if (alive) setSimilar(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, categories.join(",")]);

  const release = releases[0] ?? null;
  const history = releases.slice(1);
  // The latest release's asset — the APK — lives on the Zap Store relay.
  const [asset, setAsset] = useState<ReleaseAsset | null>(null);
  const assetKey = release?.assetIds.join(",") ?? "";
  useEffect(() => {
    setAsset(null);
    if (!release || release.assetIds.length === 0) return;
    let alive = true;
    void fetchReleaseAsset(release.assetIds).then((a) => {
      if (alive) setAsset(a);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetKey]);
  const store = zapStoreUrl({ pubkey: event.pubkey, tags: event.tags });
  const isApk = !!asset && (asset.mime === "application/vnd.android.package-archive" || /\.apk(\?|#|$)/i.test(asset.url));
  const cadence = cadenceLabel(releases);
  const publisher = usePublisher(event.pubkey);
  const scoreOf = useAuthorScores([event.pubkey]);
  const tierRing = useTierRing();
  let publisherNpub = "";
  try {
    publisherNpub = nip19.npubEncode(event.pubkey);
  } catch {
    /* malformed pubkey — row renders without a link target */
  }

  return (
    <div data-testid="app-hero">
      {/* The store front, Play-Store anatomy: identity + facts flush left,
          the app icon in the top-right corner, actions on their own row
          beneath — equal-width buttons on phones, left-aligned from sm up. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            {name}
          </h1>
          {/* Who signed this build — the trust story, right under the name. */}
          {publisherNpub && (
            <Link
              href={`/p/${publisherNpub}`}
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
              data-testid="app-hero-publisher"
            >
              <Avatar
                className={`h-[18px] w-[18px] border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(event.pubkey) ?? publisher?.wotRank ?? null, false, "sm", true) ?? ""}`}
              >
                {publisher?.picture ? <AvatarImage src={publisher.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-brand-link">
                {publisher ? getDisplayLabel(publisher) : `${publisherNpub.slice(0, 12)}…`}
              </span>
            </Link>
          )}
          {summary && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 break-words">{summary}</p>}
          {/* Facts: platforms, license, and how alive the app is. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {platforms.map((p) => (
              <Chip key={p} size="sm" tone="slate">{p}</Chip>
            ))}
            {license && <Chip size="sm" tone="slate">{license}</Chip>}
            {release && (
              <Chip size="sm" tone="success" data-testid="app-hero-release">
                v{release.version} · {releaseAge(release.at)}
              </Chip>
            )}
          </div>
          {/* Categories are their own row — facts and topics don't interleave. */}
          {categories.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {categories.map((t) => (
                <Link key={t} href={`/?q=${encodeURIComponent(`#${t}`)}&t=apps`} data-testid={`app-cat-${t}`} className="no-underline">
                  <Chip size="sm" tone="info">#{t}</Chip>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-sm">
          {icon ? (
            <img src={icon} alt="" className="h-full w-full object-cover" data-testid="app-hero-icon" />
          ) : (
            <Package className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          )}
        </div>
      </div>

      {/* Actions: Get on Zap Store (where installs actually happen, signature-
          verified against the dev's key) leads; Website / Source / the APK
          itself follow as quiet pills. Wraps on phones. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {store ? (
          <a
            href={store}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity sm:py-1.5"
            data-testid="app-hero-get"
          >
            <Favicon host="zapstore.dev" className="h-3.5 w-3.5 rounded-sm" /> Get on Zap Store
          </a>
        ) : (
          url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity sm:py-1.5"
              data-testid="app-hero-get"
            >
              Get it <ExternalLink className="h-3 w-3" />
            </a>
          )
        )}
        {/* Website and Source pair up as one matched row; a lone one spans it. */}
        {store && url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${SECONDARY_PILL} ${repository ? "" : "col-span-2"}`}
            data-testid="app-hero-website"
          >
            <Globe className="h-3 w-3" /> Website
          </a>
        )}
        {repository && (
          <a
            href={repository}
            target="_blank"
            rel="noopener noreferrer"
            className={`${SECONDARY_PILL} ${store && url ? "" : "col-span-2"}`}
            data-testid="app-hero-source"
          >
            <Code2 className="h-3 w-3" /> Source
          </a>
        )}
        {asset && (
          <a
            href={asset.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            title={asset.hash ? `SHA-256 ${asset.hash}` : undefined}
            className={`${SECONDARY_PILL} col-span-2`}
            data-testid="app-hero-download"
          >
            <Download className="h-3 w-3" />
            {isApk ? "Download APK" : "Download"}
            {asset.size ? ` · ${formatBytes(asset.size)}` : ""}
            {asset.version ? ` · v${asset.version}` : ""}
          </a>
        )}
      </div>

      {/* At-a-glance store stats — computed from the releases we already hold. */}
      {releases.length > 0 && (
        <div
          className="mt-4 flex divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800"
          data-testid="app-hero-stats"
        >
          <div className="flex-1 px-3 py-2.5 text-center">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{releases.length}</div>{" "}
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{releases.length === 1 ? "release" : "releases"}</div>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {new Date(releases[releases.length - 1].at * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Since</div>
          </div>
          {cadence && (
            <div className="flex-1 px-3 py-2.5 text-center">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cadence}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Updates</div>
            </div>
          )}
        </div>
      )}

      {/* What's new — the latest release's own notes, not just a version chip.
          Zap Store changelogs can be whole GitHub release dumps, so long ones
          collapse to a few lines behind Show more. */}
      {release && release.notes.trim() && (
        <div
          className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3"
          data-testid="app-hero-whats-new"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              What's new
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500">
              v{release.version} · {releaseDate(release.at)}
            </div>
          </div>
          <div className={`relative mt-2 ${notesOpen ? "" : "max-h-44 overflow-hidden"}`}>
            <ReleaseNotes notes={release.notes.trim()} />
            {!notesOpen && release.notes.trim().split("\n").length > 6 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-50 dark:from-slate-900/90 to-transparent" />
            )}
          </div>
          {release.notes.trim().split("\n").length > 6 && (
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="mt-1.5 text-xs font-medium text-brand-primary hover:underline"
              data-testid="app-hero-notes-toggle"
            >
              {notesOpen ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Screenshot gallery — what actually sells an app. Tap to zoom. */}
      {shots.length > 0 && (
        <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
          {shots.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => openLightbox(shots, i)}
              className="shrink-0 cursor-zoom-in rounded-xl focus-visible:ring-2 focus-visible:ring-brand-accent"
              data-testid={`app-shot-${i}`}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-64 w-auto rounded-xl border border-slate-200 dark:border-slate-800 object-cover bg-slate-100 dark:bg-slate-800"
              />
            </button>
          ))}
        </div>
      )}

      {/* The listing's own description. */}
      {event.content?.trim() && (
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {event.content}
        </p>
      )}

      {/* Version history — the release cadence at a glance. */}
      {history.length > 0 && (
        <div className="mt-4" data-testid="app-hero-history">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Version history
          </div>
          <ul className="mt-1.5 space-y-1">
            {(historyOpen ? history : history.slice(0, HISTORY_MAX)).map((r) => (
              <li key={`${r.version}-${r.at}`} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">v{r.version}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{releaseDate(r.at)}</span>
              </li>
            ))}
          </ul>
          {history.length > HISTORY_MAX && (
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="mt-1.5 text-xs font-medium text-brand-primary hover:underline"
              data-testid="app-hero-history-toggle"
            >
              {historyOpen ? "Show fewer versions" : `All ${history.length} versions`}
            </button>
          )}
        </div>
      )}

      {/* Similar apps — category-mates from the store, in-app links. */}
      {similar.length > 0 && (
        <div className="mt-5" data-testid="app-hero-similar">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Similar apps
          </div>
          <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
            {similar.map((e) => {
              const d = e.tags.find((t) => t[0] === "d")?.[1] ?? e.id;
              const simIcon = e.tags.find((t) => t[0] === "icon")?.[1];
              const simName = e.tags.find((t) => t[0] === "name")?.[1] ?? d;
              return (
                <Link
                  key={d}
                  href={eventPath(e)}
                  className="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  data-testid={`app-similar-${d}`}
                >
                  <span className="h-12 w-12 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    {simIcon ? (
                      <img src={simIcon} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                    )}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-200">
                    {simName}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
