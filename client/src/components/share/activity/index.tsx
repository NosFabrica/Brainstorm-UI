/**
 * The event page (`/e/…`) of an event that records something someone did —
 * a zap, a reaction, a deletion, a report, a vote, a badge award, a trust
 * score. The All tab's row already says it in a line (lib/resultReaders);
 * this is the same reading as a page: who, to whom, how much, and the event
 * it is about, quoted. Parsing is lib/activity's, shared with the row.
 */
import { ASSERTION_KINDS, ZAP_KINDS, readZap, type ActivityEvent } from "@/lib/activity";
import { AssertionHero } from "./AssertionHero";
import { ApprovalHero, DeletionHero, LabelHero, ReportHero } from "./ModerationHeroes";
import { ReactionHero } from "./ReactionHero";
import { BadgeAwardHero, FollowsHero, PollVoteHero, RsvpHero } from "./SocialHeroes";
import { ZapHero } from "./ZapHero";

/** The kinds drawn here. */
export const ACTIVITY_KINDS: ReadonlySet<number> = new Set([
  3,
  5,
  7,
  8,
  17,
  1018,
  1984,
  1985,
  4550,
  31925,
  ...ZAP_KINDS,
  ...ASSERTION_KINDS,
]);

export const hasActivityHero = (event: { kind: number }): boolean => ACTIVITY_KINDS.has(event.kind);

/**
 * Whose the page is, when not the signer's: a zap receipt is signed by the
 * recipient's wallet service, and the page — its author line, its "More from" —
 * is the payer's. Null keeps the signer.
 */
export function activityAuthor(event: ActivityEvent): string | null {
  return event.kind === 9735 ? (readZap(event)?.payer ?? null) : null;
}

export function ActivityHero({ event }: { event: ActivityEvent }) {
  if (ZAP_KINDS.has(event.kind)) return <ZapHero event={event} />;
  if (ASSERTION_KINDS.has(event.kind)) return <AssertionHero event={event} />;
  switch (event.kind) {
    case 3:
      return <FollowsHero event={event} />;
    case 5:
      return <DeletionHero event={event} />;
    case 7:
    case 17:
      return <ReactionHero event={event} />;
    case 8:
      return <BadgeAwardHero event={event} />;
    case 1018:
      return <PollVoteHero event={event} />;
    case 1984:
      return <ReportHero event={event} />;
    case 1985:
      return <LabelHero event={event} />;
    case 4550:
      return <ApprovalHero event={event} />;
    case 31925:
      return <RsvpHero event={event} />;
    default:
      return null;
  }
}
