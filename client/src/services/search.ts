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
import { zapstoreRelay } from "@/lib/zapstoreRelay";
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
  | "events"
  | "live"
  | "releases"
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
  // Benjamin: "filter by events also". NIP-52 calendar events are their own
  // vertical (the tab does the calendar work — the relay only knows
  // created_at); Live keeps the NIP-53 streams. Kind 31924 calendars (event
  // containers) are in neither; Everything still reaches them.
  events: [31922, 31923],
  live: [30311, 30312, 30313],
  // Not a tab — the home feed's New releases band streams Zap Store releases.
  releases: [30063],
  // 30000 = NIP-51 follow sets — Brainstorm's own pinned-tag exports live here.
  lists: [30000, 10003, 10015, 30001, 30003, 30015, 30267, 39701],
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
  /** Epoch lower bound, to the second — the home feed's "last 24 hours".
   *  (The grammar's since:YYYY-MM-DD is day-precision; this is not.) */
  since?: number;
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
      ...(params.since !== undefined ? { since: params.since } : lifted.since !== undefined ? { since: lifted.since } : {}),
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
  /** The release's e-tags: its asset events (the APK itself lives there). */
  assetIds: string[];
}

/**
 * Where you actually GET an app: Zap Store's page for the listing, keyed by
 * its naddr (probed: zapstore.dev/apps/<naddr> answers 200). Zap Store
 * verifies the APK's signature against the developer's Nostr key — the
 * install path that continues the trust story. Null without a d identifier.
 */
export function zapStoreUrl(event: { kind?: number; pubkey: string; tags: string[][] }): string | null {
  const d = event.tags.find((t) => t[0] === "d")?.[1];
  if (d === undefined) return null;
  try {
    return `https://zapstore.dev/apps/${nip19.naddrEncode({ kind: 32267, pubkey: event.pubkey, identifier: d })}`;
  } catch {
    return null;
  }
}

export interface ReleaseAsset {
  /** Direct download — Zap Store releases point at the APK itself. */
  url: string;
  mime: string;
  /** Bytes, when the publisher declared them. */
  size: number | null;
  version: string | null;
  /** The declared file hash (x tag) — the verify-it-yourself detail. */
  hash: string | null;
}

/**
 * The release's asset event — the APK — from the Zap Store relay. Our
 * search relay indexes listings and releases but not these (RELAY-ASKS
 * #6), so the app page makes one extra hop for the download link. Kind
 * 3063 (Zap Store's asset kind), tolerating legacy 1063 file metadata.
 * Null when the release has no assets or the relay has none of them.
 */
export function fetchReleaseAsset(ids: string[], timeoutMs = 5000): Promise<ReleaseAsset | null> {
  return new Promise((resolve) => {
    if (ids.length === 0) return resolve(null);
    const relay = zapstoreRelay();
    if (!relay) return resolve(null);
    let asset: ReleaseAsset | null = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(asset);
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = relay.req({ ids }).subscribe((msg: { type: string; event?: NostrEvent }) => {
      if (msg.type === "EVENT" && msg.event && (msg.event.kind === 3063 || msg.event.kind === 1063)) {
        const tag = (n: string) => msg.event!.tags.find((t) => t[0] === n)?.[1];
        const url = tag("url");
        if (url && !asset) {
          const size = Number(tag("size"));
          asset = {
            url,
            mime: tag("m") ?? "",
            size: Number.isFinite(size) && size > 0 ? size : null,
            version: tag("version") ?? null,
            hash: tag("x") ?? null,
          };
        }
      } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
        finish();
      }
    });
  });
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
            assetIds: msg.event.tags.filter((t) => t[0] === "e" && t[1]).map((t) => t[1]),
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

/** One Zap Store review: a comment on the listing address. */
export interface AppReview {
  id: string;
  pubkey: string;
  text: string;
  at: number;
  /** The app version the reviewer was running (`v` tag), when they said. */
  version: string | null;
  /** NIP-22 root kind (`k` tag) — "32267" for a top-level review; a reply to
   *  a review names the review's kind instead. Null on legacy kind-1 notes. */
  k: string | null;
  kind: number;
}

/**
 * Zap Store reviews: NIP-22 comments (kind 1111, plus legacy kind-1 notes)
 * whose #a is the app address. Fetched through include:spam deliberately —
 * probed 2026-09-03, the observer lens is a set FILTER applied before the
 * relay's newest-first sort (jack's perspective drops Amethyst's 14 reviews
 * to 0), not a ranker. Trust order is decided on-device, where it can be
 * labeled ("from people you follow", "verified accounts").
 */
