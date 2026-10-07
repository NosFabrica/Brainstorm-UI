/**
 * The pages of things that are collections of other things: a NIP-52
 * calendar (its events), a NIP-58 badge (the people awarded it), a NIP-51
 * emoji pack (every emoji), and a music playlist or album (its tracks,
 * playable). Each hero says what the collection is; the section below is the
 * collection itself, looked up on the network.
 */
import { useState } from "react";
import { Award, CalendarDays, Check, Disc3, MapPin, Smile } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Chip } from "@/components/ui/chip";
import { ReadingText } from "@/components/share/ReadingText";
import { EventCard, TrackCard } from "@/components/search/cards";
import { EventDateTile } from "@/components/share/EventDateTile";
import type { SearchResult } from "@/lib/profileSearch";
import { ThingCard } from "@/components/search/thingCards";
import { fetchByAddress, fetchFromSearch } from "@/services/search";
import { isOver, parseCalendarEvent } from "@/lib/calendarEvent";
import { parseTrack } from "@/lib/trackEvent";
import { copyToClipboard } from "@/lib/clipboard";
import type { Thing } from "@/lib/thing";
import type { Detail } from "./types";
import {
  Kicker,
  PageTitle,
  PeopleRoster,
  Section,
  SectionNote,
  useFetched,
  type PageEvent,
  SafeImg,
  useAuthors,
} from "./shared";
import { EmojiText } from "@/components/ui/custom-emoji";

const dOf = (e: PageEvent) => e.tags.find((t) => t[0] === "d")?.[1] ?? "";
const addressOf = (e: PageEvent) => `${e.kind}:${e.pubkey}:${dOf(e)}`;
/** `kind:pubkey:d` with the pubkey lower-cased — how fetchByAddress keys what it found. */
const normalCoord = (c: string) => {
  const [k, pk, ...d] = c.split(":");
  return [k, pk?.toLowerCase(), ...d].join(":");
};
const coordsOf = (e: PageEvent, kinds: number[]) =>
  e.tags.filter((t) => t[0] === "a" && kinds.some((k) => t[1]?.startsWith(`${k}:`))).map((t) => t[1]);

function Topics({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {topics.map((t) => (
        <Chip key={t} size="sm" tone="slate">
          #{t}
        </Chip>
      ))}
    </div>
  );
}

// ——— Calendar ———

export function CalendarHero({ thing, detail }: { thing: Thing; detail: Detail<"calendar"> }) {
  return (
    <div data-testid="thing-page-calendar">
      <div className="flex items-start gap-4">
        <span className="flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <CalendarDays className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <span className="mt-1 text-xl font-bold leading-none text-slate-900 dark:text-slate-100">
            {detail.events}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {detail.events === 1 ? "event" : "events"}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={CalendarDays}>Calendar</Kicker>
          <PageTitle testId="thing-page-title">
            <EmojiText text={thing.title} tags={thing.emoji} />
          </PageTitle>
          {detail.location && (
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {detail.location}
            </p>
          )}
        </div>
        <SafeImg src={thing.image} className="h-20 w-20 shrink-0 rounded-2xl object-cover" fallback={null} />
      </div>
      {thing.description && (
        <ReadingText text={thing.description} tags={thing.emoji} className="mt-4" testId="thing-page-description" />
      )}
      <Topics topics={detail.topics} />
    </div>
  );
}

export function CalendarSections({ event }: { event: PageEvent }) {
  const coords = coordsOf(event, [31922, 31923]);
  const found = useFetched(coords.length ? `calendar-events:${event.id}` : null, () => fetchByAddress(coords));
  const events = found ? [...found.values()] : [];
  const withTime = events.map((e) => ({ e, cal: parseCalendarEvent(e) }));
  const upcoming = withTime
    .filter((x) => x.cal.startSec && !isOver(x.cal))
    .sort((a, b) => a.cal.startSec - b.cal.startSec);
  const past = withTime.filter((x) => !x.cal.startSec || isOver(x.cal)).sort((a, b) => b.cal.startSec - a.cal.startSec);
  const [showPast, setShowPast] = useState(false);
  const authors = useAuthors(events.map((e) => e.pubkey));
  if (coords.length === 0) return null;
  return (
    <>
      <Section title="Upcoming" count={upcoming.length} testId="thing-page-upcoming">
        {found === undefined ? (
          <SectionNote>Opening the calendar…</SectionNote>
        ) : upcoming.length === 0 ? (
          <SectionNote>Nothing coming up on this calendar.</SectionNote>
        ) : (
          <DayList items={upcoming} authors={authors} />
        )}
      </Section>
      {past.length > 0 && (
        <Section
          title="Past"
          count={past.length}
          testId="thing-page-past"
          aside={
            <button
              type="button"
              onClick={() => setShowPast((s) => !s)}
              className="text-xs font-semibold text-brand-link hover:underline"
            >
              {showPast ? "Hide" : "Show"}
            </button>
          }
        >
          {showPast && <DayList items={past} authors={authors} past />}
        </Section>
      )}
    </>
  );
}

