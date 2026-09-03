/**
 * The app page (kind 32267 on /e) — the click-through Vitor's Apps tab
 * deserved: an app-store presentation built entirely from the listing
 * event, plus one relay lookup for the latest Zap Store release (the
 * "is it maintained?" trust signal).
 */
import { useEffect, useState } from "react";
import { Code2, ExternalLink, Package, Sparkles } from "lucide-react";
import { useLightbox } from "@/components/share/Lightbox";
// Structural minimum (EventPage hands heroes MinimalEvent, which has no sig).
type AppEvent = {
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
};
import { Chip } from "@/components/ui/chip";
import { fetchLatestRelease, type AppRelease } from "@/services/search";

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
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => {
    if (!appD) return;
    let alive = true;
    void fetchLatestRelease(appD, event.pubkey).then((r) => {
      if (alive) setRelease(r);
    });
    return () => {
      alive = false;
    };
  }, [appD, event.pubkey]);

  return (
    <div data-testid="app-hero">
      {/* The store-front row: icon, identity, actions. */}
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-sm">
          {icon ? (
            <img src={icon} alt="" className="h-full w-full object-cover" data-testid="app-hero-icon" />
          ) : (
            <Package className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            {name}
          </h1>
          {summary && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 break-words">{summary}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                data-testid="app-hero-get"
              >
                Get it <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {repository && (
              <a
                href={repository}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors"
                data-testid="app-hero-source"
              >
                <Code2 className="h-3 w-3" /> Source
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Facts row: platforms, license, and how alive the app is. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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

      {/* What's new — the latest release's own notes, not just a version chip.
          Zap Store changelogs can be whole GitHub release dumps, so long ones
          collapse to a few lines behind Show more. */}
      {release && release.notes.trim() && (
        <div
          className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3"
          data-testid="app-hero-whats-new"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-brand-accent" /> What's new · v{release.version}
          </div>
          <p
            className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200 ${
              notesOpen ? "" : "line-clamp-6"
            }`}
          >
            {release.notes.trim()}
          </p>
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
    </div>
  );
}
