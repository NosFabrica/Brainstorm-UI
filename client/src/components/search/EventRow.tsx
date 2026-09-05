import { Link } from "wouter";
import type { SearchHit } from "@/services/search";
import { EventDateTile } from "@/components/share/EventDateTile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { formatEventTime, isOver, parseCalendarEvent, shortPlace } from "@/lib/calendarEvent";
import { getDisplayLabel } from "@/lib/profileSearch";
import { eventPath } from "@/lib/shareId";

/**
 * A calendar event as one row, the way Luma lists them: the date tile, then
 * the time and the town, the title, the host when asked for, who is going,
 * and the cover as a small square. Shared by the Happening section and the
 * knowledge panel's upcoming events, so the search says events one way.
 */
export function EventRow({
  hit,
  score,
  going = 0,
  showHost = true,
  testIdPrefix = "event-row",
}: {
  hit: SearchHit;
  score?: number | null;
  going?: number;
  showHost?: boolean;
  testIdPrefix?: string;
}) {
  const { event, author } = hit;
  const cal = parseCalendarEvent(event);
  const past = isOver(cal);
  const place = shortPlace(cal.location);
  const tierRing = useTierRing();
  return (
    <Link
      href={eventPath(event)}
      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      data-testid={`${testIdPrefix}-${event.id}`}
    >
      {cal.startSec > 0 && <EventDateTile startSec={cal.startSec} size="sm" past={past} />}
      <span className="min-w-0 flex-1">
        {cal.startSec > 0 && (
          <span className={`block truncate text-[11px] font-semibold ${past ? "text-slate-400 dark:text-slate-500" : "text-brand-deep dark:text-brand-link"}`}>
            {formatEventTime(cal.startSec, cal.isDateOnly)}
            {place && <span className="font-normal text-slate-500 dark:text-slate-400"> · {place}</span>}
          </span>
        )}
        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{cal.title}</span>
        {(showHost && author) || going > 0 ? (
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            {showHost && author && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Avatar className={`h-3.5 w-3.5 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? author.wotRank ?? null, false, "sm", true) ?? ""}`}>
                  {author.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">By {getDisplayLabel(author)}</span>
              </span>
            )}
            {going > 0 && <span className="shrink-0">{going} going</span>}
          </span>
        ) : null}
      </span>
      {cal.image && <img src={cal.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 object-cover" data-testid={`cover-${testIdPrefix}-${event.id}`} />}
    </Link>
  );
}
