/**
 * The Music tab the way Spotify lays music out, with what only Nostr has.
 *
 * Before any words it is a home, not a list: Wavlake's chart — top tracks by
 * sats this week, a value-for-value signal no play count can fake — as cover
 * tiles, genre chips that re-ask the chart, and the newest native tracks as
 * the queue. With words it is grouped: a Top result (the artist when a name
 * matches, else the best song), Songs as rows from both sources, Artists as
 * faces with their trust rings, Albums as Wavlake tiles. One Play starts the
 * whole queue; a slim bar at the bottom says what is playing.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2, Pause, Play } from "lucide-react";
import type { SearchHit } from "@/services/search";
import { parseTrack, type Track } from "@/lib/trackEvent";
import { WAVLAKE_GENRES, type WavlakeAlbum, type WavlakeArtist, type WavlakeSong } from "@/lib/wavlake";
import { useWavlakeTrending } from "@/hooks/useWavlakeTrending";
import { playFrom, setPlaylist, toggleTrack, useTrackPlayer } from "@/lib/audioPlayer";
import { TrackCard, WavlakeSongCard } from "@/components/search/cards";
import { FacetChip, FacetRow } from "@/components/search/sections";
import { SectionHeader } from "@/components/ui/section-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { compactCount } from "@/lib/compactCount";
import { nameMatchScore } from "@/lib/nameMatch";
import { profileHrefOf } from "@/lib/upNext";
import { eventPath } from "@/lib/shareId";
import audioDefault from "@/assets/audio-default.webp";

type NativeTrack = { hit: SearchHit; track: Track };

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const GENRE_LABEL: Record<string, string> = { "hip-hop": "Hip-hop" };
const genreLabel = (g: string) => GENRE_LABEL[g] ?? g.charAt(0).toUpperCase() + g.slice(1);
/** Every genre a track claims — `t` and `genre` tags, lower-cased, `#` dropped. */
const genresOf = (t: NativeTrack) =>
  Array.from(new Set(t.hit.event.tags.filter((x) => (x[0] === "t" || x[0] === "genre") && x[1]).map((x) => x[1].replace(/^#/, "").trim().toLowerCase()).filter(Boolean)));

export function MusicResults({
  hits,
  query,
  wavlake,
  scoreOf,
  onOpenProfile,
}: {
  hits: SearchHit[];
  query: string;
  wavlake: { artists: WavlakeArtist[]; albums: WavlakeAlbum[]; songs: WavlakeSong[]; loading: boolean };
  scoreOf: (pubkey: string) => number | null | undefined;
  onOpenProfile: (result: SearchResult) => void;
}) {
  const browsing = query.trim() === "";
  const tracks = useMemo<NativeTrack[]>(
    () => hits.map((hit) => ({ hit, track: parseTrack(hit.event) })).filter((t): t is NativeTrack => t.track !== null),
    [hits],
  );

  // One genre at a time; the words change, the choice resets.
  const [genre, setGenre] = useState<string | null>(null);
  useEffect(() => setGenre(null), [query]);
  const trending = useWavlakeTrending(genre, browsing);

  // With words, the chips are the results' own genres — only ones two or more
  // tracks share, so a one-off tag never becomes a button.
  const genreFacets = useMemo<{ key: string; count: number }[]>(() => {
    if (browsing) return WAVLAKE_GENRES.map((g) => ({ key: g, count: 0 }));
    const counts = new Map<string, number>();
    for (const t of tracks) for (const g of genresOf(t)) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, count]) => ({ key, count }));
  }, [browsing, tracks]);
  const shownTracks = useMemo(() => (browsing || !genre ? tracks : tracks.filter((t) => genresOf(t).includes(genre))), [browsing, genre, tracks]);

  // The page is the queue, in the order it is shown; the app's bar knows every
  // track on it by name, cover and page.
  const queue = useMemo(() => {
    const native = shownTracks.map((t) => ({ id: t.track.id, src: t.track.audio, title: t.track.title, artist: t.track.artist ?? (t.hit.author ? getDisplayLabel(t.hit.author) : undefined), cover: t.track.cover, href: eventPath(t.hit.event), artistHref: t.hit.author ? `/p/${t.hit.author.npub}` : undefined, artistPubkey: t.hit.event.pubkey }));
    const remote = (browsing ? trending.songs : wavlake.songs).map((s) => ({ id: s.id, src: s.audio, title: s.title, artist: s.artist, cover: s.cover, href: s.url, artistHref: profileHrefOf(s.artistNpub) }));
    return browsing ? [...remote, ...native] : [...native, ...remote];
  }, [browsing, shownTracks, trending.songs, wavlake.songs]);
  useEffect(() => {
    setPlaylist(queue);
  }, [queue]);

  // Artists: the tracks' authors, most songs first, then Wavlake's.
  const authors = useMemo(() => {
    const byPk = new Map<string, { author: SearchResult; count: number; first: NativeTrack }>();
    for (const t of tracks) {
      if (!t.hit.author) continue;
      const cur = byPk.get(t.hit.author.pubkey);
      if (cur) cur.count += 1;
      else byPk.set(t.hit.author.pubkey, { author: t.hit.author, count: 1, first: t });
    }
    return [...byPk.values()].sort((a, b) => b.count - a.count);
  }, [tracks]);

  // Top result: the artist when a NAME answers to the words (by words, never
  // inside one — "nova" is not Freddy Donovan), the person on Nostr before the
  // catalogue at equal strength; else the best song.
  const top = useMemo(() => {
    if (browsing) return null;
    const author = authors.map((a) => ({ a, score: nameMatchScore(getDisplayLabel(a.author), query) })).filter((x) => x.score > 0).sort((x, y) => y.score - x.score)[0];
    const remote = wavlake.artists.map((a) => ({ a, score: nameMatchScore(a.name, query) })).filter((x) => x.score > 0).sort((x, y) => y.score - x.score)[0];
    if (author && (!remote || author.score >= remote.score)) {
      const { a } = author;
      return { kind: "artist" as const, name: getDisplayLabel(a.author), image: a.author.picture, sub: `Artist · ${a.count} ${a.count === 1 ? "song" : "songs"}`, author: a.author, playId: a.first.track.id, score: scoreOf(a.author.pubkey) ?? null };
    }
    if (remote) {
      const { a } = remote;
      const first = wavlake.songs.find((s) => normalise(s.artist) === normalise(a.name)) ?? wavlake.songs[0];
      return { kind: "artist" as const, name: a.name, image: a.artworkUrl, sub: "Artist · Wavlake", href: a.url, external: true, playId: first?.id, score: null as number | null };
    }
    const first = shownTracks[0];
    if (first) return { kind: "song" as const, name: first.track.title, image: first.track.cover, sub: first.track.artist ?? (first.hit.author ? getDisplayLabel(first.hit.author) : "Song"), href: eventPath(first.hit.event), external: false, playId: first.track.id, score: null as number | null };
    const song = wavlake.songs[0];
    if (song) return { kind: "song" as const, name: song.title, image: song.cover, sub: `${song.artist} · Wavlake`, href: song.url, external: true, playId: song.id, score: null as number | null };
    return null;
  }, [browsing, query, wavlake.artists, wavlake.songs, authors, shownTracks, scoreOf]);

  const songCount = shownTracks.length + (browsing ? 0 : wavlake.songs.length);

  return (
    <div data-testid="music-results">
      {genreFacets.length > 0 && (
        <FacetRow className="mb-3" testId="music-genres">
          <FacetChip pressed={genre === null} onClick={() => setGenre(null)} testId="music-genre-all">
            All
          </FacetChip>
          {genreFacets.map((g) => (
            <FacetChip key={g.key} pressed={genre === g.key} onClick={() => setGenre((cur) => (cur === g.key ? null : g.key))} count={g.count || undefined} testId={`music-genre-${g.key}`}>
              {genreLabel(g.key)}
            </FacetChip>
          ))}
        </FacetRow>
      )}

      {browsing ? (
        <>
          {(trending.loading || trending.songs.length > 0) && (
            <MusicSection title="Trending on Wavlake" hint={genre ? `${genreLabel(genre)} · by sats` : "by sats this week"} testId="music-trending">
              <TileGrid>
                {trending.loading && trending.songs.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => <TileSkeleton key={i} />)
                  : trending.songs.map((song) => <SongTile key={song.id} song={song} />)}
              </TileGrid>
            </MusicSection>
          )}
          {shownTracks.length > 0 && (
            <MusicSection title="New on Nostr" testId="music-new" action={<PlayAll onClick={() => playFrom(shownTracks[0].track.id)} />}>
              <Rows>
                {shownTracks.map((t) => (
                  <TrackCard key={t.hit.event.id} event={t.hit.event} author={t.hit.author} score={scoreOf(t.hit.event.pubkey)} flat />
                ))}
              </Rows>
            </MusicSection>
          )}
        </>
      ) : (
        <>
          {top && <TopResult {...top} onOpenProfile={onOpenProfile} />}
          {songCount > 0 && (
            <MusicSection title="Songs" count={songCount} testId="music-songs" action={<PlayAll onClick={() => playFrom(queue[0]?.id)} />}>
              <Rows>
                {shownTracks.map((t) => (
                  <TrackCard key={t.hit.event.id} event={t.hit.event} author={t.hit.author} score={scoreOf(t.hit.event.pubkey)} flat />
                ))}
                {wavlake.songs.map((song) => (
                  <WavlakeSongCard key={song.id} song={song} flat />
                ))}
              </Rows>
            </MusicSection>
          )}
          {(authors.length > 0 || wavlake.artists.length > 0) && (
            <MusicSection title="Artists" testId="music-artists">
              <FacetRow testId="music-artists-strip" className="gap-4 pb-2">
                {authors.map((a) => (
                  <ArtistFace key={a.author.pubkey} name={getDisplayLabel(a.author)} image={a.author.picture} score={scoreOf(a.author.pubkey) ?? null} sub={`${a.count} ${a.count === 1 ? "song" : "songs"}`} onClick={() => onOpenProfile(a.author)} testId={`music-artist-${a.author.pubkey.slice(0, 8)}`} />
                ))}
                {wavlake.artists.map((a) => (
                  <ArtistFace key={a.id} name={a.name} image={a.artworkUrl} score={null} sub="Wavlake" href={a.url} testId={`music-artist-wavlake-${a.id}`} />
                ))}
              </FacetRow>
            </MusicSection>
          )}
          {wavlake.albums.length > 0 && (
            <MusicSection title="Albums" hint="on Wavlake" testId="music-albums">
              <TileGrid>
                {wavlake.albums.map((al) => (
                  <a key={al.id} href={al.url} target="_blank" rel="noopener noreferrer" className="group block min-w-0" data-testid={`music-album-${al.id}`}>
                    <Cover src={al.artworkUrl} />
                    <p className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-brand-link">{al.title}</p>
                    {al.artist && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{al.artist}</p>}
                  </a>
                ))}
              </TileGrid>
            </MusicSection>
          )}
        </>
      )}
    </div>
  );
}

