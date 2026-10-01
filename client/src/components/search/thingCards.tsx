/**
 * Cards for the kinds with no card elsewhere — each drawn for what it is, from
 * the one read lib/thing makes of it:
 *
 * - CommunityCard   NIP-72 communities, NIP-29 relay groups, NIP-28 channels
 * - FundraiserCard  NIP-75 zap goals (with what they have raised) and Agora campaigns
 * - ReviewCard      relay reviews, NIP-87 mint reviews, ratings of anything
 * - MarketCard      BAO prediction markets (kind 38000, shared with mint reviews)
 * - BallotCard      ballots cast in an auditable-voting app (kind 38000 too)
 * - ShopPlaceCard   NIP-15 stalls and marketplaces, shaped like a listing for the Shop grid
 * - AppThingCard    NIP-89 handlers, NIP-5A Nostr sites, NIP-5D mini apps, shaped like an app card
 * - CalendarCard    NIP-52 calendars
 * - BadgeCard       NIP-58 badges
 * - EmojiPackCard   NIP-51 emoji sets
 * - PlaylistCard    music playlists and albums
 * - LearningCard    learning resources
 * - TorrentCard     NIP-35 torrents, with a magnet link
 *
 * Every card keeps the same frame as its neighbours (CardShell, the author
 * footer, slate chips) and `thing-card-<id>` as its root, so a tab that mixes
 * them with its own cards reads as one list. Colour is kept for what it
 * communicates: a review's stars, a goal's progress, a group that is open.
 */
import {
  AppWindow,
  Archive,
  Award,
  CalendarDays,
  Check,
  Disc3,
  File,
  Film,
  Globe,
  GraduationCap,
  HandHeart,
  Hash,
  Image as ImageIcon,
  MapPin,
  MessagesSquare,
  Music,
  Package,
  ScrollText,
  Star,
  Store,
  TrendingUp,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Chip } from "@/components/ui/chip";
import { KindPill } from "@/components/ui/kind-pill";
import { MediaImg } from "@/components/ui/media-img";
import { Favicon } from "@/components/share/LinkPreview";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { AuthorRow, CardShell, CuratorFooter, hostLabel, hostOf, useFaceProfiles } from "@/components/search/cards";
import {
  describeThing,
  hostOfUrl,
  type MarketStatus,
  type Thing,
  type ThingDetail,
  type TorrentCategory,
} from "@/lib/thing";
import { tone as resolveTone, type Tone } from "@/lib/tones";
import { kindTypeLabel } from "@/lib/kindLabel";
import { formatBytes } from "@/lib/formatBytes";
import { languageName } from "@/lib/translate";
import type { GoalProgress } from "@/services/search";
import type { SearchResult } from "@/lib/profileSearch";

type Detail<T extends ThingDetail["type"]> = Extract<ThingDetail, { type: T }>;

interface CardProps<T extends ThingDetail["type"]> {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  thing: Thing;
  detail: Detail<T>;
}

/**
 * The card for an event lib/thing can name, chosen by what it is. Returns
 * nothing for one it cannot — the tabs gate on the same read, so a tab never
 * asks it to.
 */
export function ThingCard({
  event,
  author,
  score,
  thing: given,
  progress,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  /** Already read by the caller; read here when not. */
  thing?: Thing | null;
  /** A zap goal's raised total, when the page fetched it. */
  progress?: GoalProgress | null;
}) {
  const thing = given ?? describeThing(event);
  if (!thing) return null;
  const base = { event, author, score, thing };
  const d = thing.detail;
  switch (d.type) {
    case "community":
      return <CommunityCard {...base} detail={d} />;
    case "fundraiser":
      return <FundraiserCard {...base} detail={d} progress={progress} />;
    case "review":
      return <ReviewCard {...base} detail={d} />;
    case "market":
      return <MarketCard {...base} detail={d} />;
    case "ballot":
      return <BallotCard {...base} detail={d} />;
    case "shop":
      return <ShopPlaceCard {...base} detail={d} />;
    case "app":
      return <AppThingCard {...base} detail={d} />;
    case "calendar":
      return <CalendarCard {...base} detail={d} />;
    case "badge":
      return <BadgeCard {...base} detail={d} />;
    case "emoji":
      return <EmojiPackCard {...base} detail={d} />;
    case "playlist":
      return <PlaylistCard {...base} detail={d} />;
    case "learning":
      return <LearningCard {...base} detail={d} />;
    case "torrent":
      return <TorrentCard {...base} detail={d} />;
  }
}

// ——— Shared pieces ———

