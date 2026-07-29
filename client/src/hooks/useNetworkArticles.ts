import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEventsByFilter, CONTENT_RELAYS } from "@/services/nostr";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { type NostrEvent } from "applesauce-core/helpers";

/**
 * Long-form articles from the observer's EXTENDED network — people they don't
 * follow yet, but whom their own follows vouch for.
 *
 * This is the discovery angle no other Nostr client can build: every reader app
 * can show you your own follows, but only a trust graph can tell you who's worth
 * reading one hop further out. It also feeds the product loop — discover a good
 * author, follow them, the graph sharpens.
 *
 * Authors come from REAL kind-3 contact lists: the observer's follows, then the
 * follows of those follows. An earlier cut sourced them from `/networkAlerts`,
 * which returns FLAGGED accounts — so this card was quietly recommending the
 * writing of people the network had REPORTED, drawn from a pool the moderation
 * endpoint capped at 100. Content discovery must never inherit a moderation
 * query's population (the dashboard thread module was fixed for the same reason).
 *
 * A candidate's trust signal is its CO-FOLLOW COUNT — how many of the observer's
 * own follows follow them. That's both the ranking input and literally what the
 * card's "Followed by N accounts you trust" line claims, so the two can't drift.
 */

const ARTICLE_KIND = 30023;
const DAY = 24 * 60 * 60;
/** Primary recency window. Long-form is low-frequency, so this is generous. */
const FRESH_WINDOW_DAYS = 90;
/**
 * Widen-once fallback. Deliberately modest: a year-old post is not "reading from
 * your network", it's archaeology. Better to show two fresh items than four
 * stale ones, so the card is allowed to come back short.
 */
const FALLBACK_WINDOW_DAYS = 180;
/** One article per author — otherwise a single prolific writer takes every slot. */
const MAX_PER_AUTHOR = 1;
/**
 * How many of the observer's follows we read contact lists for. Each kind-3 can
 * carry hundreds of tags, so this bounds the payload while still producing a
 * two-hop set in the thousands — orders of magnitude more candidates than the 100
 * the moderation endpoint returned.
 */
const SAMPLE_FOLLOWS = 60;
/** Candidate authors to actually query articles for, best-vouched first. */
const MAX_AUTHORS = 400;
/**
 * Recency half-life for ranking. At 30 days an item keeps half the recency
 * credit of a same-day post, at 60 days a quarter — so age tells against a piece
 * gradually instead of via a cliff at the window edge.
 */
const RECENCY_HALF_LIFE_DAYS = 30;
/**
 * Anything inside the fresh window outranks everything from the widened window,
 * full stop. The widened set exists to FILL LEFTOVER SLOTS on small networks, not
 * to compete with current writing — a 4-month-old post should never displace a
 * 3-week-old one just because its author has more trusted followers.
 *
 * Deliberately larger than the maximum base score (45 + 35 + 20 = 100) so the
 * separation is arithmetic, not probabilistic: no combination of trust, recency
 * and substance can lift a stale item above a fresh one.
 */
const FRESH_TIER_BONUS = 1000;

/**
 * Kind 30023 is "long-form", but plenty of clients use it as generic addressable
 * storage — PGP keys (`profile.asc`, `shinohai.asc`), config dumps, scratch
 * files. Those have a title and pass every structural check while being useless
 * to a reader, so filter on what an actual article looks like.
 */
function looksLikeArticle(title: string, summary: string, content: string): boolean {
  const t = title.trim();
  if (!t) return false;
  // Filenames masquerading as titles.
  if (/\.(asc|txt|md|json|pgp|sig|key|pub)$/i.test(t)) return false;
  // PGP/key material in the body.
  if (/-----BEGIN [A-Z ]*(PGP|PUBLIC KEY|PRIVATE KEY)/.test(content)) return false;
  // A single word with no spaces is nearly always a slug/handle, not a headline.
  if (!/\s/.test(t) && t.length < 25) return false;
  // Require enough body to be worth opening.
  return (summary.trim().length + content.trim().length) >= 400;
}

