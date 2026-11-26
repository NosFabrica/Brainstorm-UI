/**
 * The pieces every thing page is built from — the event page's own
 * vocabulary (ListingHero, AppHero, FollowSetHero): a kicker above a display
 * title, a row of actions, bordered fact boxes, and titled sections below the
 * event for what the network holds around it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import type { Filter } from "applesauce-core/helpers/filter";
import { Check, Copy, ExternalLink, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Favicon } from "@/components/share/LinkPreview";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useFaceProfiles, type MemberProfile } from "@/components/search/cards";
import { useCopied } from "@/hooks/useCopied";
import { eventPath } from "@/lib/shareId";
import type { SearchResult } from "@/lib/profileSearch";
import { ago } from "@/lib/ago";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { __resetAsks } from "@/lib/askOnce";
import { eventStore } from "@/lib/eventStore";
import { fetchByAddress, fetchFromSearch } from "@/services/search";
import { displayNameOf } from "@/lib/displayName";

/** The structural minimum an event page hands its heroes (MinimalEvent — no sig). */
export type PageEvent = {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
};

export function npubOf(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return "";
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const nameOf = (profile: MemberProfile | undefined, pubkey: string) => displayNameOf(profile, pubkey, "npub12");

/** The small uppercase line above a page title: what this is. */
export function Kicker({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {children}
    </p>
  );
}

export function PageTitle({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <h1
      className="mt-1 break-words text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
      style={{ fontFamily: "var(--font-display)" }}
      data-testid={testId}
    >
      {children}
    </h1>
  );
}

const ACTION_BASE =
  "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";
const ACTION_PRIMARY = `${ACTION_BASE} bg-brand-primary text-white hover:opacity-90`;
const ACTION_SECONDARY = `${ACTION_BASE} border border-slate-200 bg-white text-slate-800 hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`;

/** A way out of the page: primary (the one thing to do next) or secondary; an external link wears the destination's favicon. */
export function ActionLink({
  href,
  primary = false,
  icon: Icon,
  children,
  testId,
}: {
  href: string;
  primary?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
  testId?: string;
}) {
  const external = /^https?:\/\//i.test(href);
  const host = external ? hostOf(href) : null;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
      className={primary ? ACTION_PRIMARY : ACTION_SECONDARY}
      data-testid={testId}
    >
      {Icon ? (
        <Icon className="h-4 w-4" aria-hidden="true" />
      ) : host && !primary ? (
        <Favicon host={host} className="h-3.5 w-3.5 rounded-sm" />
      ) : null}
      {children}
      {external && <ExternalLink className={`h-3.5 w-3.5 ${primary ? "text-white/70" : "text-slate-400"}`} />}
    </a>
  );
}

