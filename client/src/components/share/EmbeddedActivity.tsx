/**
 * A quoted event that records something someone did — a reaction, a zap, a
 * deletion, a report, a label, a vote, an award, an approval, an RSVP, a
 * follow list, a trust score, a designation — said the way its result row
 * says it (lib/resultReaders `readKind`, which reads through lib/activity like
 * its page does): what happened, to whom, a few facts, and the event it is
 * about, one level down.
 *
 * Its words were its `content`: a "+" under a "Reaction" chip, an empty zap,
 * a "dropped below cutoff" with no target. The tags are what it says.
 *
 * The event it is about is quoted as a nested card when it can be loaded and
 * the card is not itself nested — one level, never a stack (EmbeddedNoteCard's
 * budget). Some targets are only linked: what a deletion names (NIP-09:
 * clients SHOULD hide it), a post reported as nudity, malware or illegal (the
 * activity page asks before it shows one), a badge named by anyone but its
 * issuer (NIP-58: only the issuer awards it).
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Check } from "lucide-react";
import { nip19 } from "nostr-tools";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { MentionChip } from "@/components/share/MentionChip";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useRefEvent } from "@/hooks/useRefEvent";
import {
  ASSERTION_KINDS,
  ZAP_KINDS,
  pollChoices,
  quotesItsTarget,
  readApproval,
  readPollVote,
  readReaction,
  readZap,
  type EventRef,
} from "@/lib/activity";
import { kindTypeLabel } from "@/lib/kindLabel";
import type { MinimalEvent } from "@/lib/noteRefs";
import { refPath } from "@/lib/refPath";
import { readKind, who } from "@/lib/resultReaders";
import { eventPath } from "@/lib/shareId";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

const NPUB_TOKEN = /(nostr:npub1[02-9ac-hj-np-z]+)/i;

/** A reader's words: its `nostr:npub…` tokens as the people they name, its NIP-30 emoji from the event's tags. */
export function ReaderText({ text, tags }: { text: string; tags: string[][] }) {
  return (
    <>
      {text
        .split(NPUB_TOKEN)
        .map((part, i) =>
          NPUB_TOKEN.test(part) ? (
            <MentionChip key={i} uri={part} />
          ) : part ? (
            <EmojiText key={i} text={part} tags={tags} />
          ) : null,
        )}
    </>
  );
}

/** The event it is about, and whether to quote it or only link it (lib/activity `quotesItsTarget`). */
function targetOf(
  event: MinimalEvent,
  ref: EventRef | null | undefined,
): { ref: EventRef | null; embedded: MinimalEvent | null; quote: boolean } {
  // NIP-72 carries the approved post in the content: under its author's signature it is shown as is.
  const embedded = event.kind === 4550 ? ((readApproval(event).embedded as MinimalEvent | null) ?? null) : null;
  return { ref: ref ?? null, embedded, quote: quotesItsTarget(event) };
}

/** What the target is called before it is in hand: the kind its address or `k` names, else a post. */
function nounOf(event: MinimalEvent, ref: EventRef): string {
  const kind = ref.addr
    ? Number(ref.addr.split(":")[0])
    : event.kind === 7
      ? (readReaction(event).targetKind ?? NaN)
      : NaN;
  if (Number.isFinite(kind)) return kind === 0 ? "profile" : kindTypeLabel(kind).toLowerCase();
  return "post";
}

function ActivityTarget({
  event,
  target,
  embedded,
  quote,
  nested,
}: {
  event: MinimalEvent;
  target: EventRef;
  embedded: MinimalEvent | null;
  quote: boolean;
  nested: boolean;
}) {
  // A nested card asks the relays nothing: its target stays a link.
  const { event: found, settled } = useRefEvent(quote && !nested && !embedded ? target : null);
  const shown = quote && !nested ? (embedded ?? (found as MinimalEvent | null)) : null;
  const authors = useLiveProfiles(shown ? [shown.pubkey] : []);
  if (shown)
    return (
      <div className="mt-1.5" data-testid="embedded-activity-target">
        <EmbeddedNoteCard
          event={shown}
          author={authors.get(shown.pubkey) as ProfileLite | undefined}
          href={eventPath(shown)}
          nested
        />
      </div>
    );
  const noun = nounOf(event, target);
  const waiting = quote && !nested && !settled;
  return (
    <Link
      href={refPath(target)}
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 no-underline transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-400"
      data-testid="embedded-activity-target-link"
    >
      <span className="truncate">
        {waiting
          ? `Looking for the ${noun}…`
          : quote && !nested
            ? `The ${noun} was not found on the relays we asked`
            : `Open the ${noun}`}
      </span>
      {target.id && <span className="shrink-0 font-mono">{target.id.slice(0, 8)}…</span>}
    </Link>
  );
}

/** The choices a vote cast, in the poll's own words once the poll is in hand (NIP-88). */
function VoteChoices({ event, poll }: { event: MinimalEvent; poll: EventRef | null }) {
  const { event: found } = useRefEvent(poll);
  const choices = pollChoices(readPollVote(event).responses, found);
  if (!choices.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1" data-testid="embedded-activity-choices">
      {choices.slice(0, 4).map((c, i) => (
        <Chip key={`${i}:${c}`} tone="brand" size="sm" icon={Check}>
          {found ? <EmojiText text={c} tags={found} /> : c}
        </Chip>
      ))}
    </div>
  );
}

export function EmbeddedActivity({ event, nested = false }: { event: MinimalEvent; nested?: boolean }) {
  const read = useMemo(() => readKind(event), [event]);
  const zap = useMemo(() => (ZAP_KINDS.has(event.kind) ? readZap(event) : null), [event]);
  const target = useMemo(() => targetOf(event, read?.ref), [event, read]);
  if (!read) return null;
  // A zap is its payer's, once their signed request vouches for them (lib/resultReaders `by`).
  const title = read.title ? (read.by ? `${read.title} from ${who(read.by)}` : read.title) : null;
  const body = read.body ?? null;
  const facts = read.facts ?? [];
  const npubOf = (pk: string) => {
    try {
      return nip19.npubEncode(pk);
    } catch {
      return "";
    }
  };
  return (
    <div data-testid="embedded-activity" data-kind={event.kind}>
      {title && (
        <p
          className="break-words text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
          data-testid="embedded-activity-title"
        >
          <ReaderText text={title} tags={event.tags} />
        </p>
      )}
      {body && (
        <p
          className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-sm text-slate-600 dark:text-slate-300"
          data-testid="embedded-activity-body"
        >
          {/* A zap's comment draws its emoji from the payer's request (NIP-57), not the receipt. */}
          <ReaderText text={body} tags={zap?.commentTags ?? event.tags} />
        </p>
      )}
      {event.kind === 1018 && !nested && <VoteChoices event={event} poll={read.ref ?? null} />}
      {facts.length > 0 && (
        <p
          className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400"
          data-testid="embedded-activity-facts"
        >
          <ReaderText text={facts.join(" · ")} tags={event.tags} />
        </p>
      )}
      {ASSERTION_KINDS.has(event.kind) && (
        // A score is one observer's, as its provider (the author above) computed it.
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500" data-testid="embedded-activity-pov">
          One observer&rsquo;s web of trust, as{" "}
          {npubOf(event.pubkey) ? <MentionChip uri={`nostr:${npubOf(event.pubkey)}`} plain /> : "this provider"}{" "}
          computed it
        </p>
      )}
      {target.ref && (
        <ActivityTarget
          event={event}
          target={target.ref}
          embedded={target.embedded}
          quote={target.quote}
          nested={nested}
        />
      )}
    </div>
  );
}
