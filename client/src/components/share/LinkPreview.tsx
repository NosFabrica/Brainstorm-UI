import { useState } from "react";
import { Globe, Github, Play } from "lucide-react";

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

/** Favicon loaded directly from the site; falls back to a globe icon if missing. */
function Favicon({ host, className }: { host: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !host) return <Globe className={className} />;
  return (
    <img
      src={`https://${host}/favicon.ico`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
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
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[13px] font-medium text-[#3730a3] no-underline hover:bg-slate-200 transition-colors"
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
        className="mt-2 block rounded-xl border border-slate-200 overflow-hidden no-underline hover:border-slate-300 transition-colors"
        data-testid="link-card-github"
      >
        <img
          src={`https://opengraph.githubassets.com/1/${owner}/${repo}`}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full aspect-[1200/600] object-cover bg-slate-100"
        />
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500">
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
      className="mt-2 flex items-stretch gap-3 rounded-xl border border-slate-200 bg-white no-underline overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all"
      data-testid="link-card-github"
    >
      <img src={`https://github.com/${owner}.png?size=120`} alt="" loading="lazy" className="h-16 w-16 shrink-0 object-cover bg-slate-100" />
      <div className="min-w-0 flex-1 py-2 pr-3 flex flex-col justify-center">
        <span className="text-sm font-bold text-slate-900 truncate">{owner}/{repo}</span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500"><Github className="h-3.5 w-3.5" /> GitHub</span>
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
        className="mt-2 block rounded-xl border border-slate-200 overflow-hidden no-underline hover:border-slate-300 transition-colors"
        data-testid="link-card-youtube"
      >
        <div className="relative aspect-video bg-slate-900">
          <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-11 w-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="h-4 w-4 text-[#333286] ml-0.5" />
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

  // Plain links carry no real preview here (favicon + domain + path just repeats
  // the inline chip), so we render nothing and let the chip speak for the link.
  return null;
}
