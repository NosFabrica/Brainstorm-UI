import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Calendar, CalendarPlus, MapPin, ExternalLink, PlayCircle, ChevronDown } from "lucide-react";
import { parseCalendarEvent, formatEventDate, formatEventTime, isUpcoming, relativeEventTime } from "@/lib/calendarEvent";
import { RsvpButton } from "@/components/share/RsvpButton";
import { NotesInline } from "@/components/share/NotesInline";
import { useLightbox } from "@/components/share/Lightbox";
import { LinkPreviewCard } from "@/components/share/LinkPreview";
import { EventDateTile } from "@/components/share/EventDateTile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { fetchProfileMap } from "@/services/nostr";
import { fetchEventRsvps, type EventRsvps } from "@/services/search";
import { buildIcs, downloadIcs, icsFileName, type IcsInput } from "@/lib/ics";
import { CALENDAR_LABEL, detectCalendarPlatform, googleCalendarUrl, outlookCalendarUrl, preferredCalendar } from "@/lib/calendarLinks";
import { eventPath } from "@/lib/shareId";
import eventDefault from "@/assets/event-default.webp";
import type { MinimalEvent } from "@/lib/noteRefs";

type Profile = { name?: string; display_name?: string; picture?: string };

/**
 * An event page the way Luma lays one out: the cover beside the facts; the
 * host named and ringed; the date tile with start, end and zone; where, with
 * a map; who said they are going, as faces; "I'm going" and "Add to
 * calendar" — an .ics of the reader's own, no vendor between them and their
 * calendar. Then the description as a post.
 */
