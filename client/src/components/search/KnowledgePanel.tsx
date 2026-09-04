/**
 * The Google-anatomy knowledge panel: when a query strongly matches one
 * person, their card anchors the right rail (desktop) or tops the results
 * (mobile) — avatar with tier ring, identity rows, and the deep-dive CTA.
 * Probed via the same relay typeahead the box uses; silent unless confident.
 */
import { useEffect, useState } from "react";
import { fetchLiveStreams, fetchRecentByKinds } from "@/services/nostr";
import { pickStreams, verifyRecording, type PickedStreams } from "@/lib/liveStream";
import { PanelLive } from "@/components/search/PanelLive";
import { PanelLatestMedia } from "@/components/search/PanelMedia";
import { parseTrack, TRACK_KIND, type Track } from "@/lib/trackEvent";
import { findWavlakeArtist, wavlakeArtistTracks, type WavlakeArtist, type WavlakeSong } from "@/lib/wavlake";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { Link, useLocation } from "wouter";
import { ArrowRight, BookOpen, Check, Hash, Package, Users, Zap } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing, TierWordChip } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { FlaggedChip, FollowedByLine, PanelIdentityChip, PanelVouches } from "@/components/search/EndorsementLine";
import { ZapModal } from "@/components/ZapModal";
import { visiblePersonSets } from "@/services/endorsements";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { eventPath } from "@/lib/shareId";
import { parseCalendarEvent, relativeEventTime } from "@/lib/calendarEvent";
import { EventDateTile } from "@/components/share/EventDateTile";
import { filterEventsByWhen } from "@/lib/eventFilters";
import { fetchNipPage, fetchPersonSets, searchStream, suggestProfiles, type PersonSetMembership, type SearchHit, type SearchPov } from "@/services/search";

/** One app in the rail: icon, name, summary. Reviews live on the app page —
 *  no review copy on search surfaces (Benjamin). */
