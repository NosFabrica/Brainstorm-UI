/** The Live tab's three shelves — Live · Upcoming · Replays — and what must answer before a stream shows. */
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { liveNeedsCheck, liveStateOf, type LiveState } from "@/lib/liveStream";

export type LiveStates = ReadonlyMap<string, LiveState | null>;
export type LiveCounts = Record<LiveState, number>;
/** Whether a stream in a state has what that state needs (a replay's recording that answers…). */
export type Proven = (e: NostrEvent, st: LiveState | null | undefined) => boolean;

/** Each hit's state, by id. */
export function liveStatesOf(hits: readonly SearchHit[]): Map<string, LiveState | null> {
  const m = new Map<string, LiveState | null>();
  for (const h of hits) m.set(h.event.id, liveStateOf(h.event));
  return m;
}

/**
 * What must answer before it shows: a replay's recording, and the stream of
 * a "live" a day or more old with no viewers to vouch for it.
 */
export function liveProofUrls(hits: readonly SearchHit[], states: LiveStates): string[] {
  return hits
    .map((h) =>
      states.get(h.event.id) === "replay"
        ? (h.event.tags.find((t) => t[0] === "recording")?.[1] ?? "")
        : states.get(h.event.id) === "live"
          ? (liveNeedsCheck(h.event) ?? "")
          : "",
    )
    .filter(Boolean);
}

/** A stream shows on its shelf once what it needs has answered (`verified`: the urls that did). */
export function provenBy(verified: ReadonlySet<string>): Proven {
  return (e, st) => {
    if (st === "replay") return verified.has(e.tags.find((t) => t[0] === "recording")?.[1] ?? "");
    if (st === "live") {
      const url = liveNeedsCheck(e);
      return !url || verified.has(url);
    }
    return st === "upcoming";
  };
}

/** How many streams each shelf holds. */
export function liveCounts(hits: readonly SearchHit[], states: LiveStates, proven: Proven): LiveCounts {
  const c = { live: 0, upcoming: 0, replay: 0 };
  for (const h of hits) {
    const st = states.get(h.event.id);
    if (st && proven(h.event, st)) c[st] += 1;
  }
  return c;
}

/** The shelf shown: the one picked, else Live when anyone is on, else what there is. */
export function liveShelfOf(picked: LiveState | null, c: LiveCounts): LiveState {
  return picked ?? (c.live > 0 ? "live" : c.upcoming > 0 ? "upcoming" : c.replay > 0 ? "replay" : "live");
}

/** One shelf's streams. Live: most watched first, as Twitch orders; upcoming: soonest first; replays: newest. */
export function liveRows(shown: SearchHit[], s: { shelf: LiveState; states: LiveStates; proven: Proven }): SearchHit[] {
  const starts = (e: NostrEvent) => Number(e.tags.find((t) => t[0] === "starts")?.[1]) || 0;
  const viewers = (e: NostrEvent) => Number(e.tags.find((t) => t[0] === "current_participants")?.[1]) || 0;
  shown = shown.filter((h) => {
    const st = s.states.get(h.event.id);
    return st === s.shelf && s.proven(h.event, st);
  });
  return [...shown].sort((a, b) =>
    s.shelf === "live"
      ? viewers(b.event) - viewers(a.event) || b.event.created_at - a.event.created_at
      : s.shelf === "upcoming"
        ? starts(a.event) - starts(b.event)
        : b.event.created_at - a.event.created_at,
  );
}
