/**
 * A NIP-53 meeting space (kind 30312) or a meeting in one (kind 30313) on its
 * page. The stream hero (LiveHero) is built around a player; a space has none:
 * it is a room you join at its `service` URL. So the poster says the room's
 * state, the button is the way in, and the people are listed with the roles
 * their `p` tags give them (Host, Moderator, Speaker…).
 *
 * - 30312: `room` (its name), `summary`, `image`, `status` (open, private,
 *   closed), `service` (the URL to access the room), `p` roles, `t`. Its
 *   `endpoint` is an API for clients, not a page: never shown.
 * - 30313: `title`, `summary`, `image`, `starts`, `ends`, `status` (planned,
 *   live, ended), participant counts, `p` roles, and the `a` naming its
 *   space — read for the space's name and its way in.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { CalendarClock, DoorOpen, ExternalLink, Lock, Radio, Users } from "lucide-react";
import liveDefault from "@/assets/live-default.webp";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { SectionHeader } from "@/components/ui/section-header";
import { ReadingText } from "@/components/share/ReadingText";
import { SetRoster } from "@/components/share/FollowSetHero";
import { useArticlesByRefs } from "@/hooks/useLinkedArticles";
import { formatEventTime, relativeEventTime } from "@/lib/calendarEvent";
import { liveStateOf, readMeeting } from "@/lib/liveStream";
import type { MinimalEvent } from "@/lib/noteRefs";

/** What the poster's pill says: a space's status, or a meeting's place in time. */
export function meetingStatusLabel(kind: number, status: string, state: ReturnType<typeof liveStateOf>): string {
  if (kind === 30312) {
    if (state === "live") return status === "private" ? "Private" : "Open";
    return "Closed";
  }
  return state === "live" ? "Live" : state === "upcoming" ? "Upcoming" : status === "planned" ? "Planned" : "Ended";
}

export function MeetingHero({ event }: { event: MinimalEvent }) {
  const meeting = useMemo(() => readMeeting(event), [event]);
  const nowSec = Math.floor(Date.now() / 1000);
  const state = liveStateOf(event, nowSec);
  const [imgBroken, setImgBroken] = useState(false);
  // A meeting's space: its name and its door. Held at once, else asked once.
  const spaceRefs = useMemo(() => (meeting?.space ? [meeting.space] : []), [meeting]);
  const spaceEvent = useArticlesByRefs(spaceRefs).articles[0];
  const space = useMemo(() => (spaceEvent ? readMeeting(spaceEvent) : null), [spaceEvent]);
  if (!meeting) return null;

  const joinUrl = meeting.service ?? space?.service;
  // A closed room, or a meeting that ended, has no door to offer.
  const open = state === "live" || state === "upcoming";
  const pill = meetingStatusLabel(meeting.kind, meeting.status, state);
  const poster = meeting.image && !imgBroken ? meeting.image : (space?.image ?? liveDefault);
  // A role is a displayable marker: "host" from one app and "Host" from another read the same.
  const roles = new Map(
    meeting.participants.map((p) => [p.pubkey, p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : undefined]),
  );
  let spaceHref = "";
  if (meeting.space)
    try {
      spaceHref = `/e/${nip19.naddrEncode(meeting.space)}`;
    } catch {
      /* an address that won't encode stays a name */
    }

  return (
    <div data-testid="meeting-hero" data-kind={meeting.kind}>
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 dark:border-slate-800">
        <img
          src={poster}
          alt=""
          onError={() => setImgBroken(true)}
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-slate-900/40" />
        <div className="relative flex flex-col items-center gap-2 px-6 text-center text-white">
          {state === "upcoming" ? (
            <>
              <CalendarClock className="h-7 w-7 opacity-90" />
              <p className="text-sm font-bold uppercase tracking-wide">Upcoming</p>
              {meeting.startsSec > 0 && <p className="text-lg font-bold">{relativeEventTime(meeting.startsSec)}</p>}
            </>
          ) : state === "live" ? (
            <>
              {meeting.status === "private" ? (
                <Lock className="h-7 w-7 opacity-90" />
              ) : (
                <DoorOpen className="h-7 w-7 opacity-90" />
              )}
              <p className="text-sm font-semibold">
                {meeting.kind === 30312
                  ? meeting.status === "private"
                    ? "This room is open to those it lets in"
                    : "This room is open"
                  : "This meeting is on now"}
              </p>
            </>
          ) : (
            <>
              <Radio className="h-7 w-7 opacity-70" />
              <p className="text-sm font-semibold">
                {meeting.kind === 30312 ? "This room is closed" : "This meeting has ended"}
              </p>
            </>
          )}
          {open && joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-link transition-colors hover:bg-slate-100"
              data-testid="meeting-join"
            >
              <ExternalLink className="h-4 w-4" /> {meeting.kind === 30312 ? "Join the room" : "Join the meeting"}
            </a>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <Chip
          size="sm"
          tone={state === "live" ? "success" : state === "upcoming" ? "info" : "neutral"}
          dot={state === "live"}
          data-testid="meeting-status"
        >
          {pill}
        </Chip>
        {meeting.currentParticipants != null && meeting.currentParticipants > 0 && state === "live" && (
          <span className="inline-flex items-center gap-1" data-testid="meeting-participants">
            <Users className="h-3.5 w-3.5" /> {meeting.currentParticipants.toLocaleString()} here
          </span>
        )}
        {meeting.startsSec > 0 && (
          <span data-testid="meeting-when">
            {formatEventTime(meeting.startsSec, false)}
            {meeting.endsSec > meeting.startsSec ? ` – ${formatEventTime(meeting.endsSec, false)}` : ""}
          </span>
        )}
      </div>

      <h1
        className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
        style={{ fontFamily: "var(--font-display)" }}
        data-testid="meeting-title"
      >
        <EmojiText text={meeting.title} tags={event} />
      </h1>

      {meeting.space && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" data-testid="meeting-space">
          In{" "}
          {spaceHref ? (
            <Link href={spaceHref} className="font-semibold text-brand-link hover:underline">
              {space?.title ?? "its room"}
            </Link>
          ) : (
            (space?.title ?? "its room")
          )}
        </p>
      )}

      {meeting.summary && meeting.summary !== meeting.title && (
        <ReadingText text={meeting.summary} tags={event.tags} className="mt-3" />
      )}

      {meeting.participants.length > 0 && (
        <section className="mt-5" data-testid="meeting-people">
          <SectionHeader kicker={meeting.kind === 30312 ? "Hosts" : "People"} />
          <SetRoster
            members={meeting.participants.map((p) => p.pubkey)}
            trailing={(pk) =>
              roles.get(pk) ? (
                <Chip size="sm" tone="slate" data-testid={`meeting-role-${pk}`}>
                  {roles.get(pk)}
                </Chip>
              ) : null
            }
          />
        </section>
      )}
    </div>
  );
}
