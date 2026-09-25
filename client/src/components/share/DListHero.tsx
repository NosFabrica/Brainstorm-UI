/**
 * A D-list event on its own page, as the thing it is. The team (2026-09-24):
 * associate the musician/songs D-list event ids with the music icon in the
 * UI. A list's header is the list: its name, its category and icon, what it
 * holds, and the tab where its items live. An item is the song or the
 * musician it names, under the same icon — a song plays here, a musician
 * has their music here and a page to support them.
 */
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { Chip } from "@/components/ui/chip";
import { dlistOfEvent, parseDListMusician, parseDListSong, type DListCategory } from "@/lib/dlists";
import { podcastIndexHref } from "@/lib/upNext";

type DListEvent = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

const CATEGORY_WORD: Record<DListCategory, { noun: string; tab: string; tabLabel: string }> = {
  music: { noun: "Music", tab: "music", tabLabel: "Open the Music tab" },
};

export function DListHero({ event }: { event: DListEvent }) {
  const list = dlistOfEvent(event);
  if (!list) return null;
  const Icon = list.icon;
  const words = CATEGORY_WORD[list.category];
  const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;

  if (event.kind === 39998) {
    return (
      <div data-testid="dlist-hero">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          <Icon className="h-3.5 w-3.5" /> {words.noun} list <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">from Podcast Index</span>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
          {tag("name") ?? list.name}
        </h1>
        {tag("description") && <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{tag("description")}</p>}
        <Link href={`/?t=${words.tab}`} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover" data-testid="dlist-open-tab">
          <Icon className="h-4 w-4" /> {words.tabLabel}
        </Link>
      </div>
    );
  }

  const song = parseDListSong(event);
  if (song) {
    return (
      <div data-testid="dlist-hero">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          <Icon className="h-3.5 w-3.5" /> Song <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">in {list.name} · Podcast Index</span>
        </p>
        <EmbeddedTrackCard
          id={song.id}
          title={song.title}
          artist={song.artist || undefined}
          cover={song.cover}
          audio={song.audio}
          durationSec={song.durationSec}
          sourceLabel="Podcast Index"
          sourceHost="podcastindex.org"
          supportUrl={song.url}
          href={podcastIndexHref(song.artist || song.title)}
        />
      </div>
    );
  }

  const musician = parseDListMusician(event);
  if (!musician) return null;
  return (
    <div data-testid="dlist-hero">
      <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
        <Icon className="h-3.5 w-3.5" /> Musician <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">in {list.name} · Podcast Index</span>
      </p>
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20 border-2 border-slate-200/80 dark:border-slate-800/80">
          {musician.artwork ? <AvatarImage src={musician.artwork} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>{musician.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link href={podcastIndexHref(musician.name)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover">
              <Icon className="h-3.5 w-3.5" /> Their music here
            </Link>
            {musician.url && (
              <a href={musician.url} target="_blank" rel="noopener" className="text-xs font-medium text-brand-link hover:underline">Support the artist</a>
            )}
            <Chip tone="slate" size="sm">Value-for-value</Chip>
          </div>
        </div>
      </div>
    </div>
  );
}