/** An extended-network author, with the trust context for "why am I seeing this". */
export interface ArticleAuthor {
  pubkey: string;
  /** How many of the observer's OWN follows follow this author. */
  trustedFollowerCount: number;
  /** 2 by construction — these are follows-of-follows the observer doesn't follow. */
  hops: number;
}

export interface NetworkArticle {
  event: NostrEvent;
  author: ArticleAuthor;
}

function tagVal(e: NostrEvent, name: string): string | undefined {
  return (e.tags ?? []).find((t: string[]) => t[0] === name)?.[1];
}

/**
 * How much this reads like a piece someone put work into — 0..1.
 *
 * `looksLikeArticle` is only a floor (does it qualify at all); this ranks what's
 * above it. Kept as a RANKING term rather than a stricter gate on purpose: raising
 * the floor would empty the card on smaller networks, whereas scoring just pushes
 * thin posts down when there's something better to show.
 */
function substanceScore(e: NostrEvent): number {
  const summary = (tagVal(e, "summary") ?? "").trim();
  const body = (e.content ?? "").trim();
  const title = (tagVal(e, "title") ?? "").trim();

  // Saturating length: 400 chars is the qualifying floor, ~6k reads as a full
  // essay. Past that, more words are not more value.
  const depth = Math.min(1, Math.max(0, (summary.length + body.length - 400) / 5600));
  // A written summary is the clearest signal of an author who is publishing, not
  // dumping — it's optional, so nobody fills it in by accident.
  const hasSummary = summary.length >= 40 ? 1 : 0;
  const hasImage = tagVal(e, "image") ? 1 : 0;
  // "sewing machines" vs "A Crítica da Contraeconomia Pura": a real headline
  // generally runs three-plus words and gets capitalised.
  const words = title.split(/\s+/).filter(Boolean).length;
  const titled = (words >= 3 ? 0.6 : 0) + (/^[A-Z\p{Lu}]/u.test(title) ? 0.4 : 0);

  return 0.45 * depth + 0.2 * hasSummary + 0.1 * hasImage + 0.25 * titled;
}

/**
 * Composite rank: trust · recency · substance, with fresh-window items tiered
 * above widened ones. Ordering used to be pure `created_at`, so the graph — the
 * one signal no other client has — had no say in what actually surfaced.
 */
function rankArticle(e: NostrEvent, author: ArticleAuthor, nowSec: number, freshSince: number): number {
  const ageDays = Math.max(0, (nowSec - (e.created_at ?? nowSec)) / 86400);
  const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

  // Log-scaled: 40 co-followers vs 32 is noise, 40 vs 2 is not. Raw counts would
  // let the single most-followed author own the card forever.
  const co = Math.max(0, author.trustedFollowerCount);
  const trust = Math.min(1, Math.log10(1 + co) / Math.log10(1 + 50));

  const tier = (e.created_at ?? 0) >= freshSince ? FRESH_TIER_BONUS : 0;
  return tier + 45 * trust + 35 * recency + 20 * substanceScore(e);
}