/** Five stars, filled to the rating (rounded to the half) — a review's score at a glance. */
export function Stars({ stars, size = "sm", testId }: { stars: number; size?: "sm" | "md"; testId?: string }) {
  const halves = Math.round(stars * 2);
  const box = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${(halves / 2).toString()} out of 5 stars`}
      data-testid={testId}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = halves >= (i + 1) * 2 ? "full" : halves === i * 2 + 1 ? "half" : "none";
        return (
          <span key={i} className={`relative ${box}`}>
            <Star className={`absolute inset-0 ${box} text-slate-300 dark:text-slate-600`} />
            {fill !== "none" && (
              <span className={`absolute inset-0 overflow-hidden ${fill === "half" ? "w-1/2" : "w-full"}`}>
                <Star className={`${box} fill-amber-400 text-amber-400`} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** A thing's own picture in a fixed box, or its kind's icon on the quiet ground when it has none (or it fails). */
function Picture({
  src,
  icon: Icon,
  shape = "rounded",
  size = "md",
  fit = "cover",
  testId,
}: {
  src: string | null;
  icon: LucideIcon;
  shape?: "rounded" | "round";
  size?: "sm" | "md" | "lg";
  fit?: "cover" | "contain";
  testId?: string;
}) {
  // The icon only stands in for a missing picture: under a transparent PNG
  // (badge art, app icons) it would show through.
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = !!src && failed !== src;
  const box = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-10 w-10" : "h-12 w-12";
  const iconBox = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span
      className={`relative flex ${box} shrink-0 items-center justify-center overflow-hidden bg-slate-100 shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10 ${shape === "round" ? "rounded-full" : "rounded-xl"}`}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain p-1" : "object-cover"}`}
          onError={() => setFailed(src)}
          data-testid={testId}
        />
      ) : (
        <Icon className={`${iconBox} text-slate-400 dark:text-slate-500`} aria-hidden="true" />
      )}
    </span>
  );
}

/** The name, with the reader's optional kind label beside it. */
function Title({ event, thing, clamp = 1 }: { event: NostrEvent; thing: Thing; clamp?: 1 | 2 }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <p
        className={`min-w-0 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100 ${clamp === 1 ? "truncate" : "line-clamp-2 break-words"}`}
        data-testid={`thing-title-${event.id}`}
      >
        {thing.title}
      </p>
      <KindPill event={event} mixed={false} />
    </div>
  );
}

function Description({ event, text, lines = 2 }: { event: NostrEvent; text: string | null; lines?: 2 | 3 | 4 }) {
  if (!text) return null;
  const clamp = lines === 4 ? "line-clamp-4" : lines === 3 ? "line-clamp-3" : "line-clamp-2";
  return (
    <p
      className={`mt-1 break-words text-xs leading-[1.125rem] text-slate-500 dark:text-slate-400 ${clamp}`}
      data-testid={`thing-description-${event.id}`}
    >
      {text}
    </p>
  );
}

/** One quiet line of meta, parts joined by a middle dot. */
function MetaLine({ parts, icon: Icon }: { parts: (string | null | false | undefined)[]; icon?: LucideIcon }) {
  const shown = parts.filter((p): p is string => !!p);
  if (shown.length === 0) return null;
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{shown.join(" · ")}</span>
    </p>
  );
}

function Topics({ topics, max = 3 }: { topics: string[]; max?: number }) {
  if (topics.length === 0) return null;
  return (
    <>
      {topics.slice(0, max).map((t) => (
        <Chip key={t} size="sm" tone="slate">
          #{t}
        </Chip>
      ))}
    </>
  );
}

/** A few faces with tier rings, overlapping, and how many more stand behind them. */
function Faces({ pubkeys, max = 4, testId }: { pubkeys: string[]; max?: number; testId?: string }) {
  const shown = pubkeys.slice(0, max);
  const profiles = useFaceProfiles(shown);
  const scoreOf = useAuthorScores(shown);
  const tierRing = useTierRing();
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5" data-testid={testId}>
      <span className="flex -space-x-1.5">
        {shown.map((pk) => {
          const profile = profiles.get(pk);
          return (
            <Avatar
              key={pk}
              className={`h-6 w-6 border-2 border-white dark:border-slate-900 ${tierRing(scoreOf(pk) ?? null, false, "sm", true) ?? ""}`}
            >
              {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
              <AvatarFallback className="overflow-hidden">
                <DefaultAvatarImg />
              </AvatarFallback>
            </Avatar>
          );
        })}
      </span>
      {pubkeys.length > shown.length && (
        <span className="text-[11px] text-slate-500 dark:text-slate-400">+{pubkeys.length - shown.length}</span>
      )}
    </span>
  );
}

/** The footer every card closes on, pushed to the bottom so a grid row lines up; room kept for a link in its corner. */
function Footer({
  kicker,
  author,
  score,
  at,
  linked = false,
}: {
  kicker: string;
  author: SearchResult | null;
  score?: number | null;
  at: number;
  linked?: boolean;
}) {
  return (
    <div className={`mt-auto pt-3 ${linked ? "pr-24" : ""}`}>
      <CuratorFooter kicker={kicker} author={author} score={score} created_at={at} />
    </div>
  );
}

const COMMUNA: Record<Detail<"community">["variant"], { word: string; icon: LucideIcon }> = {
  moderated: { word: "Community", icon: Users },
  group: { word: "Relay group", icon: Users },
  channel: { word: "Public chat", icon: MessagesSquare },
};

