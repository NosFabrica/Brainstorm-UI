/**
 * A fundraiser's page — a NIP-75 zap goal or an Agora campaign — laid out
 * the way a crowdfunding page is: the banner, the ask, how far it has come,
 * the one thing to do (zap it, or pay the campaign's address), the story, and
 * the people who have given, with what they said.
 */
import { useState } from "react";
import { Bitcoin, CalendarClock, HandHeart, Zap } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { MediaImg } from "@/components/ui/media-img";
import { Chip } from "@/components/ui/chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { ReadingText } from "@/components/share/ReadingText";
import { ZapModal } from "@/components/ZapModal";
import { useFaceProfiles } from "@/components/search/cards";
import { fetchFromSearch, parseZapReceipt } from "@/services/search";
import { ago } from "@/lib/ago";
import type { Thing } from "@/lib/thing";
import type { Detail } from "./types";
import {
  ActionButton,
  ActionLink,
  Actions,
  CopyButton,
  InfoBox,
  Kicker,
  PageTitle,
  Section,
  SectionNote,
  nameOf,
  refetch,
  useFetched,
  useProfileContent,
  type PageEvent,
} from "./shared";
import { EmojiText } from "@/components/ui/custom-emoji";

interface Gift {
  id: string;
  pubkey: string | null;
  sats: number;
  memo: string;
  at: number;
}

const RECEIPTS_ASKED = 500;

const giftsKey = (event: PageEvent) => `fund-gifts:${event.id}`;

/**
 * The receipts that name this fundraiser (by id, and by address when it has
 * one), as gifts. A zap goal's `closed_at` ends it: NIP-75 says receipts after
 * it don't count, so they are left out.
 */
function useGifts(event: PageEvent, closesAt: number | null): { gifts: Gift[]; capped: boolean } | undefined {
  return useFetched(giftsKey(event), async () => {
    const d = event.tags.find((t) => t[0] === "d")?.[1];
    const filters: Record<string, unknown>[] = [{ kinds: [9735], "#e": [event.id] }];
    if (d !== undefined && event.kind >= 30000)
      filters.push({ kinds: [9735], "#a": [`${event.kind}:${event.pubkey}:${d}`] });
    const receipts = await fetchFromSearch(filters, { limit: RECEIPTS_ASKED });
    const counted = closesAt === null ? receipts : receipts.filter((e) => e.created_at <= closesAt);
    const gifts = counted.map((e: NostrEvent) => {
      const r = parseZapReceipt(e);
      return {
        id: e.id,
        pubkey: r.pubkey,
        sats: r.msats ? Math.floor(r.msats / 1000) : 0,
        memo: r.memo,
        at: e.created_at,
      };
    });
    return { gifts, capped: receipts.length >= RECEIPTS_ASKED };
  });
}

const sats = (n: number) => new Intl.NumberFormat("en-US").format(n);

function deadlineWords(deadline: number): string {
  const ms = deadline * 1000 - Date.now();
  const date = new Date(deadline * 1000).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (ms <= 0) return `Ended ${date}`;
  const days = Math.floor(ms / 86_400_000);
  return days === 0 ? "Ends today" : `Ends in ${days} ${days === 1 ? "day" : "days"} · ${date}`;
}