export function fetchAppReviews(address: string, opts: { limit?: number; timeoutMs?: number } = {}): Promise<AppReview[]> {
  const { limit = 50, timeoutMs = 5000 } = opts;
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const reviews: AppReview[] = [];
    const sub = relay
      .req({ kinds: [1111, 1], "#a": [address], search: "include:spam", limit })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1] ?? null;
          reviews.push({ id: e.id, pubkey: e.pubkey, text: e.content, at: e.created_at, version: tag("v"), k: tag("k"), kind: e.kind });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(reviews.sort((a, b) => b.at - a.at));
    }
  });
}

/** One zap to an app — a micro-endorsement, sometimes with a memo. */
export interface AppZap {
  id: string;
  /** The zapper (receipt `P` tag, else the embedded zap request's pubkey). */
  pubkey: string | null;
  /** The zap request's message ("love amethyst"), trimmed; "" when silent. */
  memo: string;
  at: number;
}

/**
 * Zaps to an app: NIP-57 receipts (kind 9735) whose #a is the listing
 * address (Amethyst: 101, probed 2026-09-03). The receipt's `e` tag points
 * at the APK's file-metadata event, never the release — so the address is
 * the only key worth joining on.
 */
export function fetchAppZaps(address: string, opts: { limit?: number; timeoutMs?: number } = {}): Promise<AppZap[]> {
  const { limit = 50, timeoutMs = 5000 } = opts;
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const zaps: AppZap[] = [];
    const sub = relay
      .req({ kinds: [9735], "#a": [address], search: "include:spam", limit })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          let request: { pubkey?: unknown; content?: unknown } | null = null;
          try {
            const raw = e.tags.find((t) => t[0] === "description")?.[1];
            if (raw) request = JSON.parse(raw);
          } catch {
            request = null;
          }
          const P = e.tags.find((t) => t[0] === "P")?.[1];
          const pubkey = P ?? (typeof request?.pubkey === "string" ? request.pubkey : null);
          const memo = (e.content.trim() || (typeof request?.content === "string" ? request.content : "")).trim();
          zaps.push({ id: e.id, pubkey, memo, at: e.created_at });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(zaps.sort((a, b) => b.at - a.at));
    }
  });
}

/**
 * The numbers on an app card: reviews (kinds 1111/1), zaps (9735) and how
 * many curated app collections (kind 30267) feature it — three NIP-45
 * COUNTs keyed by the listing address. Counts off the wire, never pages of
 * events: a results page full of cards must stay cheap.
 */
/**
 * Engagement the relay can count today (probed 2026-09-03): zaps (9735) and
 * replies (1 / 1111) that e-tag the note. Reactions and reposts aren't
 * indexed (RELAY-ASKS). Two NIP-45 COUNTs, never a page of events; a failed
 * or slow count reads as zero.
 */
/**
 * App listings (kind 32267) by address `32267:<pubkey>:<d>` — one REQ on the
 * search relay for however many addresses, keyed back by address. The home
 * feed's New releases band needs the listing's name and icon for each
 * release it shows. EOSE or timeout resolves; never rejects.
 */
export function fetchAppsByAddress(addresses: string[], timeoutMs = 5000): Promise<Map<string, NostrEvent>> {
  return new Promise((resolve) => {
    const out = new Map<string, NostrEvent>();
    const parsed = addresses
      .map((a) => a.split(":"))
      .filter((p) => p.length >= 3 && p[0] === "32267")
      .map((p) => ({ pubkey: p[1], d: p.slice(2).join(":") }));
    if (parsed.length === 0) return resolve(out);
    const relay = searchRelay();
    if (!relay) return resolve(out);
    let sub: { unsubscribe: () => void } | null = null;
    const timer = setTimeout(finish, timeoutMs);
    try {
      sub = relay
        .req({
          kinds: [32267],
          authors: [...new Set(parsed.map((p) => p.pubkey))],
          "#d": [...new Set(parsed.map((p) => p.d))],
          search: "include:spam",
          limit: parsed.length * 2,
        })
        .subscribe((msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            const e = msg.event;
            const d = e.tags.find((t) => t[0] === "d")?.[1];
            if (d === undefined) return;
            const key = `32267:${e.pubkey}:${d}`;
            const prev = out.get(key);
            if (!prev || prev.created_at < e.created_at) out.set(key, e);
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        });
    } catch {
      finish();
    }
    function finish() {
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(out);
    }
  });
}

