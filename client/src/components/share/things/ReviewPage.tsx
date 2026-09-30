/**
 * A review's page — a relay review, a NIP-87 mint review, or a rating of
 * anything — read the way a review site shows one: what is reviewed, the
 * score large, the reviewer's words, a relay's per-aspect scores. Below, what
 * everyone else said about the same thing: the average, how the stars
 * spread, and each review.
 */
import { BookOpen, Film, Globe, Hash, MapPin, Music, Package, Star, Users, type LucideIcon } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Link } from "wouter";
import { Favicon } from "@/components/share/LinkPreview";
import { ReadingText } from "@/components/share/ReadingText";
import { Stars } from "@/components/search/thingCards";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useFaceProfiles } from "@/components/search/cards";
import { fetchByAddress, fetchFromSearch } from "@/services/search";
import { describeThing, hostOfUrl, type Thing } from "@/lib/thing";
import { eventPath } from "@/lib/shareId";
import { ago } from "@/lib/ago";
import type { Detail } from "./types";
import {
  ActionLink,
  Actions,
  CopyButton,
  Kicker,
  PageTitle,
  Section,
  SectionNote,
  nameOf,
  useFetched,
  type PageEvent,
} from "./shared";

const tagOf = (e: PageEvent, k: string) => e.tags.find((t) => t[0] === k)?.[1];

/**
 * Every review of the same subject, this one included. An empty identifier
 * names no subject — asking for `#d: [""]` would gather every review that
 * left it blank — so it asks nothing.
 */
function reviewFilters(event: PageEvent, subject: Detail<"review">["subject"]): Record<string, unknown>[] {
  const d = tagOf(event, "d")?.trim() ?? "";
  if (subject === "relay") {
    // Publishers disagree on the trailing slash; both spellings are the same relay.
    const bare = d.replace(/\/+$/, "");
    return bare ? [{ kinds: [31987], "#d": [bare, `${bare}/`] }] : [];
  }
  if (subject === "mint") {
    const u = tagOf(event, "u")?.trim();
    return [...(u ? [{ kinds: [38000], "#u": [u] }] : []), ...(d ? [{ kinds: [38000], "#d": [d] }] : [])];
  }
  return d ? [{ kinds: [34259], "#d": [d] }] : [];
}

/** A rating of an addressable thing names it; the subject's own title, when the network has it. */
function useRatedSubject(event: PageEvent, subject: Detail<"review">["subject"]) {
  const coord = subject === "entity" ? (tagOf(event, "a") ?? tagOf(event, "A")) : undefined;
  const id = subject === "entity" && !coord ? tagOf(event, "e") : undefined;
  return useFetched(coord ? `rated:${coord}` : id ? `rated:${id}` : null, async () => {
    if (coord) return (await fetchByAddress([coord])).get(coord) ?? null;
    const [found] = await fetchFromSearch([{ ids: [id] }], { limit: 1 });
    return found ?? null;
  });
}

function subjectTitle(e: NostrEvent): string {
  const t = e.tags.find((x) => x[0] === "title" || x[0] === "name")?.[1];
  return t?.trim() || e.content.trim().split("\n")[0].slice(0, 80) || "Untitled";
}

/** What sort of thing a rating is of, as its icon. */
const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Book: BookOpen,
  Movie: Film,
  Film: Film,
  Music: Music,
  Podcast: Music,
  Place: MapPin,
  Product: Package,
  Hashtag: Hash,
  Person: Users,
};

