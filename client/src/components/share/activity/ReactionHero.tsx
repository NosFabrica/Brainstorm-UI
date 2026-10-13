/**
 * A reaction's page (NIP-25): the mark itself — a heart for "+", a thumbs-down
 * for "-", the emoji, or a NIP-30 custom emoji's picture — and what it was
 * a reaction to. Kind 17 reacts to something outside Nostr (NIP-73): a web
 * page shows as its link card, any other id (a book, an episode) as itself.
 */
import { useMemo } from "react";
import { Heart, ThumbsDown } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { CustomEmojiImg } from "@/components/ui/custom-emoji";
import { useRefEvents } from "@/hooks/useRefEvents";
import { readReaction, type ActivityEvent, type ReactionMark } from "@/lib/activity";
import { kindTypeLabel } from "@/lib/kindLabel";
import { ActivityHeader, ExternalTargetCard, PersonName, QuotedRef, Section } from "./parts";

function Mark({ mark }: { mark: ReactionMark }) {
  switch (mark.type) {
    case "like":
      return <Heart className="h-6 w-6 fill-rose-500 text-rose-500" data-testid="reaction-like" aria-label="Like" />;
    case "dislike":
      return (
        <ThumbsDown
          className="h-6 w-6 text-slate-500 dark:text-slate-400"
          data-testid="reaction-dislike"
          aria-label="Dislike"
        />
      );
    case "custom":
      return <CustomEmojiImg code={mark.emoji.code} url={mark.emoji.url} className="!h-8 !max-w-[2.75rem]" />;
    default:
      return (
        <span className="max-w-full truncate px-1 text-2xl leading-none" data-testid="reaction-text">
          {mark.text}
        </span>
      );
  }
}

const VERB: Record<ReactionMark["type"], string> = {
  like: "Liked",
  dislike: "Disliked",
  custom: "Reacted",
  text: "Reacted",
};

export function ReactionHero({ event }: { event: ActivityEvent }) {
  const reaction = useMemo(() => readReaction(event), [event]);
  const targets = useMemo(() => (reaction.target ? [reaction.target] : []), [reaction]);
  const refs = useRefEvents(targets);
  const what =
    reaction.targetKind === 0
      ? "profile"
      : reaction.targetKind !== null
        ? kindTypeLabel(reaction.targetKind).toLowerCase()
        : "post";
  return (
    <div data-testid="reaction-hero">
      <ActivityHeader
        title={
          reaction.mark.type === "custom" ? (
            <>
              {VERB.custom} :{reaction.mark.emoji.code}:
            </>
          ) : (
            VERB[reaction.mark.type]
          )
        }
        subtitle={
          reaction.to ? (
            <>
              A reaction to <PersonName pubkey={reaction.to} />
              &rsquo;s {what}
            </>
          ) : reaction.external ? (
            `A reaction to ${reaction.external.url ? "a web page" : "something outside Nostr"}`
          ) : null
        }
        mark={<Mark mark={reaction.mark} />}
      />

      {reaction.target ? (
        <Section kicker="Reacted to" testId="reaction-target">
          <QuotedRef target={reaction.target} refs={refs} />
        </Section>
      ) : reaction.external ? (
        <Section
          kicker={
            <span className="inline-flex items-center gap-2">
              Reacted to
              {reaction.external.kind && (
                <Chip size="sm" tone="slate" data-testid="reaction-external-kind">
                  {reaction.external.kind}
                </Chip>
              )}
            </span>
          }
          testId="reaction-target"
        >
          <ExternalTargetCard target={reaction.external} />
        </Section>
      ) : null}
    </div>
  );
}
