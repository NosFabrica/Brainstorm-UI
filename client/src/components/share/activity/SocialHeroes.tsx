/**
 * The pages of what people say about each other and their plans: a follow
 * list (NIP-02, 3), a badge award (NIP-58, 8), a poll vote (NIP-88, 1018) and
 * a calendar RSVP (NIP-52, 31925).
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Award, CalendarCheck, Check, Users, Vote } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { SetRoster } from "@/components/share/FollowSetHero";
import { HashtagChips } from "@/components/share/ListPreview";
import { ReadingText } from "@/components/share/ReadingText";
import { useRefEvents } from "@/hooks/useRefEvents";
import { pollChoices, readBadgeAward, readFollows, readPollVote, readRsvp, type ActivityEvent } from "@/lib/activity";
import { describeThing } from "@/lib/thing";
import { ActivityHeader, QuotedRef, Section, refHref } from "./parts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function FollowsHero({ event }: { event: ActivityEvent }) {
  const follows = useMemo(() => readFollows(event), [event]);
  return (
    <div data-testid="follows-hero">
      <ActivityHeader
        title={`Follows ${plural(follows.people.length, "person", "people")}`}
        subtitle={follows.hashtags.length ? `and ${plural(follows.hashtags.length, "hashtag")}` : null}
        icon={Users}
      />
      {follows.hashtags.length > 0 && (
        <Section kicker="Hashtags" testId="follows-hashtags">
          <HashtagChips hashtags={follows.hashtags} />
        </Section>
      )}
      {/* The roster a follow set opens as: faces in their tier rings, folded after 25. */}
      <SetRoster members={follows.people} />
    </div>
  );
}

export function BadgeAwardHero({ event }: { event: ActivityEvent }) {
  const award = useMemo(() => readBadgeAward(event), [event]);
  const targets = useMemo(() => (award.badge ? [{ addr: award.badge, relay: award.relay }] : []), [award]);
  const refs = useRefEvents(targets);
  const definition = award.badge ? refs.get({ addr: award.badge }) : undefined;
  const badge = definition ? describeThing(definition) : null;
  const d = award.badge?.split(":").slice(2).join(":") || "";
  return (
    <div data-testid="badge-award-hero">
      <ActivityHeader
        title={
          badge ? (
            <>
              Awarded the{" "}
              <Link
                href={refHref({ addr: award.badge! })}
                className="text-brand-primary hover:underline dark:text-brand-link"
                data-testid="badge-name"
              >
                <EmojiText text={badge.title} tags={badge.emoji} />
              </Link>{" "}
              badge
            </>
          ) : (
            "Awarded a badge"
          )
        }
        subtitle={
          badge?.description ? (
            <EmojiText text={badge.description} tags={badge.emoji} />
          ) : !badge && refs.settled && d ? (
            `The badge “${d}” was not found on the relays we asked.`
          ) : null
        }
        icon={badge?.image ? undefined : Award}
        mark={
          badge?.image ? (
            <img src={badge.image} alt="" className="h-full w-full object-cover" data-testid="badge-image" />
          ) : undefined
        }
      />
      <Section
        kicker={
          award.awardees.length === 1 ? "Awarded to" : `Awarded to ${award.awardees.length.toLocaleString()} people`
        }
        testId="badge-awardees"
      >
        <SetRoster members={award.awardees} />
      </Section>
    </div>
  );
}

export function PollVoteHero({ event }: { event: ActivityEvent }) {
  const vote = useMemo(() => readPollVote(event), [event]);
  const targets = useMemo(() => (vote.poll ? [vote.poll] : []), [vote]);
  const refs = useRefEvents(targets);
  const poll = vote.poll ? refs.get(vote.poll) : undefined;
  const choices = pollChoices(vote.responses, poll);
  return (
    <div data-testid="poll-vote-hero">
      <ActivityHeader
        title="Voted in a poll"
        subtitle={choices.length > 1 ? `${choices.length} choices` : null}
        icon={Vote}
      />
      {choices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="poll-vote-choices">
          {choices.map((c, i) => (
            <Chip key={`${i}:${c}`} tone="brand" icon={Check} data-testid="poll-vote-choice">
              {poll ? <EmojiText text={c} tags={poll} /> : c}
            </Chip>
          ))}
        </div>
      )}
      {vote.poll && (
        <Section kicker="The poll" testId="poll-vote-poll">
          <QuotedRef target={vote.poll} refs={refs} />
        </Section>
      )}
    </div>
  );
}

export function RsvpHero({ event }: { event: ActivityEvent }) {
  const rsvp = useMemo(() => readRsvp(event), [event]);
  const target = useMemo(
    () =>
      rsvp.appointment ? { addr: rsvp.appointment, relay: rsvp.relay } : rsvp.eventId ? { id: rsvp.eventId } : null,
    [rsvp],
  );
  const targets = useMemo(() => (target ? [target] : []), [target]);
  const refs = useRefEvents(targets);
  return (
    <div data-testid="rsvp-hero">
      <ActivityHeader
        title={<span data-testid="rsvp-status">{rsvp.word}</span>}
        icon={CalendarCheck}
        chips={
          rsvp.freeBusy && (
            <Chip tone="slate" data-testid="rsvp-fb">
              {rsvp.freeBusy === "busy" ? "Busy then" : "Free then"}
            </Chip>
          )
        }
      />
      {rsvp.note && <ReadingText text={rsvp.note} tags={event.tags} className="mt-3" testId="rsvp-note" />}
      {target && (
        <Section kicker="The event" testId="rsvp-event">
          <QuotedRef target={target} refs={refs} />
        </Section>
      )}
    </div>
  );
}
