/**
 * A person's recent events read for their profile page's shelves, through the
 * same parsers search uses — the page's own inline copies missed their fixes
 * (a track's `c` category shown as its artist).
 */
import { relativeEventTime } from "@/lib/calendarEvent";
import { liveStateOf, parseLiveStream, type LiveStream } from "@/lib/liveStream";
import { isTestTrack, parseTrack, type Track } from "@/lib/trackEvent";

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content: string };

/** Playable tracks, test publications dropped; the genre as the shelf shows it. */
export function profileTracks(events: EventLike[]): Track[] {
  return events
    .filter((ev) => !isTestTrack(ev))
    .map(parseTrack)
    .filter((t): t is Track => t !== null)
    .map((t) => ({ ...t, genre: shelfGenre(t.genre) }));
}

function shelfGenre(genre: string | undefined): string | undefined {
  if (!genre || genre.toLowerCase() === "music") return undefined;
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

export interface ShelfStream extends LiveStream {
  live: boolean;
  timing: string;
}

/** Live now and the next two upcoming, by the Live tab's rule (`liveStateOf`); no replays. */
export function profileLiveStreams(
  events: EventLike[],
  nowSec = Math.floor(Date.now() / 1000),
): { liveNow: ShelfStream[]; upcoming: ShelfStream[]; has: boolean } {
  const shelved = events.flatMap((ev) => {
    const stream = parseLiveStream(ev);
    const state = liveStateOf(ev, nowSec);
    if (!stream || (state !== "live" && state !== "upcoming")) return [];
    const timing =
      stream.startsSec && stream.startsSec >= nowSec
        ? `Starts ${relativeEventTime(stream.startsSec).toLowerCase()}`
        : "Planned";
    return [{ ...stream, live: state === "live", timing }];
  });
  const liveNow = shelved.filter((s) => s.live);
  const upcoming = shelved
    .filter((s) => !s.live)
    .sort((a, b) => a.startsSec - b.startsSec)
    .slice(0, 2);
  return { liveNow, upcoming, has: liveNow.length + upcoming.length > 0 };
}
