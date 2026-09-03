/**
 * Relay-backed search — the seam between the search UI and the
 * SearchOverTrust relay (NIP-50, extended grammar).
 *
 * Verified against the staging relay (2026-09-02, read-only probes):
 * - The RELAY parses the whole grammar (`from:` `since:` `sort:` `observer:`
 *   `include:spam` …) — the query text passes through verbatim; this module
 *   appends `observer:` and nothing else. The UI never string-builds syntax.
 * - Frames are plain NIP-01 `["EVENT", subid, event]` — rank is expressed as
 *   ORDER, never as numbers. `SearchHit.rank` stays null until a separate
 *   score fetch fills it (same per-author pattern as the hashtag page).
 * - A read with no lens (no `observer:`, no `include:spam`) is refused with
 *   `auth-required:` — so every query we send carries a lens.
 * - Kind-less REQs work: the Everything tab is one REQ with no `kinds`.
 * - `sort:rank`/best-match flush near EOSE (~4s); `sort:recent` streams.
 */
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { eventStore } from "@/lib/eventStore";
import { liftQuery } from "@/lib/searchSyntax";
import { resolveHouseObserver } from "@/services/trustSource";
import type { SearchResult } from "@/lib/profileSearch";

export type SearchTab =
  | "everything"
  | "people"
  | "notes"
  | "articles"
  | "media"
  | "apps"
  | "repos"
  | "live"
  | "lists";

/** One truth for tab → kinds, extracted from the SearchOverTrust app. */
export const TAB_KINDS: Record<Exclude<SearchTab, "everything">, number[]> = {
  people: [0],
  notes: [1, 11, 1111],
  articles: [30023, 30024, 30818, 30040, 30041],
  media: [20, 21, 22, 1063, 1986, 1222, 34235, 34236],
  // Vitor's split: Zap Store app listings and git-shaped kinds were one
  // confusing tab. Kind 1337 "snippets" is deliberately in NEITHER — live
  // probing showed it ~90% JSON junk; it still surfaces via Everything.
  apps: [32267],
  repos: [30617, 1617, 1618, 1621],
  live: [30311, 30312, 30313, 31922, 31923, 31924],
  lists: [10003, 10015, 30001, 30003, 30015, 30267, 39701],
};

/** Everything is deliberately unconstrained — the relay blends and ranks. */
export function kindsForTab(tab: SearchTab): number[] | undefined {
  return tab === "everything" ? undefined : TAB_KINDS[tab];
}

export interface SearchHit {
  event: NostrEvent;
  /** Kind-0-derived card data — the hit itself for People, the author for
   *  everything else (filled by hydration; null until then). */
  author: SearchResult | null;
  /** 0..1 when a score fetch has answered; the relay itself only ORDERS. */
  rank: number | null;
}

export interface SearchSnapshot {
  /** Relay order preserved — the relay owns `sort:`. */
  hits: SearchHit[];
  eose: boolean;
  /** Stamped at EOSE — the "About N results in Xs" line. */
  timeMs: number | null;
  error: string | null;
}

export type SearchPov = "nosfabrica" | "mywot";

export interface SearchParams {
  tab: SearchTab;
  pov: SearchPov;
  /** Required for pov === "mywot". */
  userPubkey?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 100;

/** Kind-0 event → the SearchResult currency the whole app renders. */
export function kind0ToSearchResult(event: NostrEvent): SearchResult {
  let meta: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.content);
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
  } catch {
    /* unparseable profile content renders as pubkey-only */
  }
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : undefined);
  let npub = "";
  try {
    npub = nip19.npubEncode(event.pubkey);
  } catch {
    /* malformed pubkey — leave npub empty, card falls back to hex */
  }
  return {
    pubkey: event.pubkey,
    npub,
    name: str("name"),
    displayName: str("display_name") ?? str("displayName"),
    picture: str("picture"),
    about: str("about"),
    nip05: str("nip05"),
    website: str("website"),
    lud16: str("lud16"),
    banner: str("banner"),
    createdAt: event.created_at,
    wotRank: null,
    wotFollowers: null,
  };
}