// ——— Communities ———

/**
 * A place to join: its picture (a circle, the way chat apps show a room),
 * name, what kind of place it is, and — where it says — whether anyone may
 * join and who moderates it. The moderators are faces, not a count: who runs
 * a community is what a searcher weighs.
 */
export function CommunityCard(props: CardProps<"community">) {
  const { event, thing, detail } = props;
  const kind = COMMUNA[detail.variant];
  return (
    <CardShell event={event} fill testId={`thing-card-${event.id}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <Picture src={thing.image} icon={kind.icon} shape="round" testId={`thing-image-${event.id}`} />
          <div className="min-w-0 flex-1">
            <Title event={event} thing={thing} />
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{kind.word}</span>
              {detail.variant === "group" && (
                <>
                  <Chip size="sm" tone={detail.isOpen ? "success" : "slate"}>
                    {detail.isOpen ? "Open to join" : "Closed"}
                  </Chip>
                  {!detail.isPublic && (
                    <Chip size="sm" tone="slate">
                      Private
                    </Chip>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <Description event={event} text={thing.description} lines={3} />
        {detail.rules && <MetaLine icon={ScrollText} parts={[detail.rules.split("\n")[0]]} />}
        {detail.moderators.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Moderators
            </span>
            <Faces pubkeys={detail.moderators} testId={`thing-moderators-${event.id}`} />
          </div>
        )}
        <Footer kicker="Created by" author={props.author} score={props.score} at={event.created_at} linked={false} />
      </div>
    </CardShell>
  );
}

// ——— Fundraisers ———

const sats = (n: number) => new Intl.NumberFormat("en-US").format(n);
const satsWord = (n: number) => `${sats(n)} ${n === 1 ? "sat" : "sats"}`;
const compactSats = (n: number) =>
  n >= 1_000_000
    ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n / 1_000_000)}M`
    : n >= 10_000
      ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n / 1000)}k`
      : sats(n);

/** "Ends in 3 days", "Ends today", "Ended Sep 4". */
function deadlineWords(deadline: number, now = Date.now()): string {
  const ms = deadline * 1000 - now;
  const date = new Date(deadline * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (ms <= 0) return `Ended ${date}`;
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Ends today";
  if (days < 30) return `Ends in ${days} ${days === 1 ? "day" : "days"}`;
  return `Ends ${date}`;
}

/**
 * A cause, the way a crowdfunding page leads: the banner, the ask, and how
 * far it has come. A zap goal is raised by zaps, so its bar is real — the
 * receipts that name it, summed by the page (fetchGoalProgress); an Agora
 * campaign is raised on-chain, so it says its goal and its deadline and
 * claims no progress it cannot see.
 */
export function FundraiserCard(props: CardProps<"fundraiser"> & { progress?: GoalProgress | null }) {
  const { event, thing, detail, progress } = props;
  const linkHost = thing.link ? (hostOf(thing.link) ?? undefined) : undefined;
  const raised = detail.zapGoal && progress ? progress.sats : null;
  // The bar stops at full; the number says how far past it a goal went.
  const pct = raised !== null && detail.goalSats ? (raised / detail.goalSats) * 100 : null;
  return (
    <CardShell
      event={event}
      openInUrl={thing.link ?? undefined}
      openInLabel={linkHost ? `Visit ${hostLabel(linkHost)}` : undefined}
      openInHost={linkHost}
      openInTestId={`thing-link-${event.id}`}
      openInPlacement="corner-icon"
      fill
      testId={`thing-card-${event.id}`}
    >
      <div className="flex h-full flex-col">
        <div className="relative -mx-1 -mt-1 aspect-[2/1] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          {!thing.image && (
            <span className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
              <HandHeart className="h-8 w-8" aria-hidden="true" />
            </span>
          )}
          {thing.image && (
            <MediaImg
              src={thing.image}
              preset="media_640"
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              data-testid={`thing-image-${event.id}`}
            />
          )}
          <span className="absolute left-2 top-2 rounded-md bg-slate-900/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {detail.zapGoal ? "Zap goal" : "Fundraiser"}
          </span>
          {detail.ended && (
            <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
              Ended
            </span>
          )}
        </div>
        <div className="mt-2.5">
          <Title event={event} thing={thing} clamp={2} />
          <Description event={event} text={thing.description} />
        </div>
        {detail.goalSats !== null && (
          <div className="mt-3" data-testid={`thing-goal-${event.id}`}>
            {pct !== null && (
              <div
                className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round(pct))}
                aria-label="Raised toward the goal"
              >
                <div
                  className="h-full rounded-full bg-brand-primary"
                  style={{ width: pct > 0 ? `${Math.min(100, Math.max(pct, 2))}%` : "0%" }}
                />
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                {raised !== null ? (
                  <>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{satsWord(raised)}</span> of{" "}
                    {compactSats(detail.goalSats)}
                  </>
                ) : (
                  <>
                    Goal{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {sats(detail.goalSats)} sats
                    </span>
                  </>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                {pct !== null ? `${Math.floor(pct)}%` : detail.zapGoal ? "" : "Raised on-chain"}
              </span>
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {detail.zapGoal && progress && progress.zappers.length > 0 && (
            <Faces pubkeys={progress.zappers} max={3} testId={`thing-zappers-${event.id}`} />
          )}
          {detail.deadline !== null && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{deadlineWords(detail.deadline)}</span>
          )}
          <Topics topics={detail.topics} max={2} />
        </div>
        <Footer kicker="Organized by" author={props.author} score={props.score} at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Reviews ———

const MARK_ICONS: Record<string, LucideIcon> = {
  Book: ScrollText,
  Movie: Film,
  Film: Film,
  Music: Music,
  Podcast: Music,
  Place: MapPin,
  Product: Package,
  Hashtag: Hash,
  "Web page": Globe,
  Person: Users,
};

/**
 * A review reads like one: what is reviewed — the relay's or mint's own
 * icon and host, or what sort of thing — the stars and the score, then the
 * reviewer's words as a quote, and a relay's per-aspect scores.
 */
export function ReviewCard(props: CardProps<"review">) {
  const { event, thing, detail } = props;
  const host = detail.subject === "entity" ? null : hostOfUrl(thing.title);
  const linkHost = thing.link ? (hostOf(thing.link) ?? undefined) : undefined;
  const Icon = MARK_ICONS[detail.subjectLabel] ?? Star;
  return (
    <CardShell
      event={event}
      openInUrl={thing.link ?? undefined}
      openInLabel={linkHost ? `Visit ${hostLabel(linkHost)}` : undefined}
      openInHost={linkHost}
      openInTestId={`thing-link-${event.id}`}
      openInPlacement="footer"
      fill
      testId={`thing-card-${event.id}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
            {host ? (
              <Favicon host={host} className="h-5 w-5 rounded-sm text-slate-400" />
            ) : (
              <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <Title event={event} thing={thing} />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{detail.subjectLabel}</p>
          </div>
          {thing.stars !== null && (
            <span className="shrink-0 text-lg font-semibold leading-none text-slate-900 dark:text-slate-100">
              {thing.stars.toFixed(1)}
            </span>
          )}
        </div>
        {thing.stars !== null && (
          <div className="mt-2">
            <Stars stars={thing.stars} size="md" testId={`thing-stars-${event.id}`} />
          </div>
        )}
        {thing.description && (
          <blockquote
            className="mt-2 line-clamp-4 break-words border-l-2 border-slate-200 pl-3 text-[13px] leading-5 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            data-testid={`thing-description-${event.id}`}
          >
            {thing.description}
          </blockquote>
        )}
        {detail.aspects.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail.aspects.slice(0, 4).map((a, i) => (
              <Chip key={`${a.name}-${i}`} size="sm" tone="slate">
                {a.name} {(Math.round(a.stars * 2) / 2).toString()}/5
              </Chip>
            ))}
          </div>
        )}
        <Footer
          kicker="Reviewed by"
          author={props.author}
          score={props.score}
          at={event.created_at}
          linked={!!thing.link}
        />
      </div>
    </CardShell>
  );
}