export function FundraiserHero({
  event,
  thing,
  detail,
}: {
  event: PageEvent;
  thing: Thing;
  detail: Detail<"fundraiser">;
}) {
  const result = useGifts(event, detail.zapGoal ? detail.deadline : null);
  const raised = result ? result.gifts.reduce((n, g) => n + g.sats, 0) : null;
  const givers = result ? new Set(result.gifts.map((g) => g.pubkey).filter(Boolean)).size : 0;
  const pct = detail.zapGoal && raised !== null && detail.goalSats ? (raised / detail.goalSats) * 100 : null;
  const organizer = useProfileContent(event.pubkey);
  const lud16 = typeof organizer?.lud16 === "string" ? organizer.lud16 : "";
  const [zapping, setZapping] = useState(false);
  const address = event.tags.find((t) => t[0] === "w")?.[1];
  const story = event.tags.find((t) => t[0] === "description_long")?.[1] ?? thing.description;
  const d = event.tags.find((t) => t[0] === "d")?.[1];
  return (
    <div data-testid="thing-page-fundraiser">
      {thing.image && (
        <div className="relative -mx-1 -mt-1 mb-4 aspect-[2/1] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          <MediaImg
            src={thing.image}
            preset="media_1280"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <Kicker icon={HandHeart}>{detail.zapGoal ? "Zap goal" : "Fundraiser"}</Kicker>
      <PageTitle testId="thing-page-title">
        <EmojiText text={thing.title} tags={thing.emoji} />
      </PageTitle>

      {detail.goalSats !== null && (
        <div
          className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
          data-testid="thing-page-goal"
        >
          {detail.zapGoal && raised !== null ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {sats(raised)}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  sats raised of {sats(detail.goalSats)}
                  {result?.capped ? " (at least)" : ""}
                </span>
              </p>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round(pct ?? 0))}
                aria-label="Raised toward the goal"
              >
                <div
                  className="h-full rounded-full bg-brand-primary"
                  style={{ width: pct && pct > 0 ? `${Math.min(100, Math.max(pct, 1))}%` : "0%" }}
                />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.floor(pct ?? 0)}%</span>
                <span>
                  {givers} {givers === 1 ? "supporter" : "supporters"}
                </span>
                {detail.deadline !== null && <span>{deadlineWords(detail.deadline)}</span>}
              </p>
            </>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Goal</span>
                <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {sats(detail.goalSats)}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">sats</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                {detail.zapGoal ? (
                  <span>Counting zaps…</span>
                ) : (
                  <span>Raised on-chain — progress isn&apos;t on Nostr</span>
                )}
                {detail.deadline !== null && <span>{deadlineWords(detail.deadline)}</span>}
              </p>
            </>
          )}
        </div>
      )}

      <Actions testId="thing-page-actions">
        {detail.zapGoal &&
          (detail.ended ? (
            // Zaps after closed_at don't count (NIP-75): no button that takes money for nothing.
            <span className="text-xs text-slate-500 dark:text-slate-400" data-testid="thing-page-closed">
              This goal has closed.
            </span>
          ) : lud16 ? (
            <ActionButton primary icon={Zap} onClick={() => setZapping(true)} testId="thing-page-zap">
              Zap this goal
            </ActionButton>
          ) : organizer ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              The organizer has no lightning address to zap.
            </span>
          ) : null)}
        {address && (
          <ActionLink primary href={`bitcoin:${address}`} icon={Bitcoin} testId="thing-page-pay">
            Pay with bitcoin
          </ActionLink>
        )}
        {thing.link && <ActionLink href={thing.link}>Learn more</ActionLink>}
      </Actions>

      {address && (
        <div className="mt-4">
          <InfoBox label="Bitcoin address" icon={Bitcoin} testId="thing-page-address">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all font-mono text-sm text-slate-700 dark:text-slate-200">{address}</code>
              <CopyButton value={address} label="Copy" />
            </div>
          </InfoBox>
        </div>
      )}
      {!detail.zapGoal && detail.deadline !== null && detail.goalSats === null && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <CalendarClock className="h-3.5 w-3.5" /> {deadlineWords(detail.deadline)}
        </p>
      )}
      {detail.topics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {detail.topics.map((t) => (
            <Chip key={t} size="sm" tone="slate">
              #{t}
            </Chip>
          ))}
        </div>
      )}
      {story && <ReadingText text={story} tags={thing.emoji} className="mt-4" testId="thing-page-description" />}

      {detail.zapGoal && !detail.ended && lud16 && (
        <ZapModal
          open={zapping}
          onOpenChange={(open) => {
            setZapping(open);
            // The receipt is usually out by the time the dialog closes: count it.
            if (!open) refetch(giftsKey(event));
          }}
          recipientPubkey={event.pubkey}
          lud16={lud16}
          displayName={(organizer?.display_name as string) || (organizer?.name as string) || "the organizer"}
          picture={typeof organizer?.picture === "string" ? organizer.picture : undefined}
          target={{
            eventId: event.id,
            address: d !== undefined && event.kind >= 30000 ? `${event.kind}:${event.pubkey}:${d}` : undefined,
            // NIP-75: the goal names the relays its zaps are sent to and tallied from.
            relays: goalRelays(event),
          }}
        />
      )}
    </div>
  );
}

/** A zap goal's `relays` tag — the relays other clients tally its zaps from. */
function goalRelays(event: PageEvent): string[] {
  const tag = event.tags.find((t) => t[0] === "relays");
  return (tag?.slice(1) ?? []).filter((r) => /^wss?:\/\//i.test(r));
}

export function FundraiserSections({ event, detail }: { event: PageEvent; detail: Detail<"fundraiser"> }) {
  const result = useGifts(event, detail.zapGoal ? detail.deadline : null);
  const gifts = result?.gifts ?? [];
  const faces = useFaceProfiles([...new Set(gifts.map((g) => g.pubkey).filter((p): p is string => !!p))].slice(0, 60));
  return (
    <Section title="Zaps" count={gifts.length} testId="thing-page-supporters">
      {result === undefined ? (
        <SectionNote>Looking for zaps…</SectionNote>
      ) : gifts.length === 0 ? (
        <SectionNote>No zaps yet — be the first.</SectionNote>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {gifts.slice(0, 60).map((g) => {
            const p = g.pubkey ? faces.get(g.pubkey) : undefined;
            return (
              <li key={g.id} className="flex items-start gap-3 px-4 py-3">
                <Avatar className="mt-0.5 h-8 w-8 shrink-0 border border-slate-200/80 dark:border-slate-800/80">
                  {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {g.pubkey ? nameOf(p, g.pubkey) : "Anonymous"}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{ago(g.at)}</span>
                  </p>
                  {g.memo && <p className="mt-0.5 break-words text-sm text-slate-600 dark:text-slate-300">{g.memo}</p>}
                </div>
                {g.sats > 0 && (
                  <Chip tone="slate" icon={Zap} className="shrink-0 tabular-nums">
                    {sats(g.sats)}
                  </Chip>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
