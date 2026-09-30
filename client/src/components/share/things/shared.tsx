/**
 * The pieces every thing page is built from — the event page's own
 * vocabulary (ListingHero, AppHero, FollowSetHero): a kicker above a display
 * title, a row of actions, bordered fact boxes, and titled sections below the
 * event for what the network holds around it.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Check, Copy, ExternalLink, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Favicon } from "@/components/share/LinkPreview";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useFaceProfiles, type MemberProfile } from "@/components/search/cards";
import { copyToClipboard } from "@/lib/clipboard";
import { eventPath } from "@/lib/shareId";
import type { SearchResult } from "@/lib/profileSearch";
import { ago } from "@/lib/ago";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";

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

export const nameOf = (profile: MemberProfile | undefined, pubkey: string) =>
  profile?.display_name || profile?.name || `${npubOf(pubkey).slice(0, 12)}…`;

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
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      icon={copied ? Check : Copy}
      onClick={() => {
        void copyToClipboard(value).then((ok) => {
          if (!ok) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      testId={testId}
    >
      {copied ? "Copied" : label}
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

/**
 * One answer per key for the page's life: the hero and the sections below it
 * ask the same questions (a fundraiser's zaps feed both its bar and its
 * supporter list), and each is asked once. Bounded, oldest out.
 */
const answers = new Map<string, Promise<unknown>>();
const ANSWERS_KEPT = 64;

export function fetchOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = answers.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    answers.set(key, p);
    if (answers.size > ANSWERS_KEPT) answers.delete(answers.keys().next().value as string);
  }
  return p;
}

/** Test seam: forget every cached answer. */
export function __resetThingPageCache() {
  answers.clear();
}

/** What `load` answered for `key` — undefined while it asks; `null` key asks nothing. */
export function useFetched<T>(key: string | null, load: () => Promise<T>): T | undefined {
  const [state, setState] = useState<{ key: string | null; value: T | undefined }>({ key: null, value: undefined });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void fetchOnce(key, load).then((value) => {
      if (alive) setState({ key, value });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key names the question
  }, [key]);
  return state.key === key ? state.value : undefined;
}

/** A person's whole kind-0 content (lud16, nip05, website…) — the store first, then one fetch. */
export function useProfileContent(pubkey: string | null): Record<string, unknown> | undefined {
  return useFetched(pubkey ? `profile:${pubkey}` : null, async () => {
    const stored = eventStore.getReplaceable(0, pubkey as string);
    if (stored) {
      try {
        return JSON.parse(stored.content) as Record<string, unknown>;
      } catch {
        /* fall through to the network */
      }
    }
    const map = await fetchProfileMap([pubkey as string]);
    return (map.get(pubkey as string) as Record<string, unknown> | undefined) ?? {};
  });
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