// ——— Prediction markets ———

export const MARKET_STATUS_CHIP: Record<MarketStatus, { word: string; tone: Tone }> = {
  open: { word: "Open", tone: "success" },
  closed: { word: "Closed", tone: "slate" },
  resolved: { word: "Resolved", tone: "info" },
  cancelled: { word: "Cancelled", tone: "slate" },
};

export function marketCloseWords(closes: number, now = Date.now()): string {
  const ms = closes * 1000 - now;
  const date = new Date(closes * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (ms <= 0) return `Closed ${date}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24)
    return hours === 0 ? "Closes within the hour" : `Closes in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Closes in ${days} ${days === 1 ? "day" : "days"}`;
  return `Closes ${date}`;
}

/** "YES", "No", "YES (stays online)" — the two sides of a yes/no market, whatever the app wrote after them. */
const sideOf = (o: string): "yes" | "no" | null => {
  const w = o.trim().toLowerCase();
  return /^yes\b/.test(w) ? "yes" : /^no\b/.test(w) ? "no" : null;
};

/**
 * What can be picked. A yes/no market is two sides, green and red, the way
 * betting apps draw them; anything else is its outcomes in a row. Once it
 * resolves, the winner keeps its colour and a check and the rest go quiet;
 * a cancelled market's outcomes all go quiet.
 */
export function MarketOutcomes({
  detail,
  max = 5,
  testId,
}: {
  detail: Detail<"market">;
  max?: number;
  testId?: string;
}) {
  if (detail.outcomes.length === 0) return null;
  const won = detail.resolution?.trim().toLowerCase();
  const binary = detail.outcomes.length === 2 && detail.outcomes.every((o) => sideOf(o) !== null);
  const off = detail.status === "cancelled";
  const toneOf = (o: string): Tone => {
    const isWinner = !!won && o.trim().toLowerCase() === won;
    if (off || (won && !isWinner)) return "slate";
    if (isWinner) return "success";
    if (binary) return sideOf(o) === "yes" ? "success" : "danger";
    return "slate";
  };
  if (binary)
    // Two sides, side by side and full width — the way betting apps lay out Yes and No.
    return (
      <div className="grid grid-cols-2 gap-2" data-testid={testId}>
        {detail.outcomes.map((o) => {
          const isWinner = !!won && o.trim().toLowerCase() === won;
          const quiet = off || (!!won && !isWinner);
          const c = resolveTone(toneOf(o));
          return (
            <span
              key={o}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold ${c.bg} ${c.text} ${c.border} ${quiet ? "opacity-50" : ""}`}
              data-testid={isWinner ? "market-winner" : undefined}
            >
              {isWinner && <Check className="h-3.5 w-3.5 shrink-0" aria-label="Won" />}
              <span className="truncate">{o}</span>
            </span>
          );
        })}
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      {detail.outcomes.slice(0, max).map((o) => {
        const isWinner = !!won && o.trim().toLowerCase() === won;
        return (
          <Chip
            key={o}
            size="sm"
            tone={toneOf(o)}
            icon={isWinner ? Check : undefined}
            className={off || (won && !isWinner) ? "opacity-60" : undefined}
            data-testid={isWinner ? "market-winner" : undefined}
          >
            {o}
          </Chip>
        );
      })}
      {detail.outcomes.length > max && (
        <span className="text-[11px] text-slate-500 dark:text-slate-400">+{detail.outcomes.length - max} more</span>
      )}
    </div>
  );
}

