import { Link } from "wouter";
import { eventDateTile, relativeEventTime } from "@/lib/calendarEvent";
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
  const tile = eventDateTile(event.start);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border bg-white p-2.5 transition-all ${past ? "border-slate-200 opacity-75 hover:opacity-100" : "border-slate-200 hover:border-slate-300"}`}
      data-testid="share-event-row"
    >
      <div
        className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border ${
          past ? "border-slate-200 bg-slate-50 text-slate-400" : "border-brand-accent/30 bg-brand-deep/[0.06] text-brand-deep"
        }`}
        aria-hidden="true"
      >
        <span className="text-[9px] font-bold uppercase leading-none tracking-wide">{tile.month}</span>
        <span className="text-lg font-bold leading-tight tabular-nums">{tile.day}</span>
      </div>
      <img
        src={event.image || eventDefault}
        alt=""
        loading="lazy"
        onError={(e) => { if (!e.currentTarget.src.includes("event-default")) e.currentTarget.src = eventDefault; }}
        className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{event.title}</p>
        <p className="truncate text-xs text-slate-500">
          {relativeEventTime(event.start)}{event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
    </Link>
  );
}