/**
 * Events under the day they fall on — the event card leaves the date to the
 * list it sits in (the Events tab's day headers), so this list says it too.
 */
function DayList({
  items,
  authors,
  past = false,
}: {
  items: { e: PageEvent; cal: ReturnType<typeof parseCalendarEvent> }[];
  authors: Map<string, SearchResult>;
  past?: boolean;
}) {
  let last = "";
  return (
    <div className="space-y-2">
      {items.map(({ e, cal }) => {
        const d = cal.startSec ? new Date(cal.startSec * 1000) : null;
        const key = d ? d.toDateString() : "tba";
        const header = key !== last;
        last = key;
        return (
          <div key={e.id}>
            {header && (
              <div className={`flex items-center gap-2.5 pb-1.5 ${items[0].e.id === e.id ? "" : "pt-3"}`}>
                {d ? (
                  <EventDateTile startSec={cal.startSec} past={past} size="sm" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
                )}
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {d
                    ? d.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Date to be announced"}
                </span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
              </div>
            )}
            <EventCard event={e as NostrEvent} author={authors.get(e.pubkey) ?? null} />
          </div>
        );
      })}
    </div>
  );
}

// ——— Badge ———

export function BadgeHero({ thing }: { thing: Thing }) {
  return (
    <div
      className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left"
      data-testid="thing-page-badge"
    >
      <span className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-slate-50 ring-1 ring-slate-900/5 dark:bg-slate-800/60 dark:ring-white/10">
        <SafeImg
          src={thing.image}
          className="h-full w-full object-contain p-3"
          fallback={<Award className="h-12 w-12 text-slate-400 dark:text-slate-500" aria-hidden="true" />}
        />
      </span>
      <div className="mt-4 min-w-0 flex-1 sm:ml-5 sm:mt-2">
        <Kicker icon={Award}>Badge</Kicker>
        <PageTitle testId="thing-page-title">
          <EmojiText text={thing.title} tags={thing.emoji} />
        </PageTitle>
        {thing.description && (
          <ReadingText text={thing.description} tags={thing.emoji} className="mt-3" testId="thing-page-description" />
        )}
      </div>
    </div>
  );
}

export function BadgeSections({ event }: { event: PageEvent }) {
  // NIP-58 awards (kind 8) name the badge by address; their `p` tags are who
  // got it. Only the badge's issuer can award it — an award signed by anyone
  // else is a forgery, so the filter asks for the issuer's alone.
  const awardees = useFetched(`badge-awards:${event.id}`, () =>
    fetchFromSearch([{ kinds: [8], authors: [event.pubkey], "#a": [addressOf(event)] }], { limit: 300 }).then((evs) => [
      ...new Set(
        evs.flatMap((e) => e.tags.filter((t) => t[0] === "p" && /^[0-9a-f]{64}$/i.test(t[1] ?? "")).map((t) => t[1])),
      ),
    ]),
  );
  return (
    <Section title="Awarded to" count={awardees?.length} testId="thing-page-awardees">
      {awardees === undefined ? (
        <SectionNote>Looking for who has earned it…</SectionNote>
      ) : awardees.length === 0 ? (
        <SectionNote>No one has been awarded this badge yet.</SectionNote>
      ) : (
        <PeopleRoster pubkeys={awardees} />
      )}
    </Section>
  );
}

// ——— Emoji pack ———

/** One emoji: the picture large, its shortcode under it; a tap copies `:shortcode:`. */
function EmojiTile({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void copyToClipboard(`:${code}:`).then((ok) => {
          if (!ok) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      title={`Copy :${code}:`}
      className="flex flex-col items-center gap-1 rounded-xl p-2 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:hover:bg-slate-800"
    >
      <span className="flex h-12 w-12 items-center justify-center">
        {failed ? (
          <Smile className="h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden="true" />
        ) : (
          <img
            src={url}
            alt={`:${code}:`}
            loading="lazy"
            className="max-h-12 max-w-12 object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </span>
      <span className="flex w-full items-center justify-center gap-0.5 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
        {copied ? (
          <>
            <Check className="h-3 w-3" aria-hidden="true" /> copied
          </>
        ) : (
          code
        )}
      </span>
    </button>
  );
}

export function EmojiPackHero({ thing, detail }: { thing: Thing; detail: Detail<"emoji"> }) {
  return (
    <div data-testid="thing-page-emoji">
      <Kicker icon={Smile}>Emoji pack · {detail.emoji.length}</Kicker>
      <PageTitle testId="thing-page-title">
        <EmojiText text={thing.title} tags={thing.emoji} />
      </PageTitle>
      {thing.description && (
        <ReadingText text={thing.description} tags={thing.emoji} className="mt-3" testId="thing-page-description" />
      )}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Tap an emoji to copy its shortcode.</p>
      <div
        className="mt-2 grid grid-cols-4 gap-1 rounded-2xl bg-slate-50 p-2 dark:bg-slate-800/40 sm:grid-cols-6 md:grid-cols-8"
        data-testid="thing-page-emoji-grid"
      >
        {detail.emoji.map((e, i) => (
          <EmojiTile key={`${e.code}-${i}`} code={e.code} url={e.url} />
        ))}
      </div>
    </div>
  );
}

export function EmojiPackSections({ event }: { event: PageEvent }) {
  const more = useFetched(`emoji-more:${event.pubkey}`, () =>
    fetchFromSearch([{ kinds: [30030], authors: [event.pubkey] }], { limit: 12 }),
  );
  const others = (more ?? []).filter((e) => e.id !== event.id && dOf(e) !== dOf(event));
  const moreAuthors = useAuthors([event.pubkey]);
  if (others.length === 0) return null;
  return (
    <Section title="More packs from this curator" count={others.length} testId="thing-page-more">
      <div className="space-y-2">
        {others.slice(0, 6).map((e) => (
          <ThingCard key={e.id} event={e} author={moreAuthors.get(e.pubkey) ?? null} />
        ))}
      </div>
    </Section>
  );
}

// ——— Playlist ———

const PLAYLIST_WORD = { album: "Album", ep: "EP", playlist: "Playlist" } as const;

export function PlaylistHero({ thing, detail }: { thing: Thing; detail: Detail<"playlist"> }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end" data-testid="thing-page-playlist">
      <span className="flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 shadow-md ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
        <SafeImg
          src={thing.image}
          className="h-full w-full object-cover"
          fallback={<Disc3 className="h-14 w-14 text-slate-400 dark:text-slate-500" aria-hidden="true" />}
        />
      </span>
      <div className="min-w-0 flex-1">
        <Kicker icon={Disc3}>{PLAYLIST_WORD[detail.variant]}</Kicker>
        <PageTitle testId="thing-page-title">
          <EmojiText text={thing.title} tags={thing.emoji} />
        </PageTitle>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {[detail.artist, detail.tracks > 0 && `${detail.tracks} ${detail.tracks === 1 ? "track" : "tracks"}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {thing.description && (
          <ReadingText text={thing.description} tags={thing.emoji} className="mt-3" testId="thing-page-description" />
        )}
      </div>
    </div>
  );
}

export function PlaylistSections({ event, detail }: { event: PageEvent; detail: Detail<"playlist"> }) {
  const coords = event.tags.filter((t) => t[0] === "a" && t[1]).map((t) => t[1]);
  const found = useFetched(coords.length ? `playlist-tracks:${event.id}` : null, () => fetchByAddress(coords));
  // In the playlist's own order; a track the network does not have is skipped,
  // and counted. fetchByAddress keys by lower-case pubkey; a track listed twice
  // plays twice.
  const tracks = found
    ? coords.map((c) => found.get(normalCoord(c))).filter((e): e is NostrEvent => !!e && parseTrack(e) !== null)
    : [];
  const missing = found ? coords.length - tracks.length : 0;
  if (coords.length === 0 && detail.trackLines.length === 0) return null;
  return (
    <Section title="Tracks" count={tracks.length || undefined} testId="thing-page-tracks">
      {found === undefined && coords.length > 0 ? (
        <SectionNote>Loading the tracks…</SectionNote>
      ) : tracks.length > 0 ? (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-2 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {tracks.map((e, i) => (
            <TrackCard key={`${e.id}-${i}`} event={e} author={null} flat />
          ))}
        </div>
      ) : detail.trackLines.length === 0 ? (
        <SectionNote>None of these tracks are on the search relay yet.</SectionNote>
      ) : (
        <ol className="space-y-1 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {detail.trackLines.map((l, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-4 text-right tabular-nums text-slate-400">{i + 1}</span>
              {l}
            </li>
          ))}
        </ol>
      )}
      {missing > 0 && tracks.length > 0 && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {missing} {missing === 1 ? "track isn't" : "tracks aren't"} on the search relay yet.
        </p>
      )}
    </Section>
  );
}