export function ActionButton({
  onClick,
  primary = false,
  icon: Icon,
  children,
  testId,
}: {
  onClick: () => void;
  primary?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? ACTION_PRIMARY : ACTION_SECONDARY}
      data-testid={testId}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Copy a value (a magnet link, an address, a shortcode), and say it was copied. */
export function CopyButton({ value, label, testId }: { value: string; label: string; testId?: string }) {
  const { copied, failed, copy } = useCopied(1600);
  return (
    <ActionButton icon={copied ? Check : Copy} onClick={() => void copy(value)} testId={testId}>
      {copied ? "Copied" : failed ? "Couldn't copy" : label}
    </ActionButton>
  );
}

export function Actions({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" data-testid={testId}>
      {children}
    </div>
  );
}

/** A bordered box of facts under a small uppercase label. */
export function InfoBox({
  label,
  icon: Icon,
  children,
  testId,
}: {
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800" data-testid={testId}>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </p>
      {children}
    </div>
  );
}

/** Label → value rows, for the facts a page states plainly. */
export function FactRows({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
          <dd className="min-w-0 break-words text-slate-800 dark:text-slate-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A titled section under the event, with an optional count and a door on the right. */
export function Section({
  title,
  count,
  aside,
  children,
  testId,
}: {
  title: string;
  count?: number;
  aside?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="mt-8" data-testid={testId}>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">{count.toLocaleString("en-US")}</span>
        )}
        {aside && <span className="ml-auto shrink-0">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** The quiet line a section shows while it asks, or when the network had nothing. */
export function SectionNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 dark:text-slate-500">{children}</p>;
}

/**
 * People as tappable rows — face with tier ring, name, and their profile one
 * tap away. The first `fold` show; the rest wait behind "Show all".
 */
export function PeopleRoster({ pubkeys, fold = 12, testId }: { pubkeys: string[]; fold?: number; testId?: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? pubkeys : pubkeys.slice(0, fold);
  const profiles = useFaceProfiles(shown);
  const scoreOf = useAuthorScores(shown);
  const tierRing = useTierRing();
  return (
    <div data-testid={testId}>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {shown.map((pk) => {
          const p = profiles.get(pk);
          return (
            <li key={pk}>
              <Link
                href={`/p/${npubOf(pk)}`}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 px-2.5 py-2 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <Avatar
                  className={`h-8 w-8 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(pk) ?? null, false, "sm", true) ?? ""}`}
                >
                  {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden">
                    <DefaultAvatarImg />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{nameOf(p, pk)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {pubkeys.length > fold && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-xs font-semibold text-brand-link hover:underline"
        >
          {open ? "Show fewer" : `Show all ${pubkeys.length.toLocaleString("en-US")}`}
        </button>
      )}
    </div>
  );
}

const IMAGE_URL = /https?:\/\/\S+\.(?:jpe?g|png|gif|webp|avif)(?:\?\S*)?/i;

/** A post's words with its links taken out, and the first picture it links, for a compact row. */
export function readablePost(content: string): { text: string; image: string | null } {
  const image = content.match(IMAGE_URL)?.[0] ?? null;
  const text = content
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, image };
}

/**
 * Posts or messages as a thread-like list: who, when, what — each one's own
 * page a tap away. Content is shown as the words it is, a few lines each.
 */
export function ActivityList({
  events,
  lines = 3,
  testId,
}: {
  events: PageEvent[];
  lines?: 2 | 3 | 4;
  testId?: string;
}) {
  const authors = [...new Set(events.map((e) => e.pubkey))];
  const profiles = useFaceProfiles(authors);
  const scoreOf = useAuthorScores(authors);
  const tierRing = useTierRing();
  const clamp = lines === 4 ? "line-clamp-4" : lines === 2 ? "line-clamp-2" : "line-clamp-3";
  return (
    <ul
      className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
      data-testid={testId}
    >
      {events.map((e) => {
        const p = profiles.get(e.pubkey);
        return (
          <li key={e.id}>
            <Link
              href={eventPath(e)}
              className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <Avatar
                className={`mt-0.5 h-8 w-8 shrink-0 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(e.pubkey) ?? null, false, "sm", true) ?? ""}`}
              >
                {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {nameOf(p, e.pubkey)}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{ago(e.created_at)}</span>
                </p>
                {(() => {
                  const { text, image } = readablePost(e.content);
                  return (
                    <>
                      {text && (
                        <p
                          className={`mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300 ${clamp}`}
                        >
                          {text}
                        </p>
                      )}
                      {image && (
                        <SafeImg
                          src={image}
                          className="mt-2 max-h-40 rounded-xl border border-slate-200 object-cover dark:border-slate-800"
                          fallback={null}
                        />
                      )}
                      {!text && !image && <p className="mt-0.5 text-sm text-slate-400">…</p>}
                    </>
                  );
                })()}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ——— Fetching ———

/*
 * What surrounds a thing (a community's posts, a calendar's events, a badge's
 * awards…) is asked of the search relay (services/search `fetchFromSearch`,
 * under include:spam) and read through the EventStore like every Nostr read
 * (ADR 0005): the answers are added to the store, a section renders from a
 * store timeline over the same filters, and `askOnce` asks each key once a
 * window — the hero and the sections below it ask the same questions (a
 * fundraiser's zaps feed both its bar and its zap list) and share the ask.
 */
const THING_ASK_WINDOW = { minMs: 2 * 60_000 };
/** How many times each key was asked to ask again (`refetch`), and who is showing it. */
const rounds = new Map<string, number>();
const watchers = new Map<string, Set<() => void>>();

/** Forget `key`'s answer and have every section showing it ask again (after a zap, say). */
export function refetch(key: string) {
  rounds.set(key, (rounds.get(key) ?? 0) + 1);
  watchers.get(key)?.forEach((ask) => ask());
}

/** Test seam: forget every ask. */
export function __resetThingPageCache() {
  rounds.clear();
  __resetAsks();
}

function useRound(key: string | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    const ask = () => setTick((t) => t + 1);
    const set = watchers.get(key) ?? new Set();
    set.add(ask);
    watchers.set(key, set);
    return () => {
      set.delete(ask);
      if (set.size === 0) watchers.delete(key);
    };
  }, [key]);
  return key ? (rounds.get(key) ?? 0) : 0;
}

type SearchFilter = Record<string, unknown>;

/** The store's half of a search filter: what the relay alone reads (`limit`, `search`) left out. */
const storeFilterOf = ({ limit: _limit, search: _search, ...f }: SearchFilter) => f as Filter;

/**
 * Hand the answers to the store, and answer with what it kept, as it holds it.
 * A copy it refused (a bad signature, an event its author deleted: `add` is null)
 * is not passed on, so it can't show from the answer either.
 */
function intoStore(events: NostrEvent[]): NostrEvent[] {
  const kept: NostrEvent[] = [];
  for (const e of events) {
    try {
      const held = eventStore.add(e);
      if (held) kept.push(held);
    } catch {
      /* refused: not shown */
    }
  }
  return kept;
}

/**
 * The events the search relay holds for `filters`, live from the store; undefined
 * while nothing is known and the first ask is out. A `null` key asks nothing.
 */
export function useSearchEvents(
  key: string | null,
  filters: SearchFilter[] | null,
  { limit = 60, ask }: { limit?: number; ask?: () => Promise<NostrEvent[]> } = {},
): NostrEvent[] | undefined {
  const round = useRound(key);
  const filtersKey = filters ? JSON.stringify(filters) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey is `filters`, as a value
  const storeFilters = useMemo(() => (key && filters?.length ? filters.map(storeFilterOf) : null), [key, filtersKey]);
  const askKey = key && storeFilters ? `thing:${key}#${round}` : null;
  const { events, settled } = useStoreEvents(
    askKey,
    storeFilters,
    async () => intoStore(await (ask ? ask() : fetchFromSearch(filters ?? [], { limit }))),
    THING_ASK_WINDOW,
  );
  if (!askKey) return undefined;
  return settled || events.length ? events : undefined;
}

/** A search filter for addressable events by coordinate: the cross-product services/search `fetchByAddress` asks. */
function parseCoords(coords: string[]) {
  return [...new Set(coords)]
    .map((c) => c.split(":"))
    .filter((p) => p.length >= 3 && /^\d+$/.test(p[0]) && /^[0-9a-f]{64}$/i.test(p[1]))
    .map((p) => ({ kind: Number(p[0]), pubkey: p[1].toLowerCase(), d: p.slice(2).join(":") }));
}

/**
 * Addressable events by coordinate (`kind:pubkey:d`), newest version of each,
 * keyed by coordinate with a lower-case pubkey; undefined while asking.
 */
export function useAddressedEvents(key: string | null, coords: string[]): Map<string, NostrEvent> | undefined {
  const coordsKey = coords.join(",");
  const parsed = useMemo(() => parseCoords(coords), [coordsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(
    () =>
      parsed.length
        ? [
            {
              kinds: [...new Set(parsed.map((p) => p.kind))],
              authors: [...new Set(parsed.map((p) => p.pubkey))],
              "#d": [...new Set(parsed.map((p) => p.d))],
            },
          ]
        : null,
    [parsed],
  );
  // services/search `fetchByAddress` asks the same cross-product, and keeps only the coordinates asked.
  const events = useSearchEvents(key && filters ? key : null, filters, {
    ask: async () => [...(await fetchByAddress(coords)).values()],
  });
  return useMemo(() => {
    if (!events) return undefined;
    const wanted = new Set(parsed.map((p) => `${p.kind}:${p.pubkey}:${p.d}`));
    const out = new Map<string, NostrEvent>();
    for (const e of events) {
      const at = `${e.kind}:${e.pubkey.toLowerCase()}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
      if (!wanted.has(at)) continue;
      const held = out.get(at);
      if (!held || e.created_at > held.created_at) out.set(at, e);
    }
    return out;
  }, [events, parsed]);
}

/** The pubkeys an event set's `p` tags name, once each (a badge's awards, a group's roster). */
export function taggedPeople(events: NostrEvent[] | undefined): string[] | undefined {
  if (!events) return undefined;
  return [
    ...new Set(
      events.flatMap((e) => e.tags.filter((t) => t[0] === "p" && /^[0-9a-f]{64}$/i.test(t[1] ?? "")).map((t) => t[1])),
    ),
  ];
}

/** A person's whole kind-0 content (lud16, nip05, website…), live; undefined while loading, `{}` for none. */
export function useProfileContent(pubkey: string | null): Record<string, unknown> | undefined {
  const { profile, loading } = useLiveProfile(pubkey ?? undefined);
  if (loading) return undefined;
  return (profile as Record<string, unknown> | undefined) ?? (pubkey ? {} : undefined);
}

/** A picture that says what it stands for when it will not load: `fallback` in its place, never the browser's broken-image glyph. */
export function SafeImg({
  src,
  className,
  fallback,
}: {
  src: string | null | undefined;
  className: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return <img src={src} alt="" loading="lazy" className={className} onError={() => setFailed(src)} />;
}

/** Search-result-shaped authors for the cards a section reuses (their footers name who published). */
export function useAuthors(pubkeys: string[]): Map<string, SearchResult> {
  const unique = [...new Set(pubkeys)];
  const profiles = useFaceProfiles(unique);
  const out = new Map<string, SearchResult>();
  for (const pk of unique) {
    const p = profiles.get(pk);
    out.set(pk, { pubkey: pk, npub: npubOf(pk), name: p?.name, displayName: p?.display_name, picture: p?.picture });
  }
  return out;
}