/** Where a market stands, in one row of chips: its status, play money, its category. */
export function MarketStatusLine({ detail, testId }: { detail: Detail<"market">; testId?: string }) {
  const status = detail.status ? MARKET_STATUS_CHIP[detail.status] : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      {status && (
        <Chip size="sm" tone={status.tone} dot={detail.status === "open"}>
          {status.word}
        </Chip>
      )}
      {detail.demo && (
        <Chip size="sm" tone="warning">
          Demo · play money
        </Chip>
      )}
      {detail.category && (
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{detail.category}</span>
      )}
    </div>
  );
}

/**
 * A market at a glance, for wherever one turns up — a card, a search row, a
 * note that quotes it: where it stands, what can be picked, when it closes.
 */
export function MarketSummary({
  detail,
  max = 5,
  testId,
}: {
  detail: Detail<"market">;
  max?: number;
  testId?: string;
}) {
  const open = detail.status === "open" || detail.status === null;
  return (
    <div className="space-y-2" data-testid={testId}>
      <MarketStatusLine detail={detail} />
      <MarketOutcomes detail={detail} max={max} />
      {detail.closes !== null && open && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{marketCloseWords(detail.closes)}</p>
      )}
    </div>
  );
}

/**
 * A question to bet on: the question, where it stands, what can be picked
 * (and what won, once resolved), and when betting closes. A market on BAO's
 * demo network says so — its stakes are play money.
 */
