/**
 * What every activity page is made of (components/share/activity): its
 * heading, the people in it, and the event it is about — quoted as the card a
 * note would quote it as, or said to be gone.
 */
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { ArrowRight, ExternalLink, Hash } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import { SectionHeader } from "@/components/ui/section-header";
import { useTierRing } from "@/components/score/VerificationCoin";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { EventRow } from "@/components/share/EventRow";
import { LinkChip, LinkPreviewCard } from "@/components/share/LinkPreview";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import type { ProfileLite, RefEvents } from "@/hooks/useRefEvents";
import type { EventRef, ExternalTarget } from "@/lib/activity";
import { isOver, parseCalendarEvent } from "@/lib/calendarEvent";
import { kindTypeLabel } from "@/lib/kindLabel";
import { parseATag, type MinimalEvent } from "@/lib/noteRefs";
import { eventPath, neventFor, READER_KINDS } from "@/lib/shareId";
import { topicPath } from "@/lib/topicQuery";

/** The page's heading: what happened, a line under it, and its mark on the right — the hero anatomy of a follow set or a designation. */
export function ActivityHeader({
  title,
  subtitle,
  icon: Icon,
  mark,
  chips,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Drawn in the mark's place: a reaction's emoji, a badge's picture. */
  mark?: ReactNode;
  chips?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className="break-words text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="activity-title"
          >
            {title}
          </h1>
          {chips}
        </div>
        {subtitle && (
          <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300" data-testid="activity-subtitle">
            {subtitle}
          </p>
        )}
      </div>
      {(mark || Icon) && (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800"
          data-testid="activity-mark"
        >
          {mark ?? (Icon && <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />)}
        </div>
      )}
    </div>
  );
}

/** A section of the page under a kicker. */
export function Section({ kicker, children, testId }: { kicker: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-5 space-y-2" data-testid={testId}>
      <SectionHeader kicker={kicker} />
      {children}
    </section>
  );
}

const npubOf = (pubkey: string) => {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return "";
  }
};

/** "@Alice", from their profile, or their short key until it arrives. */
export function PersonName({ pubkey }: { pubkey: string }) {
  const profile = useLiveProfiles([pubkey]).get(pubkey) as ProfileLite | undefined;
  const npub = npubOf(pubkey);
  const name = profile?.display_name || profile?.name;
  return (
    <span data-testid="activity-person-name">
      {name ? (
        <>
          @<ProfileEmojiText pubkey={pubkey} text={name} />
        </>
      ) : (
        `${npub.slice(0, 12)}…`
      )}
    </span>
  );
}