function MusicSection({ title, hint, count, action, testId, children }: { title: string; hint?: string; count?: number; action?: React.ReactNode; testId: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0" data-testid={testId}>
      <div className="mb-2 flex items-center gap-2">
        <SectionHeader variant="title" kicker={title} className="shrink-0" />
        {count != null && <span className="text-sm text-slate-400 dark:text-slate-500">{count}</span>}
        {hint && <span className="truncate text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

/** Spotify's one big button: start the list from the top. */
function PlayAll({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-primary pl-2.5 pr-3 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-[1.03]"
      data-testid="music-play-all"
    >
      <Play className="h-3.5 w-3.5 fill-current" />
      Play
    </button>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-slate-100 dark:divide-slate-800/60">{children}</div>;
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function Cover({ src, className = "" }: { src?: string; className?: string }) {
  return (
    <div className={`relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 ${className}`}>
      <img
        src={src || audioDefault}
        alt=""
        loading="lazy"
        onError={(e) => { if (!e.currentTarget.src.includes("audio-default")) e.currentTarget.src = audioDefault; }}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </div>
  );
}

function TileSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="mt-1.5 h-2.5 w-1/2 rounded-full bg-slate-100 dark:bg-slate-800/70" />
    </div>
  );
}

/** A cover tile: the art is the play button, the title opens the song's page. */
function SongTile({ song }: { song: WavlakeSong }) {
  const player = useTrackPlayer(song.id);
  return (
    <div className="group min-w-0" data-testid={`music-tile-${song.id}`}>
      <div className="relative">
        <Cover src={song.cover} />
        <button
          type="button"
          onClick={() => toggleTrack(song.id, song.audio)}
          className={`absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-link shadow-md ring-1 ring-black/5 transition-all ${player.isActive ? "opacity-100" : "opacity-0 translate-y-1 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
          aria-label={player.isPlaying ? "Pause" : "Play"}
        >
          {player.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : player.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
        </button>
      </div>
      <a href={song.url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
        <p className={`truncate text-sm font-medium ${player.isActive ? "text-brand-link" : "text-slate-900 dark:text-slate-100"}`}>{song.title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{song.artist}</p>
      </a>
      {song.sats != null && song.sats > 0 && (
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{compactCount(song.sats)} sats</p>
      )}
    </div>
  );
}

function ArtistFace({ name, image, score, sub, onClick, href, testId }: { name: string; image?: string; score: number | null; sub: string; onClick?: () => void; href?: string; testId: string }) {
  const tierRing = useTierRing();
  const ring = tierRing(score, false, "md", true) ?? "";
  const body = (
    <>
      <Avatar className={`h-16 w-16 border-2 border-slate-200/80 dark:border-slate-800/80 ${ring}`}>
        {image ? <AvatarImage src={image} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <p className="mt-1.5 w-full truncate text-center text-xs font-medium text-slate-900 dark:text-slate-100">{name}</p>
      <p className="w-full truncate text-center text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>
    </>
  );
  const cls = "flex w-20 shrink-0 flex-col items-center rounded-xl p-1 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} data-testid={testId}>{body}</a>
  ) : (
    <button type="button" onClick={onClick} className={cls} data-testid={testId}>{body}</button>
  );
}

function TopResult({
  kind,
  name,
  image,
  sub,
  href,
  external,
  author,
  playId,
  score,
  onOpenProfile,
}: {
  kind: "artist" | "song";
  name: string;
  image?: string;
  sub: string;
  href?: string;
  external?: boolean;
  author?: SearchResult;
  playId?: string;
  score: number | null;
  onOpenProfile: (r: SearchResult) => void;
}) {
  const player = useTrackPlayer(playId ?? "");
  const tierRing = useTierRing();
  const ring = kind === "artist" ? tierRing(score, false, "md", true) ?? "" : "";
  const art = kind === "artist" ? (
    <Avatar className={`h-24 w-24 border-2 border-slate-200/80 dark:border-slate-800/80 ${ring}`}>
      {image ? <AvatarImage src={image} alt="" className="object-cover" /> : null}
      <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
    </Avatar>
  ) : (
    <Cover src={image} className="h-24 w-24" />
  );
  const open = author ? () => onOpenProfile(author) : undefined;
  const title = author ? (
    <button type="button" onClick={open} className="text-left hover:underline">{name}</button>
  ) : href && external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{name}</a>
  ) : href ? (
    <Link href={href} className="hover:underline">{name}</Link>
  ) : (
    name
  );
  return (
    <section className="mb-4 flex items-center gap-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/60 sm:p-4" data-testid="music-top-result" data-kind={kind}>
      <div className="group shrink-0">{art}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{kind === "artist" ? "Artist" : "Song"}</p>
        <h3 className="mt-0.5 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
      {playId && (
        <button
          type="button"
          onClick={() => playFrom(playId)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white shadow-md transition-transform hover:scale-105"
          aria-label={player.isPlaying ? "Pause" : "Play"}
          data-testid="music-top-play"
        >
          {player.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : player.isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-[1px] fill-current" />}
        </button>
      )}
    </section>
  );
}
