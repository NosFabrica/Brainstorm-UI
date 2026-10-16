/**
 * A poll under its question: a NIP-88 poll (kind 1068) or a zap poll (kind 6969).
 *
 * The full card — an event's own page — reads the answers from the EventStore
 * while asking the relays the poll names (ADR 0005), draws a bar per option,
 * who voted, and when it closes. A signed-in reader can answer a NIP-88 poll
 * until it closes; their own choice is marked. A zap poll is answered by
 * zapping an option, which needs a wallet flow this card does not have, so it
 * links out to a Nostr app instead.
 *
 * The compact card — a row in a list — shows the options and when the poll
 * closes, and asks no relay: a page of polls is not a page of tallies.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, Loader2, Vote, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiText } from "@/components/ui/custom-emoji";
import { Faces } from "@/components/search/thingCards";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { POLL_ANSWERS_CAP, fetchPollResponses, fetchZapPollReceipts, publishPollVote } from "@/services/polls";
import { nostrUriForEvent } from "@/lib/shareId";
import {
  POLL_KIND,
  POLL_RESPONSE_KIND,
  ZAP_POLL_KIND,
  ZAP_RECEIPT_KIND,
  choicesOf,
  closingWords,
  parsePoll,
  parseZapPoll,
  percentOf,
  pollClosed,
  tallyPoll,
  tallyZapPoll,
  zapPollClosed,
  zapRangeWords,
  type Poll,
  type ZapPoll,
} from "@/lib/polls";
import type { MinimalEvent } from "@/lib/noteRefs";

/** Options a compact card lists before "+N more". */
const COMPACT_OPTIONS = 4;

const sats = (n: number) => new Intl.NumberFormat("en-US").format(n);
const nowSeconds = () => Math.floor(Date.now() / 1000);
/** The longest a browser timer waits; a later close re-arms from there. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * The time, read again the moment a poll closes: one timeout to just past
 * `closesAt`, not a clock ticking every second. An open card stops taking
 * votes, and says "Ended", when its time comes.
 */