function AppRailRow({ event }: { event: NostrEvent }) {
  const name = event.tags.find((t) => t[0] === "name")?.[1] ?? "App";
  const icon = event.tags.find((t) => t[0] === "icon")?.[1];
  const summary = event.tags.find((t) => t[0] === "summary")?.[1];
  return (
    <li>
      <Link
        href={eventPath(event)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        data-testid={`apps-panel-app-${event.id}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          {icon ? <img src={icon} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-slate-400" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{name}</span>
          {summary && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{summary}</span>}
        </span>
      </Link>
    </li>
  );
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** EXACT name match only. Prefix matching promoted "LiverpoolHODL" as THE
 *  match for "liverpool" — a name-alike is not the entity. */
export function isStrongMatch(query: string, person: SearchResult): boolean {
  const q = norm(query);
  if (q.length < 2) return false;
  const names = [person.name, person.displayName].filter(Boolean).map((n) => norm(n as string));
  return names.some((n) => n === q);
}

/** Plain words only — a query carrying syntax tokens or a #tag is a search,
 *  not a person lookup, and gets no probe at all. */
export function isPanelableQuery(query: string): boolean {
  const q = query.trim();
  return q.length >= 2 && !/(^|\s)#/.test(q) && !/\S+:\S+/.test(q);
}

/** "nip-46" / "nip 5" / "NIP05" — a spec lookup, with the wiki's spellings. */
export function nipCandidates(query: string): string[] {
  const m = query.trim().match(/^nip[-\s]?(\d{1,4})$/i);
  if (!m) return [];
  const n = m[1];
  const ds = [`nip-${n}`];
  if (n.length === 1) ds.push(`nip-0${n}`);
  return ds;
}

/** The first real paragraph of a wiki page — markdown headings stripped. */
function specExcerpt(content: string): string {
  const para = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !/^#{1,6}\s/.test(b));
  return (para ?? "").replace(/\s+/g, " ").slice(0, 300);
}

/** A query that could be a hashtag: one plain word, no syntax. */
function tagCandidate(query: string): string | null {
  const q = query.trim().toLowerCase();
  return /^[a-z0-9_]{2,}$/.test(q) ? q : null;
}

const TOPIC_MIN_NOTES = 3;
// Only a LIVING topic earns the slot — stale tags don't outrank people.
const TOPIC_FRESH_SECONDS = 7 * 86400;

export function KnowledgePanel({
  query,
  pov,
  userPubkey,
  onOpen,
  onPerson,
  className = "",
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  /** Who the panel settled on (null when it did not) — the results page leads with their own media. */
  onPerson?: (person: SearchResult | null) => void;
  onOpen?: (person: SearchResult) => void;
  className?: string;
}) {
  const tierRing = useTierRing();
  const [person, setPerson] = useState<SearchResult | null>(null);
  const [topicHits, setTopicHits] = useState<SearchHit[] | null>(null);
  const [nipPage, setNipPage] = useState<NostrEvent | null>(null);
  const [appHits, setAppHits] = useState<SearchHit[] | null>(null);
  // Upcoming calendar events that name the query — Google's panel lists a few.
  const [topicEvents, setTopicEvents] = useState<SearchHit[] | null>(null);
  const [personSets, setPersonSets] = useState<PersonSetMembership[]>([]);
  // The person's own songs — kind 31337 by author, the three newest that
  // actually are songs (the kind is abused; see lib/trackEvent).
  const [personTracks, setPersonTracks] = useState<Track[]>([]);
  useEffect(() => {
    onPerson?.(person);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.pubkey]);
  // …and failing those, the Wavlake artist who is this person: by linked
  // key first, exact name second, never a loose match.
  const [personWavlake, setPersonWavlake] = useState<{ artist: WavlakeArtist; songs: WavlakeSong[] } | null>(null);
  // Their stream: live now leads the panel; otherwise when they last streamed.
  const [personStreams, setPersonStreams] = useState<PickedStreams>({ live: null, upcoming: null, replay: null });
  // Their latest posts that carry media — videos attached, podcast links.
  const [personRecent, setPersonRecent] = useState<NostrEvent[]>([]);
  useEffect(() => {
    if (!person) {
      setPersonRecent([]);
      return;
    }
    let cancelled = false;
    fetchRecentByKinds(person.pubkey, [1, 21, 22, 34235, 34236], 40)
      .then((events) => {
        if (!cancelled) setPersonRecent(events as NostrEvent[]);
      })
      .catch(() => {
        if (!cancelled) setPersonRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [person?.pubkey]);
  useEffect(() => {
    if (!person) {
      setPersonStreams({ live: null, upcoming: null, replay: null });
      return;
    }
    let cancelled = false;
    fetchLiveStreams(person.pubkey)
      .then(async (events) => {
        const picked = pickStreams(events);
        // A replay is advertised only after its recording answered.
        if (picked.replay && !(await verifyRecording(picked.replay.recording as string))) picked.replay = null;
        if (!cancelled) setPersonStreams(picked);
      })
      .catch(() => {
        if (!cancelled) setPersonStreams({ live: null, upcoming: null, replay: null });
      });
    return () => {
      cancelled = true;
    };
  }, [person?.pubkey]);

  useEffect(() => {
    if (!person) {
      setPersonTracks([]);
      return;
    }
    let cancelled = false;
    setPersonWavlake(null);
    const wavlakeFallback = async () => {
      const artist = await findWavlakeArtist({ name: person.displayName || person.name, pubkey: person.pubkey });
      if (!artist || cancelled) return;
      const songs = await wavlakeArtistTracks(artist.id, 3);
      if (!cancelled && songs.length > 0) setPersonWavlake({ artist, songs });
    };
    fetchRecentByKinds(person.pubkey, [TRACK_KIND], 6)
      .then((events) => {
        if (cancelled) return;
        const native = events.map(parseTrack).filter((tr): tr is Track => tr !== null).slice(0, 3);
        setPersonTracks(native);
        if (native.length === 0) return wavlakeFallback();
      })
      .catch(() => {
        if (!cancelled) setPersonTracks([]);
        return wavlakeFallback();
      })
      .catch(() => {
        /* Wavlake down: no row */
      });
    return () => {
      cancelled = true;
    };
  }, [person?.pubkey]);

  useEffect(() => {
    setPerson(null);
    setTopicHits(null);
    setNipPage(null);
    setAppHits(null);
    setTopicEvents(null);
    setPersonSets([]);
    if (!isPanelableQuery(query)) return;
    let alive = true;
    // A NIP-shaped query is a spec lookup, not a person or topic hunt —
    // the wiki page (kind 30818) takes the slot and nothing else probes.
    const nips = nipCandidates(query);
    if (nips.length > 0) {
      void fetchNipPage(nips).then((page) => {
        if (alive) setNipPage(page);
      });
      return () => {
        alive = false;
      };
    }
    // Both probes in parallel; the render gives an ACTIVE topic priority —
    // a Liverpool fan searching "liverpool" wants the topic, not whichever
    // account happens to carry the name.
    const tag = tagCandidate(query);
    const cancelTopic = tag
      ? searchStream(`#${tag}`, { tab: "notes", pov, userPubkey, limit: 24 }, (snapshot) => {
          if (!alive || !snapshot.eose) return;
          const fresh = snapshot.hits.some(
            (h) => h.event.created_at >= Date.now() / 1000 - TOPIC_FRESH_SECONDS,
          );
          if (snapshot.hits.length >= TOPIC_MIN_NOTES && fresh) setTopicHits(snapshot.hits);
        })
      : null;
    // Apps whose NAME matches the words ride the rail too (Google's app
    // sidebar) — fuzzy strays with unrelated names are filtered out.
    const q = norm(query);
    const cancelApps = searchStream(query, { tab: "apps", pov, userPubkey, limit: 6 }, (snapshot) => {
      if (!alive || !snapshot.eose) return;
      const matched = snapshot.hits.filter((h) => {
        const name = norm(h.event.tags.find((t) => t[0] === "name")?.[1] ?? "");
        return !!name && (name.includes(q) || q.includes(name));
      });
      if (matched.length > 0) setAppHits(matched.slice(0, 3));
    });
    // Events probe (Benjamin: "like a Google events feel — real and
    // relevant, not forced"): upcoming only, soonest first, and the query
    // must actually appear in the event's title, place or summary — the
    // relay's fuzzy text match alone would drag in strays.
    const cancelEvents = searchStream(`${query} sort:recent`, { tab: "events", pov, userPubkey, limit: 60 }, (snapshot) => {
      if (!alive || !snapshot.eose) return;
      const named = snapshot.hits.filter((h) => {
        const cal = parseCalendarEvent(h.event);
        return norm(`${cal.title} ${cal.location ?? ""} ${cal.summary ?? ""}`).includes(q);
      });
      const upcoming = filterEventsByWhen(named, "upcoming");
      if (upcoming.length > 0) setTopicEvents(upcoming.slice(0, 3));
    });
    void suggestProfiles(query, { pov, userPubkey }, { limit: 3 }).then((people) => {
      if (!alive) return;
      const top = people[0];
      if (top && isStrongMatch(query, top)) {
        setPerson(top);
        // Staging's tag badges, our social-proof twist: how many exporters'
        // follow sets vouch for this person, per tag.
        void fetchPersonSets(top.pubkey).then((sets) => {
          if (alive) setPersonSets(sets);
        });
      }
    });
    return () => {
      alive = false;
      cancelTopic?.();
      cancelApps();
      cancelEvents();
    };
  }, [query, pov, userPubkey]);

  // Relay hits carry no rank numbers (order-only wire) — the panel's ring,
  // coin and tier word feed from the shared author-score cache like every card.
  const scoreOf = useAuthorScores(person && person.wotRank == null ? [person.pubkey] : []);
  // A follow-set badge needs two publishers agreeing on the title — one
  // account's private list names stay out (Benjamin's "Plebs · 1" catch).
  const shownSets = visiblePersonSets(personSets);
  // A badge opens ONE list's page: the most trusted publisher's.
  const exporterScoreOf = useAuthorScores(shownSets.flatMap((s) => s.exporterPubkeys));
  const bestSetOf = (m: PersonSetMembership) =>
    [...m.sets].sort((a, b) => (exporterScoreOf(b.pubkey) ?? -1) - (exporterScoreOf(a.pubkey) ?? -1))[0];
  const [, navigate] = useLocation();
  const [zapOpen, setZapOpen] = useState(false);
  // Google's knowledge panel is one click-through to the entity; the links
  // inside keep their own targets. Ours opens the public profile.
  const openProfile = (ev: React.MouseEvent | React.KeyboardEvent) => {
    if (!person) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest("a, button")) return;
    onOpen?.(person);
    navigate(`/p/${person.npub}`);
  };
  // Topic voices wear the same rings as every avatar in the app.
  const voiceScoreOf = useAuthorScores(
    topicHits ? [...new Set(topicHits.map((h) => h.event.pubkey))].slice(0, 8) : [],
  );

  let main: JSX.Element | null = null;
  if (nipPage) {
    const d = nipPage.tags.find((t) => t[0] === "d")?.[1] ?? query.trim();
    const heading = d.toUpperCase();
    const title = nipPage.tags.find((t) => t[0] === "title")?.[1];
    const excerpt = specExcerpt(nipPage.content);
    main = (
      <aside
        className={`w-full rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5`}
        data-testid="search-nip-panel"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/10">
            <BookOpen className="h-5 w-5 text-brand-primary" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
              {heading}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {title && title.toLowerCase() !== d.toLowerCase() ? title : "Nostr protocol spec"}
            </p>
          </div>
        </div>
        {excerpt && (
          <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300 break-words line-clamp-5">
            {excerpt}
          </p>
        )}
        <Link
          href={eventPath(nipPage)}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
          data-testid="nip-panel-read"
        >
          Read the spec <ArrowRight className="h-3 w-3" />
        </Link>
      </aside>
    );
  } else if (topicHits) {
    const tag = tagCandidate(query)!;
    // Unique by pubkey, then by display name — three RSS-bot accounts all
    // named "Gazeta Esportiva" are one voice to a reader.
    const voices = [
      ...new Map(
        [...new Map(topicHits.filter((h) => h.author).map((h) => [h.event.pubkey, h.author!])).values()].map(
          (v) => [getDisplayLabel(v), v] as const,
        ),
      ).values(),
    ].slice(0, 4);
    const voiceCount = new Set(topicHits.map((h) => h.event.pubkey)).size;
    const newest = Math.max(...topicHits.map((h) => h.event.created_at));
    const daysAgo = Math.floor((Date.now() / 1000 - newest) / 86400);
    // Tags that ride along on these notes — a topic's neighborhood. Needs
    // to recur (≥2 notes) to count; the searched tag itself stays out.
    const tagFreq = new Map<string, number>();
    for (const h of topicHits) {
      const seen = new Set<string>();
      for (const t of h.event.tags) {
        if (t[0] !== "t" || !t[1]) continue;
        const v = t[1].toLowerCase();
        if (v === tag || seen.has(v)) continue;
        seen.add(v);
        tagFreq.set(v, (tagFreq.get(v) ?? 0) + 1);
      }
    }
    const related = [...tagFreq.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([v]) => v);
    main = (
      <aside
        className={`w-full rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5`}
        data-testid="search-topic-panel"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/10">
            <Hash className="h-5 w-5 text-brand-primary" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
              #{tag}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {daysAgo <= 1 ? "Active today" : daysAgo <= 7 ? "Active this week" : "Topic on Nostr"}
            </p>
          </div>
        </div>
        {/* What "active" means, in numbers the probe already paid for. */}
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300" data-testid="topic-activity">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {topicHits.length}{topicHits.length >= 24 ? "+" : ""}
          </span>{" "}
          recent notes ·{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{voiceCount}</span>{" "}
          {voiceCount === 1 ? "voice" : "voices"}
        </p>
        {voices.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Voices on it</p>
            {/* Named, tappable rows — a face without a name fills nothing. */}
            <ul className="mt-1.5 space-y-0.5">
              {voices.map((v) => (
                <li key={v.pubkey}>
                  <Link
                    href={`/p/${v.npub}`}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    data-testid={`topic-voice-${v.pubkey}`}
                  >
                    <Avatar
                      className={`h-6 w-6 shrink-0 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(v.wotRank ?? voiceScoreOf(v.pubkey) ?? null, false, "sm", true) ?? ""}`}
                    >
                      {v.picture ? <AvatarImage src={v.picture} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="overflow-hidden">
                        <DefaultAvatarImg />
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                      {getDisplayLabel(v)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {topicEvents && topicEvents.length > 0 && (
          <div className="mt-3" data-testid="topic-events">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Upcoming events</p>
            <ul className="mt-1.5 space-y-0.5">
              {topicEvents.map((h) => {
                const cal = parseCalendarEvent(h.event);
                return (
                  <li key={h.event.id}>
                    <Link
                      href={eventPath(h.event)}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      data-testid={`topic-event-${h.event.id}`}
                    >
                      <EventDateTile startSec={cal.startSec} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{cal.title}</span>
                        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {relativeEventTime(cal.startSec)}
                          {cal.location ? ` · ${cal.location}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link
              href={`/?q=${encodeURIComponent(query)}&t=events`}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-link hover:underline"
              data-testid="topic-events-more"
            >
              More events <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
        {related.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Related topics</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {related.map((r) => (
                <Link
                  key={r}
                  href={`/?q=${encodeURIComponent(`#${r}`)}`}
                  className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 hover:text-brand-deep dark:hover:text-white transition-colors"
                  data-testid={`topic-related-${r}`}
                >
                  #{r}
                </Link>
              ))}
            </div>
          </div>
        )}
        <Link
          href={`/t/${encodeURIComponent(tag)}`}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
          data-testid="topic-panel-feed"
        >
          Open the #{tag} feed <ArrowRight className="h-3 w-3" />
        </Link>
      </aside>
    );
  } else if (person) {
    const effectiveRank = person.wotRank ?? scoreOf(person.pubkey) ?? null;
    const followers = person.wotFollowers;
    main = (
    <aside
      role="link"
      tabIndex={0}
      aria-label={`Open ${getDisplayLabel(person)}'s profile`}
      onClick={openProfile}
      onKeyDown={(ev) => {
        if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault();
          openProfile(ev);
        }
      }}
      className="w-full cursor-pointer rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 transition-colors hover:border-slate-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid="search-knowledge-panel"
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className={`h-14 w-14 border-2 border-slate-200/80 dark:border-slate-800/80 ${tierRing(effectiveRank) ?? ""}`}>
            {person.picture ? <AvatarImage src={person.picture} alt="" className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          {effectiveRank != null && (
            <VerificationCoin
              score01={effectiveRank}
              pov={pov === "mywot" ? "personalized" : "global"}
              size={22}
              className="absolute -bottom-1 -right-1"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            {getDisplayLabel(person)}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <TierWordChip score01={effectiveRank} />
            {followers != null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                <Users className="h-2.5 w-2.5" /> {followers.toLocaleString()}
              </span>
            )}
            <FlaggedChip pubkey={person.pubkey} testId="person-flagged" />
            <PanelIdentityChip pubkey={person.pubkey} personal={pov === "mywot"} />
          </div>
        </div>
      </div>
      {/* Identity rows first, right under the name — who this is and how to
          pay them — then the social proof. The person card's order. */}
      {(person.nip05 || person.lud16) && (
        <div className="mt-2.5 space-y-1">
          {person.nip05 && (
            <p className="flex items-center gap-1 truncate text-xs text-brand-primary dark:text-brand-link" data-testid="person-nip05">
              <Check className="h-3 w-3 shrink-0" /> {person.nip05.replace(/^_@/, "")}
            </p>
          )}
          {person.lud16 && (
            // Tap to zap — the public profile's flow, from the panel.
            <button
              type="button"
              onClick={() => setZapOpen(true)}
              title={`Send a zap to ${person.lud16}`}
              className="flex max-w-full items-center gap-1 truncate rounded-md text-left text-xs text-slate-500 dark:text-slate-400 hover:text-[#e07f12] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              data-testid="person-lightning"
            >
              <Zap className="h-3 w-3 shrink-0 text-[#F7931A]" /> <span className="truncate">{person.lud16}</span>
            </button>
          )}
        </div>
      )}
      {/* Live now leads — the most time-sensitive thing about a person. */}
      <PanelLive {...personStreams} />
      <PanelLatestMedia person={person} events={personRecent} />
      {/* Nostr's oldest review: who follows them — the most trusted faces, and
          how many verified accounts in all. Then the trust reviews proper. */}
      <FollowedByLine pubkey={person.pubkey} npub={person.npub} personal={pov === "mywot"} testId="person-followed-by" className="mt-2.5" />
      <PanelVouches pubkey={person.pubkey} npub={person.npub} personal={pov === "mywot"} />
      {shownSets.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1" data-testid="person-sets">
          <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Listed in</span>
          {shownSets.map((m) => (
            // Each badge opens the lists that carry the title — the Lists
            // vertical searched for it, every set a card with its curator.
            <Link
              key={m.title}
              href={eventPath(bestSetOf(m))}
              title={`Open the “${m.title}” list (${m.exporters} publishers keep one)`}
              className="inline-flex items-center gap-1 rounded-full bg-brand-primary/5 dark:bg-brand-primary/15 px-2 py-0.5 text-[11px] font-medium text-brand-deep dark:text-brand-link hover:bg-brand-primary/10 dark:hover:bg-brand-primary/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              data-testid={`person-set-${m.title}`}
            >
              {m.title}
              <span className="rounded-full bg-brand-primary/10 dark:bg-brand-primary/25 px-1 text-[10px] font-semibold">
                {m.exporters}
              </span>
            </Link>
          ))}
        </div>
      )}
      {(personTracks.length > 0 || personWavlake) && (
        <div className="mt-3" data-testid="person-music">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Music</span>
            {personTracks.length > 0 ? (
              <Link
                href={`/p/${person.npub}`}
                onClick={() => onOpen?.(person)}
                className="text-[11px] font-medium text-brand-deep dark:text-brand-link hover:underline"
                data-testid="person-music-more"
              >
                All music →
              </Link>
            ) : (
              <a
                href={personWavlake!.artist.url}
                target="_blank"
                rel="noopener"
                className="text-[11px] font-medium text-brand-deep dark:text-brand-link hover:underline"
                data-testid="person-music-more"
              >
                All music on Wavlake →
              </a>
            )}
          </div>
          <div className="space-y-1">
            {personTracks.map((tr) => (
              <EmbeddedTrackCard
                key={tr.id}
                id={tr.id}
                title={tr.title}
                artist={tr.artist ?? person.displayName ?? person.name}
                cover={tr.cover}
                audio={tr.audio}
                genre={tr.genre}
                durationSec={tr.durationSec}
                href={eventPath({ id: tr.id, pubkey: tr.pubkey })}
              />
            ))}
            {personTracks.length === 0 &&
              personWavlake?.songs.map((song) => (
                <EmbeddedTrackCard
                  key={song.id}
                  id={song.id}
                  title={song.title}
                  artist={song.artist}
                  cover={song.cover}
                  audio={song.audio}
                  durationSec={song.durationSec}
                  sourceLabel="Wavlake"
                  onOpen={() => window.open(song.url, "_blank", "noopener")}
                />
              ))}
          </div>
        </div>
      )}
      {person.about && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 break-words line-clamp-4">
          {person.about}
        </p>
      )}
      <Link
        href={`/p/${person.npub}`}
        onClick={() => onOpen?.(person)}
        className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
        data-testid="knowledge-panel-profile"
      >
        Full profile & trust deep-dive <ArrowRight className="h-3 w-3" />
      </Link>
    </aside>
    );
  }

  const apps = appHits && (
    <aside
      className="w-full rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5"
      data-testid="search-apps-panel"
    >
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Apps</p>
      <ul className="mt-1.5 space-y-0.5">
        {appHits.map((h) => (
          <AppRailRow key={h.event.id} event={h.event as NostrEvent} />
        ))}
      </ul>
      <Link
        href={`/?q=${encodeURIComponent(query.trim())}&t=apps`}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
        data-testid="apps-panel-more"
      >
        More apps <ArrowRight className="h-3 w-3" />
      </Link>
    </aside>
  );

  if (!main && !apps) return null;
  // The rail stacks: the entity panel first, matching apps beneath. The zap
  // dialog mounts OUTSIDE the panel so its clicks never bubble into the
  // panel's own click-through (React events cross portals).
  return (
    <div className={`w-full space-y-3 ${className}`}>
      {main}
      {apps}
      {person?.lud16 && (
        <ZapModal
          open={zapOpen}
          onOpenChange={setZapOpen}
          recipientPubkey={person.pubkey}
          lud16={person.lud16}
          displayName={getDisplayLabel(person)}
          picture={person.picture ?? undefined}
        />
      )}
    </div>
  );
}