export function MarketCard(props: CardProps<"market">) {
  const { event, thing, detail } = props;
  return (
    <CardShell event={event} fill testId={`thing-card-${event.id}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <Picture src={null} icon={TrendingUp} size="sm" />
          <div className="min-w-0 flex-1">
            <Title event={event} thing={thing} clamp={2} />
            <Description event={event} text={thing.description} />
          </div>
        </div>
        <div className="mt-3">
          <MarketSummary detail={detail} testId={`thing-market-${event.id}`} />
        </div>
        <Footer kicker="Created by" author={props.author} score={props.score} at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Ballots ———

/** A ballot's answers, question → answer, the first few and how many more. */
export function BallotAnswers({
  detail,
  max = 3,
  testId,
}: {
  detail: Detail<"ballot">;
  max?: number;
  testId?: string;
}) {
  if (detail.answers.length === 0) return null;
  return (
    <div data-testid={testId}>
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
        {detail.answers.slice(0, max).map((a, i) => (
          <div key={i} className="flex min-w-0 items-baseline gap-2 px-2.5 py-1.5">
            <dt className="max-w-[40%] shrink-0 truncate font-medium text-slate-500 dark:text-slate-400">
              {a.question}
            </dt>
            <dd className="min-w-0 flex-1 truncate text-right text-slate-800 dark:text-slate-100">{a.answer}</dd>
          </div>
        ))}
      </dl>
      {detail.answers.length > max && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          +{detail.answers.length - max} more {detail.answers.length - max === 1 ? "answer" : "answers"}
        </p>
      )}
    </div>
  );
}

/** A ballot: which election, and the voter's answers, a few lines of them. */
export function BallotCard(props: CardProps<"ballot">) {
  const { event, thing, detail } = props;
  return (
    <CardShell event={event} fill testId={`thing-card-${event.id}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <Picture src={null} icon={Vote} size="sm" />
          <div className="min-w-0 flex-1">
            <Title event={event} thing={thing} />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {detail.answers.length
                ? `${detail.answers.length} ${detail.answers.length === 1 ? "answer" : "answers"}`
                : "Ballot"}
              {detail.proofHash ? " · with proof" : ""}
            </p>
          </div>
        </div>
        <div className="mt-2.5">
          <BallotAnswers detail={detail} testId={`thing-ballot-answers-${event.id}`} />
        </div>
        <Footer kicker="Cast by" author={props.author} score={props.score} at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Shop places ———

/**
 * A stall or marketplace in the Shop grid, shaped like the listings around
 * it — a 4:3 face, a name, one line of what matters to a buyer — so the grid
 * keeps its rhythm. A stall publishes no picture, so it wears a storefront.
 */
export function ShopPlaceCard(props: CardProps<"shop">) {
  const { event, author, score, thing, detail } = props;
  const meta =
    detail.variant === "stall"
      ? [detail.currency && `Prices in ${detail.currency}`, shippingWords(detail.zones)]
      : [detail.merchants > 0 && `${detail.merchants} ${detail.merchants === 1 ? "merchant" : "merchants"}`];
  return (
    <CardShell event={event} fill testId={`thing-card-${event.id}`}>
      <div className="relative -mx-1 -mt-1 aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        {!thing.image && (
          <span className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <Store className="h-8 w-8" aria-hidden="true" />
          </span>
        )}
        {thing.image && (
          <MediaImg
            src={thing.image}
            preset="media_640"
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            data-testid={`thing-image-${event.id}`}
          />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-slate-900/85 px-2 py-0.5 text-[11px] font-semibold text-white">
          {detail.variant === "stall" ? "Shop" : "Marketplace"}
        </span>
      </div>
      <p
        className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100"
        data-testid={`thing-title-${event.id}`}
      >
        {thing.title}
      </p>
      <MetaLine parts={meta} />
      {thing.description && (
        <p
          className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400"
          data-testid={`thing-description-${event.id}`}
        >
          {thing.description}
        </p>
      )}
      <div className="mt-2">
        <AuthorRow
          author={author}
          score={score}
          created_at={event.created_at}
          trailing={<KindPill event={event} mixed={false} />}
        />
      </div>
    </CardShell>
  );
}

/** "Ships worldwide", "Digital delivery", "Ships to US, CA +3" — a stall's zones as a buyer reads them. */
function shippingWords(zones: string[]): string | null {
  if (zones.length === 0) return null;
  const lower = zones.map((z) => z.toLowerCase());
  if (lower.some((z) => z === "worldwide" || z === "world" || z === "international")) return "Ships worldwide";
  if (lower.every((z) => z === "online" || z === "digital" || z === "download")) return "Digital delivery";
  return `Ships to ${zones.slice(0, 2).join(", ")}${zones.length > 2 ? ` +${zones.length - 2}` : ""}`;
}

// ——— Apps, sites and mini apps ———

/** A root Nostr site is served at its author's npub on an nsite gateway. Named sites are not linked: their gateway name is not something to guess. */
function siteUrl(event: NostrEvent): string | null {
  if (event.kind !== 15128) return null;
  try {
    return `https://${nip19.npubEncode(event.pubkey)}.nsite.lol`;
  } catch {
    return null;
  }
}

/** A handled kind in words — every NIP-90 job request (5000–5999) is one thing to a reader: "DVM jobs". */
function handledKindWord(kind: number): string {
  if (kind >= 5000 && kind <= 5999) return "DVM jobs";
  if (kind >= 6000 && kind <= 6999) return "DVM results";
  return kindTypeLabel(kind);
}

const APP_ICONS: Record<Detail<"app">["variant"], LucideIcon> = { handler: Package, site: Globe, napplet: AppWindow };

/**
 * App-store anatomy, like the Zap Store cards beside it: name, a two-line
 * summary, one line of chips — for a handler, the kinds it opens, in words —
 * the icon in the corner, and the way in at the footer.
 */
export function AppThingCard(props: CardProps<"app">) {
  const { event, thing, detail } = props;
  const open = thing.link ?? siteUrl(event);
  const openHost = open ? (hostOf(open) ?? undefined) : undefined;
  const chips =
    detail.variant === "handler"
      ? detail.handles.map(handledKindWord).filter((l, i, all) => all.indexOf(l) === i)
      : detail.variant === "site"
        ? ["Nostr site", ...(detail.files > 1 ? [`${detail.files} files`] : [])]
        : ["Mini app", ...detail.requires];
  return (
    <CardShell
      event={event}
      openInUrl={open ?? undefined}
      openInLabel={detail.variant === "site" ? "Open site" : "Open"}
      openInHost={openHost}
      openInTestId={`thing-link-${event.id}`}
      openInPlacement="footer"
      fill
      testId={`thing-card-${event.id}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Title event={event} thing={thing} />
            {thing.description ? (
              <p
                className="mt-0.5 line-clamp-2 min-h-[2rem] break-words text-xs leading-4 text-slate-500 dark:text-slate-400"
                data-testid={`thing-description-${event.id}`}
              >
                {thing.description}
              </p>
            ) : null}
            <div className="mt-2 flex h-5 items-center gap-1.5 overflow-hidden" data-testid={`thing-chips-${event.id}`}>
              {chips.slice(0, 3).map((c) => (
                <Chip key={c} size="sm" tone="slate">
                  {c}
                </Chip>
              ))}
              {chips.length > 3 && (
                <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">+{chips.length - 3}</span>
              )}
            </div>
          </div>
          <Picture src={thing.image} icon={APP_ICONS[detail.variant]} testId={`thing-image-${event.id}`} />
        </div>
        <Footer kicker="Published by" author={props.author} score={props.score} at={event.created_at} linked={!!open} />
      </div>
    </CardShell>
  );
}

// ——— Calendars ———

/**
 * A calendar is a place events come from: a tile that says how many, the
 * name, where, and what it is about. It sits under the Events tab's
 * "Calendars" heading, below the dated events.
 */
export function CalendarCard(props: CardProps<"calendar">) {
  const { event, thing, detail } = props;
  return (
    <CardShell event={event} testId={`thing-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <span className="mt-0.5 text-sm font-semibold leading-none" data-testid={`thing-events-${event.id}`}>
            {detail.events}
          </span>
          <span className="text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {detail.events === 1 ? "event" : "events"}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <Title event={event} thing={thing} />
          {detail.location && <MetaLine icon={MapPin} parts={[detail.location]} />}
          <Description event={event} text={thing.description} />
          {detail.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Topics topics={detail.topics} />
            </div>
          )}
        </div>
        {thing.image && <Picture src={thing.image} icon={CalendarDays} size="lg" testId={`thing-image-${event.id}`} />}
      </div>
      <div className="pt-3">
        <CuratorFooter kicker="Curated by" author={props.author} score={props.score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Badges ———

/** A badge is its artwork: shown large, whole (never cropped), with its name and what it is given for. */
export function BadgeCard(props: CardProps<"badge">) {
  const { event, thing } = props;
  return (
    <CardShell event={event} testId={`thing-card-${event.id}`}>
      <div className="flex items-center gap-4">
        <Picture src={thing.image} icon={Award} size="lg" fit="contain" testId={`thing-image-${event.id}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Badge</p>
          <Title event={event} thing={thing} clamp={2} />
          <Description event={event} text={thing.description} lines={3} />
        </div>
      </div>
      <div className="pt-3">
        <CuratorFooter kicker="Issued by" author={props.author} score={props.score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Emoji packs ———

/** One emoji; a picture that will not load says its `:shortcode:` instead of leaving a hole in the tray. */
function Emoji({ code, url }: { code: string; url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="flex h-7 items-center rounded-md bg-white px-1.5 font-mono text-[10px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        :{code}:
      </span>
    );
  return (
    <img
      src={url}
      alt={`:${code}:`}
      title={`:${code}:`}
      loading="lazy"
      className="h-7 w-7 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/** The emoji are the pack: a tray of them, each named on hover, and how many more there are. */
export function EmojiPackCard(props: CardProps<"emoji">) {
  const { event, thing, detail } = props;
  const shown = detail.emoji.slice(0, 16);
  return (
    <CardShell event={event} testId={`thing-card-${event.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <Title event={event} thing={thing} />
        <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{detail.emoji.length} emoji</span>
      </div>
      <Description event={event} text={thing.description} />
      <div
        className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"
        data-testid={`thing-previews-${event.id}`}
      >
        {shown.map((e, i) => (
          <Emoji key={`${e.code}-${i}`} code={e.code} url={e.url} />
        ))}
        {detail.emoji.length > shown.length && (
          <span className="flex h-7 items-center px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            +{detail.emoji.length - shown.length}
          </span>
        )}
      </div>
      <div className="pt-3">
        <CuratorFooter kicker="Curated by" author={props.author} score={props.score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Playlists ———

const PLAYLIST_WORD: Record<Detail<"playlist">["variant"], string> = { album: "Album", ep: "EP", playlist: "Playlist" };

/** An album the way a music app lists one: the cover, what it is and by whom, and its first few tracks. */
export function PlaylistCard(props: CardProps<"playlist">) {
  const { event, thing, detail } = props;
  return (
    <CardShell event={event} testId={`thing-card-${event.id}`}>
      <div className="flex items-start gap-3">
        <Picture src={thing.image} icon={Disc3} size="lg" testId={`thing-image-${event.id}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {PLAYLIST_WORD[detail.variant]}
            {detail.tracks > 0 && ` · ${detail.tracks} ${detail.tracks === 1 ? "track" : "tracks"}`}
          </p>
          <Title event={event} thing={thing} />
          {detail.artist && <p className="truncate text-xs text-slate-600 dark:text-slate-300">{detail.artist}</p>}
          {detail.trackLines.length > 0 ? (
            <ol className="mt-1.5 space-y-0.5" data-testid={`thing-tracks-${event.id}`}>
              {detail.trackLines.map((line, i) => (
                <li key={i} className="flex min-w-0 gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-3 shrink-0 text-right tabular-nums text-slate-400 dark:text-slate-500">
                    {i + 1}
                  </span>
                  <span className="truncate">{line}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Description event={event} text={thing.description} />
          )}
        </div>
      </div>
      <div className="pt-3">
        <CuratorFooter kicker="Curated by" author={props.author} score={props.score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Learning resources ———

/**
 * A lesson, course or worksheet, read like an article: what it is for and
 * who made it, the facts a teacher filters by — language, free, licence,
 * audience — and the resource itself one tap away.
 */
export function LearningCard(props: CardProps<"learning">) {
  const { event, thing, detail } = props;
  const host = thing.link ? (hostOf(thing.link) ?? undefined) : undefined;
  return (
    <CardShell
      event={event}
      openInUrl={thing.link ?? undefined}
      openInLabel="Open resource"
      openInHost={host}
      openInTestId={`thing-link-${event.id}`}
      openInPlacement="footer"
      testId={`thing-card-${event.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <GraduationCap className="h-3 w-3" aria-hidden="true" /> Learning resource
          </p>
          <Title event={event} thing={thing} clamp={2} />
          {detail.creator && <p className="truncate text-xs text-slate-600 dark:text-slate-300">{detail.creator}</p>}
          <Description event={event} text={thing.description} lines={3} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {detail.free && (
              <Chip size="sm" tone="success">
                Free
              </Chip>
            )}
            {detail.language && (
              <Chip size="sm" tone="slate">
                {languageName(detail.language)}
              </Chip>
            )}
            {detail.license && (
              <Chip size="sm" tone="slate">
                {detail.license}
              </Chip>
            )}
            {detail.audience.map((a) => (
              <Chip key={a} size="sm" tone="slate">
                {a}
              </Chip>
            ))}
          </div>
        </div>
        {thing.image && <Picture src={thing.image} icon={GraduationCap} size="lg" testId={`thing-image-${event.id}`} />}
      </div>
      <div className={`pt-3 ${thing.link ? "pr-32" : ""}`}>
        <CuratorFooter kicker="Shared by" author={props.author} score={props.score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}

// ——— Torrents ———

const TORRENT_ICONS: Record<TorrentCategory, LucideIcon> = {
  audio: Music,
  video: Film,
  image: ImageIcon,
  software: Package,
  archive: Archive,
  other: File,
};

/** A magnet link: the info hash, the name, and a few trackers to start from. */
export function magnetOf(title: string, detail: Detail<"torrent">): string | null {
  if (!detail.infoHash) return null;
  const trackers = detail.trackers.slice(0, 3).map((t) => `&tr=${encodeURIComponent(t)}`);
  return `magnet:?xt=urn:btih:${detail.infoHash}&dn=${encodeURIComponent(title)}${trackers.join("")}`;
}

/**
 * A torrent as a download page shows one: what it holds (by its icon), the
 * uploader's words, the first files with their sizes, the totals — and the
 * magnet link, which is the way in.
 */
export function TorrentCard(props: CardProps<"torrent">) {
  const { event, thing, detail } = props;
  const Icon = TORRENT_ICONS[detail.category];
  const magnet = magnetOf(thing.title, detail);
  return (
    <CardShell
      event={event}
      openInUrl={magnet ?? undefined}
      openInLabel="Magnet link"
      openInTestId={`thing-link-${event.id}`}
      openInPlacement="footer"
      testId={`thing-card-${event.id}`}
    >
      <div className="flex items-start gap-3">
        <Picture src={null} icon={Icon} size="sm" />
        <div className="min-w-0 flex-1">
          <Title event={event} thing={thing} clamp={2} />
          <MetaLine
            parts={[
              detail.files.length > 0 && `${detail.files.length} ${detail.files.length === 1 ? "file" : "files"}`,
              detail.totalBytes > 0 && formatBytes(detail.totalBytes),
              detail.trackers.length > 0 &&
                `${detail.trackers.length} ${detail.trackers.length === 1 ? "tracker" : "trackers"}`,
            ]}
          />
          <Description event={event} text={thing.description} />
        </div>
      </div>
      {detail.files.length > 0 && (
        <ul
          className="mt-2.5 divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800"
          data-testid={`thing-files-${event.id}`}
        >
          {detail.files.slice(0, 3).map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="truncate font-mono text-[11px] text-slate-600 dark:text-slate-300">{f.name}</span>
              {f.bytes > 0 && (
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  {formatBytes(f.bytes)}
                </span>
              )}
            </li>
          ))}
          {detail.files.length > 3 && (
            <li className="px-2.5 py-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              +{detail.files.length - 3} more {detail.files.length - 3 === 1 ? "file" : "files"}
            </li>
          )}
        </ul>
      )}
      {detail.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Topics topics={detail.topics} />
        </div>
      )}
      <div className={`pt-3 ${magnet ? "pr-28" : ""}`}>
        <CuratorFooter kicker="Shared by" author={props.author} score={props.score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
}
