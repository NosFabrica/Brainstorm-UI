import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNetworkAlerts } from "@/hooks/useNetworkAlerts";
import { fetchEventsByFilter } from "@/services/nostr";
import { type NostrEvent } from "applesauce-core/helpers";
import type { NetworkAlertEntry } from "@/services/api";

/**
 * Long-form articles from the observer's EXTENDED network — people they don't
 * follow yet, but whom their trusted follows vouch for.
 *
 * This is the discovery angle no other Nostr client can build: every reader app
 * can show you your own follows, but only a trust graph can tell you who's worth
 * reading one hop further out. It also feeds the product loop — discover a good
 * author, follow them, the graph sharpens.
 *
 * Author list is reused from `/networkAlerts` (already in flight on the
 * dashboard, so this costs no extra backend call): `extendedNetwork` entries are
 * hops >= 2, and `influence` ranks them. Articles are then fetched by author.
 */

const MAX_AUTHORS = 100;
const ARTICLE_KIND = 30023;
const DAY = 24 * 60 * 60;
/** Primary recency window. Long-form is low-frequency, so this is generous. */
const FRESH_WINDOW_DAYS = 120;
/** Single widen-once fallback so smaller networks aren't left with an empty card. */
const FALLBACK_WINDOW_DAYS = 400;
/** One article per author — otherwise a single prolific writer takes every slot. */
const MAX_PER_AUTHOR = 1;

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

export interface NetworkArticle {
  event: NostrEvent;
  /** Trust context for "why am I seeing this". */
  author: NetworkAlertEntry;
}

function tagVal(e: NostrEvent, name: string): string | undefined {
  return (e.tags ?? []).find((t: string[]) => t[0] === name)?.[1];
}

export function useNetworkArticles(observer: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false && !!observer;
  const alerts = useNetworkAlerts(observer, { enabled, limit: 100 });

  // Highest-influence accounts two or more hops out. Deliberately excludes
  // direct follows (hops <= 1) — those already appear in every client the user
  // has; the value here is what's just OUTSIDE their circle.
  const authors = useMemo(() => {
    const extended = alerts.data?.data?.extendedNetwork ?? [];
    return [...extended]
      .filter((e) => e.hops >= 2)
      .sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0))
      .slice(0, MAX_AUTHORS);
  }, [alerts.data]);

  const authorKeys = useMemo(() => authors.map((a) => a.pubkey), [authors]);
  const byPubkey = useMemo(() => new Map(authors.map((a) => [a.pubkey, a])), [authors]);

  const articlesQuery = useQuery({
    queryKey: ["network-articles", authorKeys.join(",")],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      // Constrain the FETCH by recency — sorting newest-first over a stale set
      // still yields stale content, which is exactly how 18-month-old posts got
      // through. Widen once (not forever) if the fresh window comes back thin,
      // so smaller networks still see something without resurfacing ancient posts.
      const fresh = await fetchEventsByFilter({
        kinds: [ARTICLE_KIND],
        authors: authorKeys,
        since: now - FRESH_WINDOW_DAYS * DAY,
        limit: 120,
      });
      if (fresh.length >= 8) return fresh;
      const wider = await fetchEventsByFilter({
        kinds: [ARTICLE_KIND],
        authors: authorKeys,
        since: now - FALLBACK_WINDOW_DAYS * DAY,
        limit: 120,
      });
      return wider.length > fresh.length ? wider : fresh;
    },
    enabled: enabled && authorKeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const articles = useMemo<NetworkArticle[]>(() => {
    const events = articlesQuery.data ?? [];
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

    // Newest-first, then cap per author so one prolific writer can't take every
    // slot (a single account held half the card before this).
    const perAuthor = new Map<string, number>();
    const out: NetworkArticle[] = [];
    for (const event of Array.from(newest.values()).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))) {
      const author = byPubkey.get(event.pubkey);
      if (!author) continue;
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
    isLoading: alerts.isLoading || (authorKeys.length > 0 && articlesQuery.isLoading),
    isError: alerts.isError || articlesQuery.isError,
    hasAuthors: authorKeys.length > 0,
  };
}