export function ReviewHero({ event, thing, detail }: { event: PageEvent; thing: Thing; detail: Detail<"review"> }) {
  const host = detail.subject === "entity" ? null : hostOfUrl(thing.title);
  const rated = useRatedSubject(event, detail.subject);
  const relayUrl = detail.subject === "relay" ? tagOf(event, "d") : undefined;
  const SubjectIcon = SUBJECT_ICONS[detail.subjectLabel] ?? Globe;
  return (
    <div data-testid="thing-page-review">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          {host ? (
            <Favicon host={host} className="h-6 w-6 rounded-sm text-slate-400" />
          ) : (
            <SubjectIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {detail.subjectLabel}
          </p>
          {rated ? (
            <Link
              href={eventPath(rated)}
              className="block truncate text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100"
              data-testid="thing-page-subject"
            >
              {subjectTitle(rated)}
            </Link>
          ) : (
            <p
              className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
              data-testid="thing-page-subject"
            >
              {host ?? thing.title.replace(/^Rating of /, "")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Kicker icon={Star}>Review</Kicker>
        <PageTitle testId="thing-page-title">{host ? `Review of ${host}` : thing.title}</PageTitle>
      </div>
      {thing.stars !== null && (
        <div className="mt-3 flex items-center gap-3" data-testid="thing-page-score">
          <span className="text-4xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
            {thing.stars.toFixed(1)}
          </span>
          <div>
            <Stars stars={thing.stars} size="md" testId="thing-page-stars" />
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">out of 5</p>
          </div>
        </div>
      )}
      {detail.aspects.length > 0 && (
        <dl
          className="mt-4 grid max-w-sm grid-cols-[auto,1fr,auto] items-center gap-x-3 gap-y-1.5"
          data-testid="thing-page-aspects"
        >
          {detail.aspects.map((a, i) => (
            <div key={`${a.name}-${i}`} className="contents">
              <dt className="text-sm text-slate-600 dark:text-slate-300">{a.name}</dt>
              <dd className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(a.stars / 5) * 100}%` }} />
              </dd>
              <dd className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{a.stars.toFixed(1)}</dd>
            </div>
          ))}
        </dl>
      )}
      {thing.description && (
        <blockquote className="mt-4 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
          <ReadingText text={thing.description} testId="thing-page-description" />
        </blockquote>
      )}
      <Actions>
        {thing.link && <ActionLink href={thing.link}>Visit {hostOfUrl(thing.link)}</ActionLink>}
        {relayUrl && <CopyButton value={relayUrl} label="Copy relay URL" />}
      </Actions>
    </div>
  );
}

export function ReviewSections({ event, detail }: { event: PageEvent; detail: Detail<"review"> }) {
  const all = useFetched(`reviews:${event.kind}:${event.id}`, () =>
    fetchFromSearch(reviewFilters(event, detail.subject), { limit: 200 }),
  );
  // One review per author — their newest — scored on this kind's own scale.
  // The page's own review counts even when the search relay hasn't got it.
  const byAuthor = new Map<string, PageEvent>();
  for (const e of all ? [event, ...all] : []) {
    const held = byAuthor.get(e.pubkey);
    if (!held || e.created_at > held.created_at) byAuthor.set(e.pubkey, e);
  }
  const reviews = [...byAuthor.values()].map((e) => ({ event: e, thing: describeThing(e) }));
  const scored = reviews.filter((r) => r.thing?.stars !== null && r.thing?.stars !== undefined);
  const average = scored.length ? scored.reduce((n, r) => n + (r.thing!.stars as number), 0) / scored.length : null;
  const spread = [5, 4, 3, 2, 1].map((s) => ({
    stars: s,
    n: scored.filter((r) => Math.round(r.thing!.stars as number) === s).length,
  }));
  const others = reviews.filter((r) => r.event.id !== event.id);
  const faces = useFaceProfiles(others.slice(0, 60).map((r) => r.event.pubkey));
  return (
    <Section title="All reviews" count={reviews.length} testId="thing-page-reviews">
      {all === undefined ? (
        <SectionNote>Gathering reviews…</SectionNote>
      ) : (
        <>
          {average !== null && (
            <div
              className="mb-4 flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              data-testid="thing-page-average"
            >
              <div>
                <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {average.toFixed(1)}
                </p>
                <Stars stars={average} />
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {scored.length} {scored.length === 1 ? "rating" : "ratings"}
                </p>
              </div>
              <dl className="grid min-w-[12rem] flex-1 grid-cols-[auto,1fr,auto] items-center gap-x-2 gap-y-1">
                {spread.map((row) => (
                  <div key={row.stars} className="contents">
                    <dt className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{row.stars}★</dt>
                    <dd className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: scored.length ? `${(row.n / scored.length) * 100}%` : "0%" }}
                      />
                    </dd>
                    <dd className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{row.n}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {others.length === 0 ? (
            <SectionNote>No one else has reviewed this yet.</SectionNote>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {others.slice(0, 60).map(({ event: e, thing }) => {
                const p = faces.get(e.pubkey);
                return (
                  <li key={e.id}>
                    <Link
                      href={eventPath(e)}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <Avatar className="mt-0.5 h-8 w-8 shrink-0 border border-slate-200/80 dark:border-slate-800/80">
                        {p?.picture ? <AvatarImage src={p.picture} alt="" className="object-cover" /> : null}
                        <AvatarFallback className="overflow-hidden">
                          <DefaultAvatarImg />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 flex-wrap items-center gap-x-2">
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {nameOf(p, e.pubkey)}
                          </span>
                          {thing?.stars !== null && thing?.stars !== undefined && <Stars stars={thing.stars} />}
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{ago(e.created_at)}</span>
                        </p>
                        {thing?.description && (
                          <p className="mt-0.5 line-clamp-3 break-words text-sm text-slate-600 dark:text-slate-300">
                            {thing.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
