import { useEffect, useState } from "react";
import { Globe, Github, Play } from "lucide-react";
import { fetchUnfurl, type Unfurled } from "@/services/unfurl";

/**
 * Server-free "smart" link previews. We can't fetch a URL's OG tags from the
 * browser (CORS), so until the /api/unfurl proxy lands this renders the prettiest
 * thing possible WITHOUT a server: a favicon loaded straight from the site (globe
 * fallback), plus richer cards for hosts whose images are directly loadable —
 * GitHub (owner avatar + owner/repo) and YouTube (video thumbnail). No third-party
 * favicon/preview service, so it stays privacy-aligned.
 */

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function prettyPath(u: URL): string {
  const p = (u.pathname + u.search).replace(/\/+$/, "");
  return p && p !== "" ? p : "";
}

/** Where sites actually keep their icon, in the order worth trying — the
 *  apex domain too when the link said www. No third-party icon service. */
function faviconCandidates(host: string): string[] {
  const hosts = [host];
  const apex = host.replace(/^www\./i, "");
  if (apex !== host) hosts.push(apex);
  return hosts.flatMap((h) => [`https://${h}/favicon.ico`, `https://${h}/favicon.png`]);
}

/** Favicon loaded directly from the site; the globe only once every candidate failed. */
export function Favicon({ host, className }: { host: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  const candidates = host ? faviconCandidates(host) : [];
  if (attempt >= candidates.length) return <Globe className={className} data-testid="favicon-globe" />;
  return (
    <img
      key={candidates[attempt]}
      src={candidates[attempt]}
      alt=""
      loading="lazy"
      onError={() => setAttempt((a) => a + 1)}
      className={className}
      data-testid="favicon"
    />
  );
}

/** Compact inline link: favicon + domain. Replaces a bare blue URL in text. */
export function LinkChip({ url }: { url: string }) {
  const u = parse(url);
  const host = u?.hostname.replace(/^www\./, "") || url;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 align-middle text-[13px] font-medium text-brand-link no-underline hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      data-testid="link-chip"
    >
      <Favicon host={u?.hostname || ""} className="h-3.5 w-3.5 rounded-sm shrink-0 object-contain" />
      <span className="truncate">{host}</span>
    </a>
  );
}

function githubRepo(u: URL): { owner: string; repo: string } | null {
  if (u.hostname.replace(/^www\./, "") !== "github.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const reserved = new Set([
    "orgs", "sponsors", "topics", "collections", "marketplace", "features",
    "about", "pricing", "login", "settings", "notifications", "explore", "search",
  ]);
  if (parts.length >= 2 && !reserved.has(parts[0].toLowerCase())) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1) || null;
  if (host.endsWith("youtube.com")) return u.searchParams.get("v");
  return null;
}

/**
 * GitHub repo card. GitHub renders a full social-preview image (repo name,
 * description, stars, contributors) at a predictable URL — any path segment
 * works as a cache-buster — so we can show the exact rich card with no server.
 * Falls back to an owner-avatar + name card if that image fails (e.g. private).
 */
function GithubCard({ url, owner, repo, host }: { url: string; owner: string; repo: string; host: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!imgFailed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden no-underline hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        data-testid="link-card-github"
      >
        <img
          src={`https://opengraph.githubassets.com/1/${owner}/${repo}`}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full aspect-[1200/600] object-cover bg-slate-100 dark:bg-slate-800"
        />
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Github className="h-3.5 w-3.5" /> {host}
        </div>
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-stretch gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 no-underline overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all"
      data-testid="link-card-github"
    >
      <img src={`https://github.com/${owner}.png?size=120`} alt="" loading="lazy" className="h-16 w-16 shrink-0 object-cover bg-slate-100 dark:bg-slate-800" />
      <div className="min-w-0 flex-1 py-2 pr-3 flex flex-col justify-center">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{owner}/{repo}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><Github className="h-3.5 w-3.5" /> GitHub</span>
      </div>
    </a>
  );
}

/** The rich preview card for a note's primary link. */
export function LinkPreviewCard({ url }: { url: string }) {
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");
  const yt = youtubeId(u);
  const gh = githubRepo(u);

  if (yt) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden no-underline hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        data-testid="link-card-youtube"
      >
        <div className="relative aspect-video bg-slate-900">
          <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-11 w-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="h-4 w-4 text-brand-deep ml-0.5" />
            </span>
          </div>
        </div>
        <div className="px-3 py-2 text-xs font-semibold text-white bg-slate-900">YouTube · {host}</div>
      </a>
    );
  }

  if (gh) {
    return <GithubCard url={url} owner={gh.owner} repo={gh.repo} host={host} />;
  }

  // Plain links: the server's unfurl proxy, when it answers, gives a real
  // card — title, description, image. Until it does, nothing; the inline
  // chip speaks for the link.
  return <UnfurledCard url={url} host={host} />;
}

/** Title + description + image for a plain link, from the unfurl proxy. */
function UnfurledCard({ url, host }: { url: string; host: string }) {
  const [meta, setMeta] = useState<Unfurled | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setMeta(null);
    void fetchUnfurl(url).then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  if (!meta || (!meta.title && !meta.description)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 flex items-stretch gap-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 no-underline hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all"
      data-testid="link-card"
    >
      {meta.image && !imgFailed && (
        <img src={meta.image} alt="" loading="lazy" onError={() => setImgFailed(true)} className="h-24 w-32 shrink-0 object-cover bg-slate-100 dark:bg-slate-800" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3 pl-1">
        <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <Favicon host={host} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
          <span className="truncate">{meta.siteName ?? host}{meta.siteName && meta.siteName.toLowerCase() !== host.toLowerCase() ? ` · ${host}` : ""}</span>
        </span>
        {meta.title && <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">{meta.title}</span>}
        {meta.description && <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-600 dark:text-slate-300">{meta.description}</span>}
      </div>
    </a>
  );
}