/** Append our lens unless the query already names one. */
function withObserver(query: string, observer: string | null): string {
  const q = query.trim();
  if (/(^|\s)(observer:|include:spam)/.test(q)) return q;
  if (!observer) return q ? `${q} include:spam` : "include:spam";
  return q ? `${q} observer:${observer}` : `observer:${observer}`;
}

async function resolveObserver(params: SearchParams): Promise<string | null> {
  if (params.pov === "mywot" && params.userPubkey) return params.userPubkey;
  return resolveHouseObserver();
}

/**
 * Streaming full search. Each callback delivers the WHOLE current list —
 * one setState per emit, and a cancelled handle never calls back again,
 * which is the entire stale-results story.
 */
export function searchStream(
  query: string,
  params: SearchParams,
  onSnapshot: (snapshot: SearchSnapshot) => void,
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  const hits: SearchHit[] = [];
  const startedAt = Date.now();
  const emit = (partial: Partial<SearchSnapshot>) => {
    if (cancelled) return;
    onSnapshot({ hits: [...hits], eose: false, timeMs: null, error: null, ...partial });
  };

  void (async () => {
    const relay = searchRelay();
    if (!relay) {
      emit({ error: "Search is not configured" });
      return;
    }
    const observer = await resolveObserver(params);
    if (cancelled) return;

    const kinds = kindsForTab(params.tab);
    // from:/to:/#tag/since:/until: become NIP-01 filter fields (the relay
    // never sees those prefixes — verified by probing); the relay's own
    // extensions (sort:/include:spam/filter:rank:/observer:) stay in `search`.
    const lifted = liftQuery(query);
    const filter: import("nostr-tools").Filter = {
      ...(kinds ? { kinds } : {}),
      ...(lifted.authors ? { authors: lifted.authors } : {}),
      ...(lifted["#p"] ? { "#p": lifted["#p"] } : {}),
      ...(lifted["#t"] ? { "#t": lifted["#t"] } : {}),
      ...(lifted.since !== undefined ? { since: lifted.since } : {}),
      ...(lifted.until !== undefined ? { until: lifted.until } : {}),
      search: withObserver(lifted.search, observer),
      limit: params.limit ?? DEFAULT_LIMIT,
    };

    // --- Author hydration: kind-0s for non-profile hits. The event store
    // answers known authors synchronously; unknowns are debounced into one
    // batched REQ on the same relay. `include:spam` is the lens — we want the
    // requester's profile regardless of how the observer ranks them.
    const pendingAuthors = new Set<string>();
    let hydrateTimer: ReturnType<typeof setTimeout> | null = null;
    let hydrateSub: { unsubscribe: () => void } | null = null;

    const applyProfile = (profile: NostrEvent) => {
      const author = kind0ToSearchResult(profile);
      for (const hit of hits) {
        if (hit.event.kind !== 0 && hit.event.pubkey === profile.pubkey) hit.author = author;
      }
    };

    const flushHydration = () => {
      hydrateTimer = null;
      if (cancelled || pendingAuthors.size === 0) return;
      const authors = [...pendingAuthors];
      pendingAuthors.clear();
      hydrateSub = relay
        .req({ kinds: [0], authors, search: "include:spam", limit: authors.length })
        .subscribe((msg: { type: string; event?: NostrEvent }) => {
          if (cancelled) return;
          if (msg.type === "EVENT" && msg.event?.kind === 0) {
            eventStore.add(msg.event);
            applyProfile(msg.event);
            emit({});
          }
        });
    };

    const noteAuthor = (event: NostrEvent): SearchResult | null => {
      if (event.kind === 0) return kind0ToSearchResult(event);
      const known = eventStore.getReplaceable(0, event.pubkey);
      if (known) return kind0ToSearchResult(known);
      pendingAuthors.add(event.pubkey);
      if (!hydrateTimer) hydrateTimer = setTimeout(flushHydration, 150);
      return null;
    };

    const sub = relay.req(filter).subscribe((msg: { type: string; event?: NostrEvent; reason?: string }) => {
      if (cancelled) return;
      if (msg.type === "EVENT" && msg.event) {
        const event = msg.event;
        // Into the store the moment it arrives: the search relay's corpus is
        // wider than the content relays', so a clicked result must render
        // from what we already hold, not from relays that may lack it.
        eventStore.add(event);
        hits.push({ event, author: noteAuthor(event), rank: null });
        emit({});
      } else if (msg.type === "EOSE") {
        emit({ eose: true, timeMs: Date.now() - startedAt });
      } else if (msg.type === "CLOSED") {
        emit({ error: msg.reason ?? "Search ended unexpectedly" });
      }
    });
    unsubscribe = () => {
      sub.unsubscribe();
      hydrateSub?.unsubscribe();
      if (hydrateTimer) clearTimeout(hydrateTimer);
    };
    if (cancelled) unsubscribe();
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export interface AppRelease {
  version: string;
  at: number;
  /** The release event's content — Zap Store publishes markdown notes here. */
  notes: string;
}

/**
 * An app's Zap Store releases, newest first — [0] is the "What's new"
 * release, the rest are the version history. Releases are kind 30063 by
 * the same publisher, with d = "<app-d>@<version>"; the lens is
 * include:spam because we want the publisher's own releases regardless
 * of how the observer ranks them.
 */
export function fetchReleases(
  appD: string,
  publisher: string,
  timeoutMs = 5000,
): Promise<AppRelease[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const releases: AppRelease[] = [];
    const sub = relay
      .req({ kinds: [30063], authors: [publisher], search: "include:spam", limit: 50 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const d = msg.event.tags.find((t) => t[0] === "d")?.[1] ?? "";
          if (!d.startsWith(`${appD}@`)) return;
          releases.push({
            version: d.slice(appD.length + 1),
            at: msg.event.created_at,
            notes: msg.event.content ?? "",
          });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(releases.sort((a, b) => b.at - a.at));
    }
  });
}

/** The NIP-01 address of an addressable app listing. */
export function appAddress(event: { kind?: number; pubkey: string; tags: string[][] }): string {
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return `32267:${event.pubkey}:${d}`;
}

/**
 * Sibling listings that share category t-tags — the "Similar apps" row.
 * Deduped by address (listings are replaceable), self excluded, ordered by
 * how many of the given tags each one shares.
 */
export function fetchSimilarApps(
  tags: string[],
  selfAddress: string,
  timeoutMs = 5000,
): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || tags.length === 0) return resolve([]);
    const byAddress = new Map<string, NostrEvent>();
    const sub = relay
      .req({ kinds: [32267], "#t": tags, search: "include:spam", limit: 24 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const addr = appAddress(msg.event);
          if (addr === selfAddress) return;
          const known = byAddress.get(addr);
          if (!known || msg.event.created_at > known.created_at) byAddress.set(addr, msg.event);
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      const overlap = (e: NostrEvent) =>
        e.tags.filter((t) => t[0] === "t" && tags.includes(t[1])).length;
      resolve([...byAddress.values()].sort((a, b) => overlap(b) - overlap(a)).slice(0, 6));
    }
  });
}

/**
 * Cheap kind-0 typeahead: resolves at EOSE or the deadline with whatever
 * arrived — never rejects (a silent suggest beats a broken one).
 */
export function suggestProfiles(
  query: string,
  params: Pick<SearchParams, "pov" | "userPubkey">,
  opts?: { limit?: number; timeoutMs?: number },
): Promise<SearchResult[]> {
  const limit = opts?.limit ?? 10;
  const timeoutMs = opts?.timeoutMs ?? 4000;
  return new Promise((resolve) => {
    const seen = new Map<string, SearchResult>();
    const cancel = searchStream(
      query,
      { tab: "people", pov: params.pov, userPubkey: params.userPubkey, limit },
      (snapshot) => {
        for (const hit of snapshot.hits) {
          if (hit.author && !seen.has(hit.event.pubkey)) seen.set(hit.event.pubkey, hit.author);
        }
        if (snapshot.eose || snapshot.error) finish();
      },
    );
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      cancel();
      resolve([...seen.values()].slice(0, limit));
    }
  });
}