export function fetchNoteEngagement(id: string, timeoutMs = 5000): Promise<{ zaps: number; replies: number }> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve({ zaps: 0, replies: 0 });
    const result = { zaps: 0, replies: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve(result);
    };
    const one = () => {
      if (++done >= 2) finish();
    };
    const count = (kinds: number[], key: keyof typeof result) => {
      try {
        subs.push(
          relay.count({ kinds, "#e": [id], search: "include:spam" }).subscribe({
            next: (r: { count?: number }) => {
              result[key] = r?.count ?? 0;
            },
            error: one,
            complete: one,
          }),
        );
      } catch {
        one();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    count([9735], "zaps");
    count([1, 1111], "replies");
  });
}

export function fetchAppEndorsementCounts(
  address: string,
  timeoutMs = 5000,
): Promise<{ reviews: number; zaps: number; collections: number }> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve({ reviews: 0, zaps: 0, collections: 0 });
    const result = { reviews: 0, zaps: 0, collections: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve(result);
    };
    const one = () => {
      if (++done >= 3) finish();
    };
    const count = (kinds: number[], key: keyof typeof result) => {
      subs.push(
        relay
          .count({ kinds, "#a": [address], search: "include:spam" })
          .subscribe({
            next: (r: { count?: number }) => {
              result[key] = r?.count ?? 0;
            },
            error: one,
            complete: one,
          }),
      );
    };
    // Timer before subscribing — see fetchRepoCounts.
    const timer = setTimeout(finish, timeoutMs);
    count([1111, 1], "reviews");
    count([9735], "zaps");
    count([30267], "collections");
  });
}

/** One trust review of a person — a Relay Outpost vouch. */
export interface PersonVouch {
  id: string;
  /** The reviewer. */
  pubkey: string;
  /** "identity" = "I personally know this is really them"; "vouch" = endorsement. */
  type: "vouch" | "identity";
  text: string;
  at: number;
}

const VOUCH_KIND = 31871;

/**
 * Trust reviews about a person: Relay Outpost's kind-31871 vouches, addressable
 * on the subject (d = p = subject), typed vouch | identity, prose content.
 * Probed 2026-09-03: the same kind also carries WalletScrutiny attestations
 * with a different schema, so only events that say s=vouched (or carry a
 * vouch/identity t) count. The event is addressable per author+subject, so
 * one voice per author — the newest.
 */
export function fetchPersonVouches(pubkey: string, timeoutMs = 5000): Promise<PersonVouch[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const byAuthor = new Map<string, PersonVouch>();
    const sub = relay
      .req({ kinds: [VOUCH_KIND], "#p": [pubkey], search: "include:spam", limit: 50 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1];
          const t = tag("t");
          const isVouch = tag("s") === "vouched" || t === "vouch" || t === "identity";
          if (!isVouch) return;
          const prev = byAuthor.get(e.pubkey);
          if (prev && prev.at >= e.created_at) return;
          byAuthor.set(e.pubkey, {
            id: e.id,
            pubkey: e.pubkey,
            type: t === "identity" ? "identity" : "vouch",
            text: e.content.trim(),
            at: e.created_at,
          });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve([...byAuthor.values()].sort((a, b) => b.at - a.at));
    }
  });
}

export interface VouchReply {
  id: string;
  pubkey: string;
  text: string;
  at: number;
}

/**
 * The reviewed person's public answers to vouches — NIP-22 comments (kind
 * 1111) pointing at the vouch with K=31871. Newest reply per vouch.
 */
