import { Link } from "wouter";
import { relativeEventTime } from "@/lib/calendarEvent";
import { EventDateTile } from "@/components/share/EventDateTile";
import eventDefault from "@/assets/event-default.webp";

interface EventRowItem {
  id: string;
  title: string;
  start: number;
  location?: string;
  image?: string;
}

/**
 * A calendar-style event row for the public page: a date tile (month over day,
 * brand-tinted upcoming / grey past) leads, then title + relative time +
 * location, with an optional cover thumbnail. Reads instantly as an "event"
 * (Google Calendar / LinkedIn) and works without an image.
 */
export function EventRow({ event, href, past = false }: { event: EventRowItem; href: string; past?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border bg-white dark:bg-slate-900 p-2.5 transition-all ${past ? "border-slate-200 dark:border-slate-800 opacity-75 hover:opacity-100" : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"}`}
      data-testid="share-event-row"
    >
      <EventDateTile startSec={event.start} past={past} />
      <img
        src={event.image || eventDefault}
        alt=""
        loading="lazy"
        onError={(e) => { if (!e.currentTarget.src.includes("event-default")) e.currentTarget.src = eventDefault; }}
        className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {relativeEventTime(event.start)}{event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
    </Link>
  );
}
