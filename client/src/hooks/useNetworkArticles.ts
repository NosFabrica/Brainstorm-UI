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

const MAX_AUTHORS = 40;
const ARTICLE_KIND = 30023;

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
    queryFn: () => fetchEventsByFilter({ kinds: [ARTICLE_KIND], authors: authorKeys, limit: 30 }),
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
      if (!tagVal(e, "title")) continue;
      const key = `${e.pubkey}:${tagVal(e, "d") ?? e.id}`;
      const prev = newest.get(key);
      if (!prev || (e.created_at ?? 0) > (prev.created_at ?? 0)) newest.set(key, e);
    }
    return Array.from(newest.values())
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .map((event) => ({ event, author: byPubkey.get(event.pubkey)! }))
      .filter((a) => !!a.author);
  }, [articlesQuery.data, byPubkey]);

  return {
    articles,
    // Loading while we're still resolving authors OR fetching their articles.
    isLoading: alerts.isLoading || (authorKeys.length > 0 && articlesQuery.isLoading),
    isError: alerts.isError || articlesQuery.isError,
    hasAuthors: authorKeys.length > 0,
  };
}