export function useNetworkArticles(observer: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false && !!observer;

  // Two-hop author set, built from real contact lists. One REQ for the sampled
  // follows' kind-3 events rather than N round-trips.
  const authorsQuery = useQuery({
    queryKey: ["network-article-authors", observer],
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<ArticleAuthor[]> => {
      const mine = getFollowedPubkeys(await fetchContactList(observer));
      if (mine.size === 0) return [];
      const sample = Array.from(mine).slice(0, SAMPLE_FOLLOWS);
      const lists = await fetchEventsByFilter({ kinds: [3], authors: sample }, CONTENT_RELAYS, 8000);

      // Co-follow tally across my follows' follows.
      const co = new Map<string, number>();
      for (const list of lists) {
        for (const pk of getFollowedPubkeys(list)) {
          // "Beyond who you follow" — drop myself and anyone I already follow.
          if (pk === observer || mine.has(pk)) continue;
          co.set(pk, (co.get(pk) ?? 0) + 1);
        }
      }
      return Array.from(co.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_AUTHORS)
        .map(([pubkey, trustedFollowerCount]) => ({ pubkey, trustedFollowerCount, hops: 2 }));
    },
  });

  const authors = authorsQuery.data ?? [];
  const authorKeys = useMemo(() => authors.map((a) => a.pubkey), [authors]);
  const byPubkey = useMemo(() => new Map(authors.map((a) => [a.pubkey, a])), [authors]);

  const articlesQuery = useQuery({
    queryKey: ["network-articles", authorKeys.length, authorKeys[0] ?? ""],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      // Constrain the FETCH by recency — sorting newest-first over a stale set
      // still yields stale content, which is exactly how 18-month-old posts got
      // through. Widen once (not forever) if the fresh window comes back thin,
      // so smaller networks still see something without resurfacing ancient posts.
      const freshSince = now - FRESH_WINDOW_DAYS * DAY;
      const fresh = await fetchEventsByFilter(
        { kinds: [ARTICLE_KIND], authors: authorKeys, since: freshSince, limit: 200 },
        CONTENT_RELAYS,
      );
      if (fresh.length >= 8) return { events: fresh, freshSince };
      const wider = await fetchEventsByFilter(
        { kinds: [ARTICLE_KIND], authors: authorKeys, since: now - FALLBACK_WINDOW_DAYS * DAY, limit: 200 },
        CONTENT_RELAYS,
      );
      // UNION, not replace. The old code swapped the whole set for the wider one,
      // so a thin fresh window meant every slot competed on equal footing with
      // half-year-old posts. Now the widened items merely join the pool and the
      // fresh tier keeps them below anything current.
      const byId = new Map(fresh.map((e) => [e.id, e]));
      for (const e of wider) if (!byId.has(e.id)) byId.set(e.id, e);
      return { events: Array.from(byId.values()), freshSince };
    },
    enabled: enabled && authorKeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const articles = useMemo<NetworkArticle[]>(() => {
    const events = articlesQuery.data?.events ?? [];
    const freshSince = articlesQuery.data?.freshSince ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);

    // Long-form is addressable: the same article re-published keeps its `d` tag,
    // so collapse to the newest per (author, d) or duplicates stack up.
    const newest = new Map<string, NostrEvent>();
    for (const e of events) {
      const title = tagVal(e, "title") ?? "";
      if (!looksLikeArticle(title, tagVal(e, "summary") ?? "", e.content ?? "")) continue;
      const key = `${e.pubkey}:${tagVal(e, "d") ?? e.id}`;
      const prev = newest.get(key);
      if (!prev || (e.created_at ?? 0) > (prev.created_at ?? 0)) newest.set(key, e);
    }

    // Best-first by composite rank (was newest-first, which ignored trust and
    // substance entirely), then cap per author so one prolific writer can't take
    // every slot. Resolve the author FIRST — ranking reads its trust fields, so an
    // event whose author fell out of the pool must be dropped before it's scored.
    const perAuthor = new Map<string, number>();
    const out: NetworkArticle[] = [];
    const ranked = Array.from(newest.values())
      .flatMap((event) => {
        const author = byPubkey.get(event.pubkey);
        return author ? [{ event, author, rank: rankArticle(event, author, nowSec, freshSince) }] : [];
      })
      .sort((a, b) => b.rank - a.rank);
    for (const { event, author } of ranked) {
      const used = perAuthor.get(event.pubkey) ?? 0;
      if (used >= MAX_PER_AUTHOR) continue;
      perAuthor.set(event.pubkey, used + 1);
      out.push({ event, author });
    }
    return out;
  }, [articlesQuery.data, byPubkey]);

  return {
    articles,
    // Loading while we're still resolving authors OR fetching their articles.
    isLoading: authorsQuery.isLoading || (authorKeys.length > 0 && articlesQuery.isLoading),
    isError: authorsQuery.isError || articlesQuery.isError,
    hasAuthors: authorKeys.length > 0,
  };
}