export function EventHero({ event }: { event: MinimalEvent }) {
  const e = parseCalendarEvent(event);
  const [imgBroken, setImgBroken] = useState(false);
  const openLightbox = useLightbox();
  const heroImage = !e.image || imgBroken ? eventDefault : e.image;
  const upcoming = isUpcoming(e.startSec);
  const rel = relativeEventTime(e.startSec);
  const tz = event.tags.find((t) => t[0] === "start_tzid")?.[1];
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  const address = `${event.kind}:${event.pubkey}:${d}`;
  const mapUrl = e.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}` : null;

  // The host and the guests' faces — profiles from the same store-first fetch.
  const [rsvps, setRsvps] = useState<EventRsvps | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const faces = rsvps?.faces.slice(0, 5) ?? [];
  useEffect(() => {
    let alive = true;
    void fetchEventRsvps([address]).then((m) => {
      if (alive) setRsvps(m.get(address) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [address]);
  const peopleKey = [event.pubkey, ...faces].join(",");
  useEffect(() => {
    let alive = true;
    void fetchProfileMap(peopleKey.split(",")).then((m) => {
      if (alive) setProfiles(new Map([...m].map(([pk, c]) => [pk, c as Profile])));
    });
    return () => {
      alive = false;
    };
  }, [peopleKey]);
  const scoreOf = useAuthorScores([event.pubkey, ...faces]);
  const tierRing = useTierRing();
  const host = profiles.get(event.pubkey);
  const hostName = host?.display_name || host?.name || null;
  let hostNpub = "";
  try {
    hostNpub = nip19.npubEncode(event.pubkey);
  } catch {
    /* malformed pubkey — no link */
  }

  // The first plain web link in the description — a ticket page, the
  // organiser's site — earns a metadata card. Media links are the banner's job.
  const firstLink =
    (e.summary ?? "").match(/https?:\/\/\S+/g)?.map((u) => u.replace(/[),;!?.]+$/, "")).find((u) => !/\.(?:png|jpe?g|gif|webp|avif|mp4|webm|mov|m3u8)(?:[?#]|$)/i.test(u)) ?? null;
  const timing = e.startSec > 0 ? (upcoming ? `Starts ${rel.toLowerCase()}` : /ago$/.test(rel) ? `Ended ${rel.toLowerCase()}` : rel) : "";
  const when = useMemo(() => {
    if (!e.startSec) return "";
    const start = formatEventDate(e.startSec, e.isDateOnly);
    const end = !e.isDateOnly && e.endSec > e.startSec ? ` – ${formatEventTime(e.endSec, false)}` : "";
    return `${start}${end}`;
  }, [e.startSec, e.endSec, e.isDateOnly]);
  const icsInput = useMemo(
    () => ({
      uid: `${address}@brainstorm`,
      title: e.title,
      startSec: e.startSec,
      endSec: e.endSec,
      isDateOnly: e.isDateOnly,
      location: e.location,
      description: e.summary,
      url: typeof window !== "undefined" ? `${window.location.origin}${eventPath(event)}` : undefined,
    }),
    [address, e.title, e.startSec, e.endSec, e.isDateOnly, e.location, e.summary, event],
  );
  const addToCalendar = () => downloadIcs(icsFileName(e.title), buildIcs(icsInput));

  return (
    <div data-testid="event-hero">
      <div className="sm:flex sm:items-start sm:gap-5">
        {/* The cover, square, beside the facts — a poster, not a banner. Shown
            whole: hosts upload flyers of every shape, and a square crop cut
            Raystown's own title off. It sits letter-boxed over a blur of
            itself — Apple TV's trick — and a tap opens it large. */}
        <button
          type="button"
          onClick={() =>
            openLightbox([{ url: heroImage, kind: "image" }], 0, {
              author: hostNpub ? { name: hostName ?? hostNpub.slice(0, 12), npub: hostNpub, picture: host?.picture ?? null, score01: scoreOf(event.pubkey) ?? null } : null,
              postHref: eventPath(event),
            })
          }
          aria-label="View the poster"
          className="relative block aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 sm:w-48 sm:shrink-0"
          data-testid="event-hero-poster"
        >
          {!imgBroken && e.image && (
            <img src={heroImage} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-xl opacity-70" data-testid="event-hero-image-blur" />
          )}
          <img
            src={heroImage}
            alt=""
            loading="lazy"
            onError={() => setImgBroken(true)}
            className="relative h-full w-full object-contain"
            data-testid="event-hero-image"
          />
        </button>
        <div className="mt-3 min-w-0 flex-1 sm:mt-0">
          {/* One line for the state of the event: the chip and the countdown together. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="event-hero-status">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${upcoming ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
              <Calendar className="h-3 w-3" /> {upcoming ? "Upcoming event" : "Past event"}
            </span>
            {timing && (
              <span className={`text-xs font-semibold ${upcoming ? "text-emerald-600" : "text-slate-400 dark:text-slate-500"}`} data-testid="event-hero-timing">{timing}</span>
            )}
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl" style={{ fontFamily: "var(--font-display)" }} data-testid="event-hero-title">
            {e.title}
          </h1>
          {/* The host, ringed — the one thing no ticketing site can show. */}
          {hostNpub && (
            <Link href={`/p/${hostNpub}`} className="mt-1 inline-flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors" data-testid="event-hero-host">
              <Avatar className={`h-5 w-5 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(event.pubkey) ?? null, false, "sm", true) ?? ""}`}>
                {host?.picture ? <AvatarImage src={host.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                By <span className="font-medium text-slate-900 dark:text-slate-100">{hostName ?? `${hostNpub.slice(0, 12)}…`}</span>
              </span>
            </Link>
          )}
          <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            {e.startSec > 0 && (
              <div className="flex items-center gap-2.5" data-testid="event-hero-date">
                <EventDateTile startSec={e.startSec} size="sm" />
                <div className="min-w-0" data-testid="event-hero-when">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{when}</div>
                  {tz && <div className="text-xs text-slate-500 dark:text-slate-400">{tz.replace(/_/g, " ")}</div>}
                </div>
              </div>
            )}
            {e.location && (
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500">
                  <MapPin className="h-4 w-4" />
                </span>
                {mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noopener" className="font-medium text-slate-700 dark:text-slate-200 hover:text-brand-link hover:underline">{e.location}</a>
                ) : (
                  <span className="font-medium">{e.location}</span>
                )}
              </div>
            )}
          </div>
          {/* Who is going — faces with the count. */}
          {rsvps && rsvps.going > 0 && (
            <div className="mt-2.5 flex items-center gap-2" data-testid="event-hero-guests">
              <span className="flex -space-x-1.5">
                {faces.map((pk) => {
                  const p = profiles.get(pk);
                  return (
                    <Avatar key={pk} title={p?.display_name || p?.name || undefined} className={`h-6 w-6 border border-white dark:border-slate-900 ${tierRing(scoreOf(pk) ?? null, false, "sm", true) ?? ""}`} data-testid={`event-hero-guest-${pk}`}>
                      {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="overflow-hidden">
                        <DefaultAvatarImg />
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-slate-100">{rsvps.going}</span> going
              </span>
            </div>
          )}
          {/* The action sits with the facts — Eventbrite's order — not under a
              long description. Upcoming: I'm going (a NIP-52 RSVP on Nostr) and
              a calendar file. Past: the recording when there is one. */}
          <div className="mt-3 grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap" data-testid="event-hero-actions">
            {upcoming && e.startSec > 0 && <RsvpButton event={event} size="md" className="w-full justify-center sm:w-auto" />}
            {upcoming && e.startSec > 0 && <AddToCalendar input={icsInput} onIcs={addToCalendar} />}
            {!upcoming && e.recordingUrl && (
              <a
                href={e.recordingUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                data-testid="event-watch-recording"
              >
                <PlayCircle className="h-4 w-4" /> Watch recording
              </a>
            )}
            {!upcoming && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                <ExternalLink className="h-3.5 w-3.5" /> Open in a Nostr app below
              </span>
            )}
          </div>
        </div>
      </div>
      {/* The description as a post: paragraphs kept, links as real links with
          their favicon and domain, mentions as names, and the first web link
          unfurled into a metadata card when the proxy knows it. */}
      {e.summary && e.summary !== e.title && (
        <div className="mt-5 border-t border-slate-100 dark:border-slate-800/60 pt-4" data-testid="event-hero-description">
          <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">About</h2>
          <div className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300 [&_a]:align-baseline">
            <NotesInline text={e.summary} />
          </div>
          {firstLink && (
            <div className="mt-3">
              <LinkPreviewCard url={firstLink} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Add to calendar" the way the device wants it. One tap does the likely
 * thing — Apple Calendar on an iPhone or Mac (the .ics opens straight in it),
 * Google Calendar on Android, Outlook on Windows — and a caret offers all
 * four to anyone who uses something else. The team asked to work with what
 * the device prefers rather than force one system; no browser reveals the
 * calendar app, but the operating system is the next best thing.
 */
function AddToCalendar({ input, onIcs }: { input: IcsInput; onIcs: () => void }) {
  const [open, setOpen] = useState(false);
  const preferred = useMemo(() => preferredCalendar(detectCalendarPlatform()), []);
  const google = googleCalendarUrl(input);
  const outlook = outlookCalendarUrl(input);
  const btn = "inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-accent/40 transition-colors";
  const primaryLabel = `Add to ${CALENDAR_LABEL[preferred]}`;
  // A phone's half-width cell holds one word; the icon and the caret say the rest.
  const shortLabel = "Calendar";
  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800";
  return (
    <div className="relative inline-flex w-full sm:w-auto" data-testid="event-hero-add-to-calendar">
      {preferred === "apple" ? (
        <button type="button" onClick={onIcs} className={`${btn} flex-1 justify-center whitespace-nowrap rounded-l-xl sm:flex-initial`} data-testid="event-hero-calendar">
          <CalendarPlus className="h-4 w-4" /> <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{primaryLabel}</span>
        </button>
      ) : (
        <a
          href={preferred === "google" ? google : outlook}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} flex-1 justify-center whitespace-nowrap rounded-l-xl no-underline sm:flex-initial`}
          data-testid="event-hero-calendar"
        >
          <CalendarPlus className="h-4 w-4" /> <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{primaryLabel}</span>
        </a>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Other calendars"
        className={`${btn} -ml-px rounded-r-xl px-2`}
        data-testid="event-hero-calendar-more"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg"
          data-testid="event-hero-calendar-menu"
        >
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onIcs(); }} data-testid="event-hero-cal-apple">
            Apple Calendar
          </button>
          <a role="menuitem" href={google} target="_blank" rel="noopener noreferrer" className={`${item} no-underline`} onClick={() => setOpen(false)} data-testid="event-hero-cal-google">
            Google Calendar
          </a>
          <a role="menuitem" href={outlook} target="_blank" rel="noopener noreferrer" className={`${item} no-underline`} onClick={() => setOpen(false)} data-testid="event-hero-cal-outlook">
            Outlook
          </a>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onIcs(); }} data-testid="event-hero-cal-ics">
            Download .ics file
          </button>
        </div>
      )}
    </div>
  );
}
