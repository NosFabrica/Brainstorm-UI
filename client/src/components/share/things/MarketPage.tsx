/**
 * The pages for kind 38000's other formats — the number NIP-87 mint reviews
 * share with BAO prediction markets and with ballots (lib/thing's
 * kind38000Format tells them apart).
 *
 * A market's page leads with the question, where it stands and what can be
 * picked — the winner marked once it resolves — then the terms: when betting
 * closes, what settles it, the bet limits and fee. Below, the same creator's
 * other markets in its category. A ballot's page is the election it belongs
 * to and the voter's answers, each question on its own row.
 */
import { TrendingUp, Vote } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { ReadingText } from "@/components/share/ReadingText";
import {
  MARKET_STATUS_CHIP,
  MarketOutcomes,
  baoMarketLinkLabel,
  marketCloseWords,
} from "@/components/search/thingCards";
import { fetchFromSearch } from "@/services/search";
import { describeThing, marketStatusNow, type Thing } from "@/lib/thing";
import { eventPath } from "@/lib/shareId";
import type { Detail } from "./types";
import {
  ActionLink,
  Actions,
  FactRows,
  InfoBox,
  Kicker,
  PageTitle,
  Section,
  SectionNote,
  useFetched,
  type PageEvent,
} from "./shared";

const tagOf = (e: PageEvent, k: string) => e.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;

const sats = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("en-US")} sats` : null;
};

export function MarketHero({ event, thing, detail }: { event: PageEvent; thing: Thing; detail: Detail<"market"> }) {
  const now = marketStatusNow(detail);
  const status = now ? MARKET_STATUS_CHIP[now] : null;
  const source = tagOf(event, "resolution_source");
  const min = sats(tagOf(event, "min_bet"));
  const max = sats(tagOf(event, "max_bet"));
  const fee = tagOf(event, "fee_percent");
  const cancelled = tagOf(event, "cancel_reason");
  return (
    <div data-testid="thing-page-market">
      <Kicker icon={TrendingUp}>Prediction market</Kicker>
      <PageTitle testId="thing-page-title">{thing.title}</PageTitle>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {status && (
          <Chip size="sm" tone={status.tone}>
            {status.word}
          </Chip>
        )}
        {detail.demo && (
          <Chip size="sm" tone="warning">
            Demo network — play money
          </Chip>
        )}
        {detail.category && <span className="text-xs text-slate-500 dark:text-slate-400">{detail.category}</span>}
      </div>
      {thing.description && <ReadingText text={thing.description} className="mt-4" testId="thing-page-description" />}
      {detail.outcomes.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Outcomes
          </p>
          <MarketOutcomes detail={detail} max={12} testId="thing-page-outcomes" />
        </div>
      )}
      {thing.link && (
        <>
          <Actions testId="thing-page-actions">
            <ActionLink href={thing.link} primary={now === "open"} testId="thing-page-bao-link">
              {baoMarketLinkLabel(detail)}
            </ActionLink>
          </Actions>
          {/* BAO's own FAQ (2026-10-01): demo is open to anyone, free play sats, no KYC. */}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="thing-page-bao-note">
            {detail.demo
              ? "Anyone can join on BAO's demo network: sign in with Nostr or a guest account and claim free play sats. No KYC."
              : "Trades real bitcoin on BAO's alpha network, over Lightning, Liquid or ecash. No KYC."}
          </p>
        </>
      )}
      <div className="mt-4">
        <InfoBox label="Terms" icon={TrendingUp} testId="thing-page-terms">
          <FactRows
            rows={[
              ["Resolved as", detail.resolution],
              ["Cancelled", cancelled],
              [
                detail.closes !== null && detail.closes * 1000 <= Date.now() ? "Closed" : "Closes",
                detail.closes !== null ? new Date(detail.closes * 1000).toLocaleString() : null,
              ],
              [
                "Settled by",
                source ? (
                  /^https?:\/\//i.test(source) ? (
                    <a href={source} target="_blank" rel="noopener noreferrer" className="underline">
                      {source.replace(/^https?:\/\//i, "")}
                    </a>
                  ) : (
                    source
                  )
                ) : null,
              ],
              ["Bets", min && max ? `${min} – ${max}` : (min ?? max)],
              ["Fee", fee ? `${fee}%` : null],
            ]}
          />
        </InfoBox>
      </div>
    </div>
  );
}

/** The same creator's other markets in this one's category — BAO tags its category `c`, which the relay filters on. */
export function MarketSections({ event, detail }: { event: PageEvent; detail: Detail<"market"> }) {
  const c = tagOf(event, "c");
  const more = useFetched(c ? `markets:${event.pubkey}:${c}` : null, () =>
    fetchFromSearch([{ kinds: [38000], authors: [event.pubkey], "#c": [c] }], { limit: 30 }),
  );
  if (!c) return null;
  const others = (more ?? [])
    .filter((e) => e.id !== event.id)
    .map((e) => ({ e, thing: describeThing(e) }))
    .filter(
      (x): x is { e: typeof x.e; thing: Thing & { detail: Detail<"market"> } } => x.thing?.detail.type === "market",
    )
    .slice(0, 12);
  return (
    <Section title={`More ${detail.category ?? c} markets`} count={others.length} testId="thing-page-more-markets">
      {more === undefined ? (
        <SectionNote>Looking for more markets…</SectionNote>
      ) : others.length === 0 ? (
        <SectionNote>No other markets in this category.</SectionNote>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {others.map(({ e, thing }) => {
            const now = marketStatusNow(thing.detail);
            const status = now ? MARKET_STATUS_CHIP[now] : null;
            return (
              <li key={e.id}>
                <Link
                  href={eventPath(e)}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {thing.title}
                    </span>
                    {thing.detail.closes !== null && now === "open" && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {marketCloseWords(thing.detail.closes)}
                      </span>
                    )}
                  </span>
                  {status && (
                    <Chip size="sm" tone={status.tone}>
                      {status.word}
                    </Chip>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function BallotHero({ thing, detail }: { thing: Thing; detail: Detail<"ballot"> }) {
  return (
    <div data-testid="thing-page-ballot">
      <Kicker icon={Vote}>Ballot</Kicker>
      <PageTitle testId="thing-page-title">{thing.title}</PageTitle>
      <div className="mt-4">
        <InfoBox label="Answers" icon={Vote} testId="thing-page-answers">
          {detail.answers.length ? (
            <FactRows rows={detail.answers.map((a) => [a.question, a.answer])} />
          ) : (
            <SectionNote>This ballot carries no answers we can read.</SectionNote>
          )}
        </InfoBox>
      </div>
      {detail.proofHash && (
        <p className="mt-3 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
          Proof {detail.proofHash}
        </p>
      )}
    </div>
  );
}