function useNowPast(closesAt: number | null): number {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    if (closesAt === null || closesAt < now) return;
    const timer = setTimeout(() => setNow(nowSeconds()), Math.min((closesAt + 1 - now) * 1000, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [closesAt, now]);
  return now;
}

export function PollCard({
  event,
  compact = false,
  relayHints = [],
}: {
  event: MinimalEvent;
  /** A row in a list: the options and the closing time, no tally and no relay asked. */
  compact?: boolean;
  /** Where the poll was found, to ask for its answers beside the relays it names and the usual ones. */
  relayHints?: string[];
}) {
  const poll = useMemo(() => parsePoll(event), [event]);
  const zapPoll = useMemo(() => parseZapPoll(event), [event]);
  if (event.kind === POLL_KIND && poll) {
    return compact ? (
      <CompactPoll
        kind="poll"
        labels={poll.options.map((o) => o.label || o.id)}
        tags={event.tags}
        rule={poll.multiple ? "Pick any" : "Pick one"}
        closes={closingWords(poll.endsAt, nowSeconds())}
      />
    ) : (
      // Keyed by the poll: a pick or an error on one never carries to the next drawn in its place.
      <NostrPoll key={poll.id} poll={poll} tags={event.tags} relayHints={relayHints} />
    );
  }
  if (event.kind === ZAP_POLL_KIND && zapPoll) {
    return compact ? (
      <CompactPoll
        kind="zap"
        labels={zapPoll.options.map((o) => o.label || `Option ${o.index + 1}`)}
        tags={event.tags}
        rule={zapRangeWords(zapPoll)}
        closes={closingWords(zapPoll.closedAt, nowSeconds())}
      />
    ) : (
      <ZapPollResults key={zapPoll.id} poll={zapPoll} tags={event.tags} relayHints={relayHints} />
    );
  }
  return null;
}

function CompactPoll({
  kind,
  labels,
  tags,
  rule,
  closes,
}: {
  kind: "poll" | "zap";
  labels: string[];
  tags: string[][];
  rule: string | null;
  closes: string | null;
}) {
  const Icon = kind === "zap" ? Zap : Vote;
  const more = labels.length - COMPACT_OPTIONS;
  return (
    <div className="mt-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800" data-testid="poll-compact">
      <ul className="space-y-1">
        {labels.slice(0, COMPACT_OPTIONS).map((label, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
            />
            <span className="min-w-0 truncate">
              <EmojiText text={label} tags={tags} />
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          +{more} more {more === 1 ? "option" : "options"}
        </p>
      )}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {[kind === "zap" ? "Zap poll" : "Poll", rule, closes].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

/** A bar behind an option's label, its width the option's share. */
function OptionBar({ pct, emphasis }: { pct: number; emphasis: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${emphasis ? "bg-brand-primary/15 dark:bg-brand-primary/25" : "bg-slate-100 dark:bg-slate-800"}`}
      style={{ width: `${pct}%` }}
    />
  );
}

/** The radio or checkbox in front of an option the reader can pick. */
function PickMark({ multiple, checked }: { multiple: boolean; checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center border ${multiple ? "rounded" : "rounded-full"} ${checked ? "border-brand-primary bg-brand-primary text-white" : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"}`}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}

const sameChoices = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function NostrPoll({ poll, tags, relayHints }: { poll: Poll; tags: string[][]; relayHints: string[] }) {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const filters = useMemo(() => [{ kinds: [POLL_RESPONSE_KIND], "#e": [poll.id] }], [poll.id]);
  const answers = useStoreEvents(`poll-votes:${poll.id}`, filters, () =>
    fetchPollResponses(poll.id, Array.from(new Set([...poll.relays, ...relayHints])), poll.endsAt),
  );
  const tally = useMemo(() => tallyPoll(poll, answers.events), [poll, answers.events]);
  // Read up to the ask's cap: past it, the count is "at least".
  const capped = answers.events.length >= POLL_ANSWERS_CAP;
  const mine = choicesOf(poll, tally, me);
  const now = useNowPast(poll.endsAt);
  const closed = pollClosed(poll, now);
  const canVote = !!me && !closed;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = picked ?? mine;
  const changed = picked !== null && picked.length > 0 && !sameChoices(picked, mine);
  const total = tally.voters.length;
  const here = typeof window !== "undefined" ? window.location.pathname : "";

  const pick = (id: string) => {
    setError(null);
    if (!poll.multiple) return setPicked([id]);
    setPicked(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);
  };

  const vote = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await publishPollVote(poll, picked);
      if (res.success) setPicked(null);
      else if (!res.cancelled) setError(res.error || "Your vote didn't reach any relay. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4" data-testid="poll">
      <ul
        className="space-y-2"
        role={canVote ? (poll.multiple ? "group" : "radiogroup") : undefined}
        aria-label={canVote ? "Poll options" : undefined}
      >
        {poll.options.map((o) => {
          const count = tally.votersByOption.get(o.id)?.length ?? 0;
          const pct = percentOf(count, total);
          const isMine = mine.includes(o.id);
          const isPicked = selection.includes(o.id);
          const inner = (
            <>
              <OptionBar pct={pct} emphasis={isMine} />
              <span className="relative flex items-center gap-2.5 px-3 py-2.5">
                {canVote && <PickMark multiple={poll.multiple} checked={isPicked} />}
                <span className="min-w-0 flex-1 break-words text-sm text-slate-800 dark:text-slate-100">
                  <EmojiText text={o.label || o.id} tags={tags} />
                </span>
                {isMine && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-deep dark:text-brand-link"
                    data-testid="poll-mine"
                  >
                    <Check className="h-3.5 w-3.5" /> You
                  </span>
                )}
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200"
                  title={`${count} ${count === 1 ? "vote" : "votes"}`}
                >
                  {pct}%
                </span>
              </span>
            </>
          );
          const frame = `relative block w-full overflow-hidden rounded-lg border text-left ${canVote && isPicked ? "border-brand-primary/50" : "border-slate-200 dark:border-slate-800"}`;
          return (
            <li key={o.id} data-testid={`poll-option-${o.id}`}>
              {canVote ? (
                <button
                  type="button"
                  role={poll.multiple ? "checkbox" : "radio"}
                  aria-checked={isPicked}
                  onClick={() => pick(o.id)}
                  disabled={busy}
                  className={`${frame} transition-colors hover:border-brand-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40`}
                >
                  {inner}
                </button>
              ) : (
                <div className={frame}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Faces pubkeys={tally.voters} testId="poll-faces" />
        <span data-testid="poll-total">
          {answers.loading && total === 0
            ? "Counting votes…"
            : `${total}${capped ? "+" : ""} ${total === 1 && !capped ? "voter" : "voters"}`}
        </span>
        <span aria-hidden="true">·</span>
        <span>{poll.multiple ? "Pick any" : "Pick one"}</span>
        {poll.endsAt !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span data-testid="poll-closes">{closingWords(poll.endsAt, now)}</span>
          </>
        )}
      </div>

      {canVote && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={vote} disabled={!changed || busy} data-testid="poll-vote">
            {busy && <Loader2 className="animate-spin" />}
            {mine.length ? "Change vote" : "Vote"}
          </Button>
          {picked !== null && !busy && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {!me && !closed && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          <Link
            href={`/login${here ? `?next=${encodeURIComponent(here)}` : ""}`}
            className="font-semibold text-brand-link hover:underline"
            data-testid="poll-sign-in"
          >
            Sign in to vote
          </Link>
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert" data-testid="poll-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Whether a zap poll's tally is known to be paid. Not yet: that takes checking
 * each receipt's signer against the poll author's LNURL `nostrPubkey`, which
 * nothing here resolves. Until then no option is shown as the consensus.
 */
const TALLY_VERIFIED: boolean = false;

function ZapPollResults({ poll, tags, relayHints }: { poll: ZapPoll; tags: string[][]; relayHints: string[] }) {
  const filters = useMemo(() => [{ kinds: [ZAP_RECEIPT_KIND], "#e": [poll.id] }], [poll.id]);
  const receipts = useStoreEvents(`zap-poll:${poll.id}`, filters, () =>
    fetchZapPollReceipts(poll.id, relayHints, poll.closedAt),
  );
  const tally = useMemo(() => tallyZapPoll(poll, receipts.events), [poll, receipts.events]);
  const now = useNowPast(poll.closedAt);
  const closed = zapPollClosed(poll, now);
  const zappers = useMemo(() => Array.from(new Set([...tally.zappers.values()].flat())), [tally]);
  const range = zapRangeWords(poll);

  return (
    <div className="mt-4" data-testid="zap-poll">
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const amount = tally.sats.get(o.index) ?? 0;
          const pct = percentOf(amount, tally.total);
          // Never declared on this tally: it is counted from receipts any key can sign
          // (the payments are the wallets' word), so a forged receipt could carry it.
          const consensus = TALLY_VERIFIED && poll.threshold !== null && tally.total > 0 && pct >= poll.threshold;
          return (
            <li
              key={o.index}
              className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800"
              data-testid={`zap-poll-option-${o.index}`}
            >
              <OptionBar pct={pct} emphasis={consensus} />
              <span className="relative flex items-center gap-2.5 px-3 py-2.5">
                <span className="min-w-0 flex-1 break-words text-sm text-slate-800 dark:text-slate-100">
                  <EmojiText text={o.label || `Option ${o.index + 1}`} tags={tags} />
                </span>
                {consensus && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Consensus
                  </span>
                )}
                <span className="shrink-0 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{sats(amount)}</span>{" "}
                  <span className="text-xs text-slate-500 dark:text-slate-400">sats · {pct}%</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
        {/* Each zap's request is checked (lib/polls), but that it was paid is the wallet's word: any key can sign a receipt. */}
        <span
          className="font-medium text-amber-700 dark:text-amber-300"
          title="Counted from zap receipts, which any key can sign: their requests are checked, the payments are not."
          data-testid="zap-poll-unverified"
        >
          Unverified tally (zap receipts)
        </span>
        <span aria-hidden="true">·</span>
        <Faces pubkeys={zappers} testId="zap-poll-faces" />
        <span
          data-testid="zap-poll-total"
          title={
            tally.unpinned > 0
              ? `${tally.unpinned} of these zaps' requests name no amount: their size is only the receipt's word.`
              : undefined
          }
        >
          {receipts.loading && tally.zaps === 0
            ? "Counting zaps…"
            : `${tally.unpinned > 0 ? "≈" : ""}${sats(tally.total)} sats from ${tally.zaps} ${tally.zaps === 1 ? "zap" : "zaps"}`}
        </span>
        {range && (
          <>
            <span aria-hidden="true">·</span>
            <span>Votes of {range} count</span>
          </>
        )}
        {poll.threshold !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>Consensus at {poll.threshold}%</span>
          </>
        )}
        {poll.closedAt !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span data-testid="zap-poll-closes">{closingWords(poll.closedAt, now)}</span>
          </>
        )}
      </div>

      {!closed && (
        <a
          href={nostrUriForEvent(poll.id, relayHints, poll.pubkey)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:underline"
          data-testid="zap-poll-open"
        >
          <Zap className="h-3.5 w-3.5" /> Zap an option to vote, in a Nostr app
        </a>
      )}
    </div>
  );
}
