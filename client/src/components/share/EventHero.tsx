import { useState } from "react";
import { Calendar, MapPin, ExternalLink, PlayCircle } from "lucide-react";
import { parseCalendarEvent, formatEventDate, isUpcoming, relativeEventTime } from "@/lib/calendarEvent";
import { RsvpButton } from "@/components/share/RsvpButton";
import eventDefault from "@/assets/event-default.webp";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * A focused, time-aware event page for a NIP-52 calendar event (kind
 * 31922/31923) on /e. Upcoming: a countdown line + Add-to-calendar. Past: an
 * "Ended …" line, no add-to-calendar, and a "Watch recording" link when the
 * event references one. The author row + WoT and the "open in a Nostr app" RSVP
 * path are provided by EventPage around this component.
 */
export function EventHero({ event }: { event: MinimalEvent }) {
  const e = parseCalendarEvent(event);
  // Always show a banner: the event's own image, or the branded events default
  // when it has none / its image URL fails to load.
  const [imgBroken, setImgBroken] = useState(false);
  const heroImage = !e.image || imgBroken ? eventDefault : e.image;
  const upcoming = isUpcoming(e.startSec);
  const rel = relativeEventTime(e.startSec);
  const mapUrl = e.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}` : null;
  const timing = e.startSec > 0
    ? upcoming
      ? `Starts ${rel.toLowerCase()}`
      : /ago$/.test(rel) ? `Ended ${rel.toLowerCase()}` : rel
    : "";

  return (
    <div data-testid="event-hero">
      <img src={heroImage} alt="" loading="lazy" onError={() => setImgBroken(true)} className="mb-4 max-h-72 w-full rounded-xl border border-slate-200 dark:border-slate-800 object-cover" />


      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${upcoming ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
        <Calendar className="h-3 w-3" /> {upcoming ? "Upcoming event" : "Past event"}
      </span>

      <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl" style={{ fontFamily: "var(--font-display)" }} data-testid="event-hero-title">
        {e.title}
      </h1>

      {timing && (
        <p className={`mt-1.5 text-sm font-semibold ${upcoming ? "text-emerald-600" : "text-slate-400 dark:text-slate-500"}`} data-testid="event-hero-timing">{timing}</p>
      )}

      <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        {e.startSec > 0 && (
          <div className="flex items-center gap-2" data-testid="event-hero-date">
            <Calendar className="h-4 w-4 shrink-0 text-brand-link" />
            <span className="font-medium">{formatEventDate(e.startSec, e.isDateOnly)}</span>
          </div>
        )}
        {e.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-brand-link" />
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noopener" className="font-medium text-brand-link hover:underline">{e.location}</a>
            ) : (
              <span className="font-medium">{e.location}</span>
            )}
          </div>
        )}
      </div>

      {e.summary && e.summary !== e.title && (
        <p className="mt-4 whitespace-pre-line break-words border-t border-slate-100 dark:border-slate-800/60 pt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{e.summary}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* Going, on Nostr: a NIP-52 RSVP under the reader's key. */}
        {upcoming && e.startSec > 0 && <RsvpButton event={event} size="md" />}
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
  );
}