/** A person as a row into their page: face in its tier ring, name, NIP-05, and what they are here ("From", "To"). */
export function PersonCard({
  pubkey,
  kicker,
  placeholder = "Someone",
  testId,
}: {
  pubkey: string | null;
  kicker?: string;
  /** Said in place of a person when there is none: an anonymous zap's "Anonymous". */
  placeholder?: string;
  testId?: string;
}) {
  const tierRing = useTierRing();
  const keys = useMemo(() => (pubkey ? [pubkey] : []), [pubkey]);
  const scoreOf = useAuthorScores(keys);
  const profile = useLiveProfiles(keys).get(pubkey ?? "") as ProfileLite | undefined;
  const npub = pubkey ? npubOf(pubkey) : "";
  const name = profile?.display_name || profile?.name;
  const body = (
    <>
      <Avatar
        className={`h-10 w-10 shrink-0 border border-slate-200/80 dark:border-slate-800/80 ${pubkey ? (tierRing(scoreOf(pubkey) ?? null, false, "sm", true) ?? "") : ""}`}
      >
        {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        {kicker && (
          <span className="block text-[10px] font-medium uppercase leading-tight tracking-wide text-slate-400 dark:text-slate-500">
            {kicker}
          </span>
        )}
        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {pubkey ? name ? <ProfileEmojiText pubkey={pubkey} text={name} /> : `${npub.slice(0, 16)}…` : placeholder}
        </span>
        {profile?.nip05 && (
          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
            {profile.nip05.replace(/^_@/, "")}
          </span>
        )}
      </span>
    </>
  );
  const cls =
    "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800";
  return pubkey && npub ? (
    <Link
      href={`/p/${npub}`}
      className={`${cls} transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-900`}
      data-testid={testId ?? `activity-person-${pubkey}`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId ?? "activity-person-none"}>
      {body}
    </div>
  );
}

/** Who did it to whom: two people with an arrow between them. */
export function PeopleFlow({
  from,
  to,
  fromKicker = "From",
  toKicker = "To",
  fromPlaceholder,
}: {
  from: string | null;
  to: string | null;
  fromKicker?: string;
  toKicker?: string;
  fromPlaceholder?: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="activity-flow">
      <PersonCard pubkey={from} kicker={fromKicker} placeholder={fromPlaceholder} testId="activity-from" />
      <ArrowRight
        className="mx-auto h-4 w-4 shrink-0 rotate-90 text-slate-400 dark:text-slate-500 sm:mx-0 sm:rotate-0"
        aria-hidden="true"
      />
      <PersonCard pubkey={to} kicker={toKicker} testId="activity-to" />
    </div>
  );
}

/** The page of an event named by id or address. */
export function refHref(ref: EventRef): string {
  if (ref.id) return `/e/${neventFor(ref.id, ref.relay ? [ref.relay] : [])}`;
  const a = ref.addr ? parseATag(ref.addr, ref.relay) : null;
  if (!a) return "#";
  try {
    return `/e/${nip19.naddrEncode({ kind: a.kind, pubkey: a.pubkey, identifier: a.identifier, relays: a.relays })}`;
  } catch {
    return "#";
  }
}

/** An event, quoted as what it is: an article's card, a calendar event's dated row, else the note card. */
export function QuotedCard({
  event,
  profiles,
  testId,
}: {
  event: MinimalEvent;
  profiles: Map<string, ProfileLite>;
  testId?: string;
}) {
  const author = profiles.get(event.pubkey);
  let card: ReactNode;
  if (READER_KINDS.has(event.kind)) card = <EmbeddedArticleCard event={event} author={author} />;
  else if (event.kind === 31922 || event.kind === 31923) {
    const cal = parseCalendarEvent(event);
    card = (
      <EventRow
        event={{ id: event.id, title: cal.title, start: cal.startSec, location: cal.location, image: cal.image }}
        href={refHref({
          addr: `${event.kind}:${event.pubkey}:${event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`,
        })}
        past={!!cal.startSec && isOver(cal)}
      />
    );
  } else card = <EmbeddedNoteCard event={event} author={author} profiles={profiles} href={eventPath(event)} nested />;
  return <div data-testid={testId ?? "activity-quote"}>{card}</div>;
}

/**
 * The event a ref names, once it is in hand. Until then — or when the relays
 * asked never had it — a quiet row that still leads to its page.
 */
export function QuotedRef({
  target,
  refs,
  missing = "Not found on the relays we asked",
  testId,
}: {
  target: EventRef;
  refs: RefEvents;
  /** What to say once the asks are back empty: a deletion's target is "No longer available". */
  missing?: string;
  testId?: string;
}) {
  const event = refs.get(target);
  if (event) return <QuotedCard event={event} profiles={refs.profiles} testId={testId} />;
  const kind = target.addr ? Number(target.addr.split(":")[0]) : null;
  return (
    <Link
      href={refHref(target)}
      className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-400"
      data-testid={testId ? `${testId}-pending` : "activity-quote-pending"}
    >
      <span>{refs.settled ? missing : "Looking for it…"}</span>
      <span className="truncate font-mono text-xs">
        {target.id ? `${target.id.slice(0, 8)}…` : kind !== null && Number.isFinite(kind) ? kindTypeLabel(kind) : ""}
      </span>
    </Link>
  );
}

/** How many quoted refs show before "Show all". */
export const QUOTE_FOLD = 5;

/**
 * The refs a folded list shows, and the toggle that unfolds it — held by the
 * page, so it asks the relays (useRefEvents) for only the ones on screen.
 */
export function useFoldedRefs(targets: EventRef[], fold = QUOTE_FOLD) {
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => (open ? targets : targets.slice(0, fold)), [open, targets, fold]);
  return { shown, open, setOpen };
}

/** Quoted refs, the first few shown and the rest a click away. */
export function QuotedRefs({
  targets,
  refs,
  missing,
  fold = QUOTE_FOLD,
  testId = "activity-quotes",
  open: openAs,
  onOpenChange,
}: {
  targets: EventRef[];
  refs: RefEvents;
  missing?: string;
  fold?: number;
  testId?: string;
  /** Held by the page (useFoldedRefs), when it asks for only what is shown. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openHere, setOpenHere] = useState(false);
  const open = openAs ?? openHere;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenHere(o));
  const shown = open ? targets : targets.slice(0, fold);
  return (
    <div className="space-y-2" data-testid={testId}>
      {shown.map((t) => (
        <QuotedRef key={t.id ?? t.addr} target={t} refs={refs} missing={missing} />
      ))}
      {targets.length > fold && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs font-medium text-brand-primary hover:underline dark:text-brand-link"
          data-testid={`${testId}-toggle`}
        >
          {open ? "Show fewer" : `Show all ${targets.length.toLocaleString()}`}
        </button>
      )}
    </div>
  );
}

/** A NIP-73 target: a web page as its link card, a hashtag as its topic, anything else (a book, an episode) as its id. */
export function ExternalTargetCard({ target }: { target: ExternalTarget }) {
  if (target.url)
    return (
      <div data-testid="activity-external-url">
        <LinkChip url={target.url} />
        <LinkPreviewCard url={target.url} />
      </div>
    );
  if (target.id.startsWith("#") && target.id.length > 1)
    return (
      <Link
        href={topicPath(target.id.slice(1))}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-link hover:underline"
        data-testid="activity-external-hashtag"
      >
        <Hash className="h-3.5 w-3.5" />
        {target.id.slice(1)}
      </Link>
    );
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
      data-testid="activity-external-id"
    >
      <span className="min-w-0 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{target.id}</span>
      {target.kind && (
        <Chip size="sm" tone="slate" className="shrink-0">
          {target.kind}
        </Chip>
      )}
    </div>
  );
}

/** A link out, said as where it goes. */
export function OutLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 font-medium text-brand-link hover:underline"
      data-testid={testId}
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