export function fetchVouchReplies(vouchIds: string[], timeoutMs = 5000): Promise<Map<string, VouchReply>> {
  return new Promise((resolve) => {
    const replies = new Map<string, VouchReply>();
    if (vouchIds.length === 0) return resolve(replies);
    const relay = searchRelay();
    if (!relay) return resolve(replies);
    const sub = relay
      .req({ kinds: [1111], "#e": vouchIds, "#K": [String(VOUCH_KIND)], search: "include:spam", limit: 100 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const target = e.tags.find((t) => t[0] === "e")?.[1];
          if (!target) return;
          const prev = replies.get(target);
          if (prev && prev.at >= e.created_at) return;
          replies.set(target, { id: e.id, pubkey: e.pubkey, text: e.content.trim(), at: e.created_at });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(replies);
    }
  });
}

export interface PersonSetMembership {
  title: string;
  /** How many distinct exporters' follow sets include the person — the
   *  social-proof number ("Verified Human · 3"). */
  exporters: number;
  /** Who published those sets — a lone list is only as good as its author. */
  exporterPubkeys: string[];
  /** The sets themselves, so a badge can open one list's page. */
  sets: { id: string; pubkey: string }[];
}

/**
 * The follow sets a person appears in (kind 30000, #p), grouped by title
 * with a distinct-exporter count. Multiple Brainstorm instances export the
 * same pinned tag — three "Verified Human" sets naming you is three webs
 * of trust vouching, and THAT is the badge.
 */
export function fetchPersonSets(pubkey: string, timeoutMs = 5000): Promise<PersonSetMembership[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    // Per title, one set per publisher (the newest, if a publisher has several).
    const byTitle = new Map<string, Map<string, { id: string; pubkey: string; at: number }>>();
    const sub = relay
      // 200, not 50: a well-listed person sits in more sets than that, and a
      // sample-dependent tally made "Verified Human · 6" come and go between loads.
      .req({ kinds: [30000], "#p": [pubkey], search: "include:spam", limit: 200 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          const e = msg.event;
          const title = e.tags.find((t) => t[0] === "title" || t[0] === "name")?.[1]?.trim();
          if (!title) return;
          if (!byTitle.has(title)) byTitle.set(title, new Map());
          const perPublisher = byTitle.get(title)!;
          const prev = perPublisher.get(e.pubkey);
          if (!prev || prev.at < e.created_at) perPublisher.set(e.pubkey, { id: e.id, pubkey: e.pubkey, at: e.created_at });
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(
        [...byTitle.entries()]
          .map(([title, perPublisher]) => ({
            title,
            exporters: perPublisher.size,
            exporterPubkeys: [...perPublisher.keys()],
            sets: [...perPublisher.values()].map(({ id, pubkey: pk }) => ({ id, pubkey: pk })),
          }))
          .sort((a, b) => b.exporters - a.exporters)
          .slice(0, 6),
      );
    }
  });
}

/**
 * A repo's live activity: NIP-34 issues (1621) and patches (1617) that
 * reference the repo address by "a" tag (probed live). Newest first —
 * the repo page's "is anyone working on this?" feed.
 */
export function fetchRepoActivity(address: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve([]);
    const items: NostrEvent[] = [];
    const sub = relay
      .req({ kinds: [1621, 1617], "#a": [address], search: "include:spam", limit: 20 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) items.push(msg.event);
        else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(items.sort((a, b) => b.created_at - a.created_at));
    }
  });
}

/**
 * A repo's issue and patch counts (NIP-45 COUNT, kinds 1621/1617 keyed by the
 * repo address) — the "is anyone working on this?" signal for the repo card.
 * These are TOTALS referencing the repo, not open-vs-closed: distinguishing
 * open from resolved needs NIP-34 status events, which COUNT can't filter on.
 */
export function fetchRepoCounts(
  address: string,
  timeoutMs = 5000,
): Promise<{ issues: number; patches: number }> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay) return resolve({ issues: 0, patches: 0 });
    const result = { issues: 0, patches: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      resolve(result);
    };
    const one = () => {
      if (++done >= 2) finish();
    };
    const count = (kind: number, key: "issues" | "patches") => {
      subs.push(
        relay
          .count({ kinds: [kind], "#a": [address], search: "include:spam" })
          .subscribe({
            next: (r: { count?: number }) => {
              result[key] = r?.count ?? 0;
            },
            error: one,
            complete: one,
          }),
      );
    };
    // Set the timer BEFORE subscribing: a synchronous count response (or the
    // fake transport in tests) can complete during subscribe, and finish()
    // clears this timer — so it must already exist.
    const timer = setTimeout(finish, timeoutMs);
    count(1621, "issues");
    count(1617, "patches");
  });
}

/**
 * The wiki page for a NIP (kind 30818, d = "nip-46"). Several authors
 * publish competing versions — probed live, a real 10KB spec sits next to
 * 7-character stubs — so the most substantial page wins.
 */
export function fetchNipPage(dTags: string[], timeoutMs = 5000): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    const relay = searchRelay();
    if (!relay || dTags.length === 0) return resolve(null);
    let best: NostrEvent | null = null;
    const sub = relay
      .req({ kinds: [30818], "#d": dTags, search: "include:spam", limit: 10 })
      .subscribe((msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) {
          if (!best || msg.event.content.length > best.content.length) best = msg.event;
        } else if (msg.type === "EOSE" || msg.type === "CLOSED") {
          finish();
        }
      });
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(best);
    }
  });
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
