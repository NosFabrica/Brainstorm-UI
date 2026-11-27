/**
 * The per-row and per-page questions beside a search: an app's releases, reviews and zaps, a
 * person's vouches and sets, a repo's activity, issues' statuses, events' RSVPs, goals' progress…
 * Each is one search-relay question through lib/searchOnce (or COUNTs on the shared side socket),
 * resolved at EOSE or its deadline; none rejects.
 */
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { leaseSideSearchRelay, searchRelay } from "@/lib/searchRelay";
import { zapstoreRelay } from "@/lib/zapstoreRelay";
import { eventStore } from "@/lib/eventStore";
import { searchOnce } from "@/lib/searchOnce";
import { Observable } from "rxjs";
import { zapDescription } from "@/lib/zapRequest";
import { readGitStatus, statusFromAuthority } from "@/lib/gitEvents";
import { isGitItem } from "@/lib/gitStatus";
import { readRelease, readReleaseAsset } from "@/lib/release";
import { beats } from "@/lib/newestPerAddress";

/** An AbortSignal as searchOnce's `stop`: it fires on abort, and at once if the signal already has. */
function abortOf(signal: AbortSignal): Observable<unknown> {
  return new Observable((subscriber) => {
    const abort = () => subscriber.next(undefined);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    return () => signal.removeEventListener("abort", abort);
  });
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
  if (ids.length === 0) return Promise.resolve(null);
  const relay = zapstoreRelay();
  if (!relay) return Promise.resolve(null);
  let asset: ReleaseAsset | null = null;
  return searchOnce(
    { ids },
    {
      relay,
      onEvent: (e) => {
        if (asset || (e.kind !== 3063 && e.kind !== 1063)) return;
        // Each kind by its own tags (lib/release): a 1063 (NIP-94) has no version.
        const file = readReleaseAsset(e);
        if (file.url)
          asset = { url: file.url, mime: file.mime ?? "", size: file.size, version: file.version, hash: file.hash };
      },
      timeoutMs,
    },
  ).then(() => asset);
}

/**
 * An app's Zap Store releases, newest first — [0] is the "What's new"
 * release, the rest are the version history. Releases are kind 30063 by
 * the same publisher, with d = "<app-d>@<version>"; the lens is
 * include:spam because we want the publisher's own releases regardless
 * of how the observer ranks them.
 */
export function fetchReleases(appD: string, publisher: string, timeoutMs = 5000): Promise<AppRelease[]> {
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  // One per release address: the store answers an older copy with the newer one.
  const releases = new Map<string, AppRelease>();
  return searchOnce(
    { kinds: [30063], authors: [publisher], search: "include:spam", limit: 50 },
    {
      relay,
      onEvent: (e) => {
        const d = e.tags.find((t) => t[0] === "d")?.[1] ?? "";
        // Whose release it is, as each shape says (lib/release): NIP-82's `i` is the app's `d`,
        // NIP-51's `a` its address; a `d` of "<app>@<version>" (NIP-82's rule) for either.
        const release = readRelease(e);
        const ofApp = release.app?.address === `32267:${publisher}:${appD}` || d.startsWith(`${appD}@`);
        if (!ofApp) return;
        releases.set(d, {
          version: release.version ?? (d.startsWith(`${appD}@`) ? d.slice(appD.length + 1) : d),
          at: e.created_at,
          notes: e.content ?? "",
          assetIds: release.assets.map((a) => a.id),
        });
      },
      timeoutMs,
    },
  ).then(() => [...releases.values()].sort((a, b) => b.at - a.at));
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
export function fetchAppReviews(
  address: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<AppReview[]> {
  const { limit = 50, timeoutMs = 5000 } = opts;
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  const reviews: AppReview[] = [];
  return searchOnce(
    { kinds: [1111, 1], "#a": [address], search: "include:spam", limit },
    {
      relay,
      onEvent: (e) => {
        const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1] ?? null;
        reviews.push({
          id: e.id,
          pubkey: e.pubkey,
          text: e.content,
          at: e.created_at,
          version: tag("v"),
          k: tag("k"),
          kind: e.kind,
        });
      },
      timeoutMs,
    },
  ).then(() => reviews.sort((a, b) => b.at - a.at));
}

/** What a NIP-57 zap receipt (kind 9735) says, read once for every caller. */
export interface ZapReceipt {
  /** The zapper: the receipt's `P` tag, else the embedded zap request's pubkey — only a 64-hex key. */
  pubkey: string | null;
  /** The zap request's message (NIP-57), trimmed — the receipt's own content only when it carries no request. */
  memo: string;
  /**
   * What the invoice was for, in millisats — the amount the payer paid for,
   * read from the bolt11's human-readable part. Null when the receipt names
   * no invoice amount, or when its zap request asked for a different amount
   * (NIP-57: the two must match; a receipt where they don't is not counted).
   */
  msats: number | null;
}

const HEX_KEY = /^[0-9a-f]{64}$/i;

/** Millisats per unit of a bolt11 amount's multiplier (1 BTC = 1e11 msat). */
const BOLT11_MSATS: Record<string, number> = { "": 1e11, m: 1e8, u: 1e5, n: 100, p: 0.1 };

/** A bolt11 invoice's amount in millisats, from its human-readable part ("lnbc2500u1…"); null when it names none. */
export function bolt11Msats(invoice: string | undefined): number | null {
  const m = invoice?.trim().match(/^ln(?:bcrt|bc|tbs|tb|sb)(\d+)([munp]?)1/i);
  if (!m) return null;
  const msats = Number(m[1]) * BOLT11_MSATS[m[2].toLowerCase()];
  return Number.isFinite(msats) && msats > 0 ? Math.floor(msats) : null;
}

export function parseZapReceipt(e: NostrEvent): ZapReceipt {
  // Parsed once per receipt (lib/zapRequest), however many readers ask.
  const request = zapDescription(e);
  const P = e.tags.find((t) => t[0] === "P")?.[1];
  const candidate = P ?? request?.pubkey ?? null;
  // NIP-57: the comment is the request's content. A receipt is the wallet's,
  // and one wrapping someone's real request must not speak in their name; only
  // a receipt that carries no request has a content of its own to show.
  const memo = (request ? request.content : e.content).trim();
  const invoice = bolt11Msats(e.tags.find((t) => t[0] === "bolt11")?.[1]);
  const asked = Number(request?.tags.find((t) => t[0] === "amount")?.[1]);
  const mismatched = invoice !== null && Number.isFinite(asked) && asked > 0 && asked !== invoice;
  return {
    pubkey: candidate && HEX_KEY.test(candidate) ? candidate.toLowerCase() : null,
    memo,
    msats: mismatched ? null : invoice,
  };
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
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  const zaps: AppZap[] = [];
  return searchOnce(
    { kinds: [9735], "#a": [address], search: "include:spam", limit },
    {
      relay,
      onEvent: (e) => {
        const { pubkey, memo } = parseZapReceipt(e);
        zaps.push({ id: e.id, pubkey, memo, at: e.created_at });
      },
      timeoutMs,
    },
  ).then(() => zaps.sort((a, b) => b.at - a.at));
}

/**
 * App listings (kind 32267) by address `32267:<pubkey>:<d>` — one REQ on the
 * search relay for however many addresses, keyed back by address. The home
 * feed's New releases band needs the listing's name and icon for each
 * release it shows. EOSE or timeout resolves; never rejects.
 */
export function fetchAppsByAddress(addresses: string[], timeoutMs = 5000): Promise<Map<string, NostrEvent>> {
  const out = new Map<string, NostrEvent>();
  const parsed = addresses
    .map((a) => a.split(":"))
    .filter((p) => p.length >= 3 && p[0] === "32267")
    .map((p) => ({ pubkey: p[1], d: p.slice(2).join(":") }));
  if (parsed.length === 0) return Promise.resolve(out);
  const relay = searchRelay();
  if (!relay) return Promise.resolve(out);
  return searchOnce(
    {
      kinds: [32267],
      authors: [...new Set(parsed.map((p) => p.pubkey))],
      "#d": [...new Set(parsed.map((p) => p.d))],
      search: "include:spam",
      limit: parsed.length * 2,
    },
    {
      relay,
      onEvent: (e) => {
        const d = e.tags.find((t) => t[0] === "d")?.[1];
        if (d === undefined) return;
        const key = `32267:${e.pubkey}:${d}`;
        const prev = out.get(key);
        if (!prev || prev.created_at < e.created_at) out.set(key, e);
      },
      timeoutMs,
    },
  ).then(() => out);
}

/**
 * Engagement the relay can count today (probed 2026-09-03): zaps (9735) and
 * replies (1 / 1111) that e-tag the note. Reactions and reposts aren't
 * indexed (RELAY-ASKS). Two NIP-45 COUNTs, never a page of events; a failed
 * or slow count reads as zero.
 */
export function fetchNoteEngagement(id: string, timeoutMs = 5000): Promise<{ zaps: number; replies: number }> {
  return new Promise((resolve) => {
    // A row's question: on the shared side socket, never in front of the search's own REQs.
    const lease = leaseSideSearchRelay();
    if (!lease) return resolve({ zaps: 0, replies: 0 });
    const { relay } = lease;
    const result = { zaps: 0, replies: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      lease.release();
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

/**
 * The numbers on an app card: reviews (kinds 1111/1), zaps (9735) and how
 * many curated app collections (kind 30267) feature it — three NIP-45
 * COUNTs keyed by the listing address. Counts off the wire, never pages of
 * events: a results page full of cards must stay cheap.
 */
export function fetchAppEndorsementCounts(
  address: string,
  timeoutMs = 5000,
): Promise<{ reviews: number; zaps: number; collections: number }> {
  return new Promise((resolve) => {
    // Three COUNTs per app: the shared side socket's, as fetchNoteEngagement's are.
    const lease = leaseSideSearchRelay();
    if (!lease) return resolve({ reviews: 0, zaps: 0, collections: 0 });
    const { relay } = lease;
    const result = { reviews: 0, zaps: 0, collections: 0 };
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      lease.release();
      resolve(result);
    };
    const one = () => {
      if (++done >= 3) finish();
    };
    const count = (kinds: number[], key: keyof typeof result) => {
      subs.push(
        relay.count({ kinds, "#a": [address], search: "include:spam" }).subscribe({
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
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  const byAuthor = new Map<string, PersonVouch>();
  return searchOnce(
    { kinds: [VOUCH_KIND], "#p": [pubkey], search: "include:spam", limit: 50 },
    {
      relay,
      onEvent: (e) => {
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
      },
      timeoutMs,
    },
  ).then(() => [...byAuthor.values()].sort((a, b) => b.at - a.at));
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
  const replies = new Map<string, VouchReply>();
  if (vouchIds.length === 0) return Promise.resolve(replies);
  const relay = searchRelay();
  if (!relay) return Promise.resolve(replies);
  return searchOnce(
    { kinds: [1111], "#e": vouchIds, "#K": [String(VOUCH_KIND)], search: "include:spam", limit: 100 },
    {
      relay,
      onEvent: (e) => {
        const target = e.tags.find((t) => t[0] === "e")?.[1];
        if (!target) return;
        const prev = replies.get(target);
        if (prev && prev.at >= e.created_at) return;
        replies.set(target, { id: e.id, pubkey: e.pubkey, text: e.content.trim(), at: e.created_at });
      },
      timeoutMs,
    },
  ).then(() => replies);
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
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  // Per title, one set per publisher (the newest, if a publisher has several).
  const byTitle = new Map<string, Map<string, { id: string; pubkey: string; at: number }>>();
  return searchOnce(
    { kinds: [30000], "#p": [pubkey], search: "include:spam", limit: 200 },
    {
      relay,
      onEvent: (e) => {
        const title = e.tags.find((t) => t[0] === "title" || t[0] === "name")?.[1]?.trim();
        if (!title) return;
        if (!byTitle.has(title)) byTitle.set(title, new Map());
        const perPublisher = byTitle.get(title)!;
        const prev = perPublisher.get(e.pubkey);
        if (!prev || prev.at < e.created_at)
          perPublisher.set(e.pubkey, { id: e.id, pubkey: e.pubkey, at: e.created_at });
      },
      timeoutMs,
    },
  ).then(() =>
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

/**
 * A repo's live activity: NIP-34 issues (1621) and patches (1617) that
 * reference the repo address by "a" tag (probed live). Newest first —
 * the repo page's "is anyone working on this?" feed.
 */
export function fetchRepoActivity(address: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  const items: NostrEvent[] = [];
  return searchOnce(
    { kinds: [1621, 1617, 1618], "#a": [address], search: "include:spam", limit: 20 },
    { relay, onEvent: (e) => items.push(e), timeoutMs },
  ).then(() => items.sort((a, b) => b.created_at - a.created_at));
}

/**
 * A repo's issue and patch counts (NIP-45 COUNT, kinds 1621/1617 keyed by the
 * repo address) — the "is anyone working on this?" signal for the repo card.
 * These are TOTALS referencing the repo, not open-vs-closed: distinguishing
 * open from resolved needs NIP-34 status events, which COUNT can't filter on.
 */
export interface RepoCounts {
  issues: number;
  patches: number;
  /** Distinct authors of the repo's patches and pull requests, newest first. */
  contributors: string[];
  /** When anything — issue, patch, pull request — last touched the repo. */
  lastAt: number | null;
}

/**
 * The "is anyone working on this?" signals for a repo card: how many issues
 * and patches (NIP-45 COUNTs, keyed by the repo address), who has sent
 * patches or pull requests, and when anything last happened — the last two
 * read off one small recent page of the repo's items.
 */
export function fetchRepoCounts(address: string, timeoutMs = 5000): Promise<RepoCounts> {
  return new Promise((resolve) => {
    // Two COUNTs and a REQ per repo card: the shared side socket's, as fetchNoteEngagement's are.
    const lease = leaseSideSearchRelay();
    const result: RepoCounts = { issues: 0, patches: 0, contributors: [], lastAt: null };
    if (!lease) return resolve(result);
    const { relay } = lease;
    const subs: { unsubscribe: () => void }[] = [];
    let done = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.unsubscribe());
      lease.release();
      resolve(result);
    };
    const one = () => {
      if (++done >= 3) finish();
    };
    const count = (kind: number, key: "issues" | "patches") => {
      subs.push(
        relay.count({ kinds: [kind], "#a": [address], search: "include:spam" }).subscribe({
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
    const seen = new Set<string>();
    const recent = new AbortController();
    subs.push({ unsubscribe: () => recent.abort() });
    void searchOnce(
      { kinds: [1617, 1618, 1621], "#a": [address], search: "include:spam", limit: 24 },
      {
        relay,
        onEvent: (ev) => {
          if (ev.created_at > (result.lastAt ?? 0)) result.lastAt = ev.created_at;
          if ((ev.kind === 1617 || ev.kind === 1618) && !seen.has(ev.pubkey)) {
            seen.add(ev.pubkey);
            result.contributors.push(ev.pubkey);
          }
        },
        timeoutMs,
        stop: abortOf(recent.signal),
      },
    ).then(one);
  });
}

/**
 * The specs (kind 30817) that define a kind — the `k` tags they carry name
 * it, and the relay narrows by them (probed 2026-09-23). A structural
 * event's page says what its kind is by pointing here.
 */
export function fetchSpecsForKind(kind: number, timeoutMs = 5000): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  const found: NostrEvent[] = [];
  return searchOnce(
    { kinds: [30817], "#k": [String(kind)], search: "include:spam", limit: 5 },
    { relay, onEvent: (e) => found.push(e), timeoutMs },
  ).then(() => found);
}

/**
 * The wiki page for a NIP (kind 30818, d = "nip-46"). Several authors
 * publish competing versions — probed live, a real 10KB spec sits next to
 * 7-character stubs — so the most substantial page wins.
 */
export function fetchNipPage(dTags: string[], timeoutMs = 5000): Promise<NostrEvent | null> {
  const relay = searchRelay();
  if (!relay || dTags.length === 0) return Promise.resolve(null);
  let best: NostrEvent | null = null;
  return searchOnce(
    { kinds: [30818], "#d": dTags, search: "include:spam", limit: 10 },
    {
      relay,
      onEvent: (e) => {
        if (!best || e.content.length > best.content.length) best = e;
      },
      timeoutMs,
    },
  ).then(() => best);
}

/**
 * Sibling listings that share category t-tags — the "Similar apps" row.
 * Deduped by address (listings are replaceable), self excluded, ordered by
 * how many of the given tags each one shares.
 */
export function fetchSimilarApps(tags: string[], selfAddress: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay || tags.length === 0) return Promise.resolve([]);
  const byAddress = new Map<string, NostrEvent>();
  return searchOnce(
    { kinds: [32267], "#t": tags, search: "include:spam", limit: 24 },
    {
      relay,
      onEvent: (e) => {
        const addr = appAddress(e);
        if (addr === selfAddress) return;
        const known = byAddress.get(addr);
        if (!known || e.created_at > known.created_at) byAddress.set(addr, e);
      },
      timeoutMs,
    },
  ).then(() => {
    const overlap = (e: NostrEvent) => e.tags.filter((t) => t[0] === "t" && tags.includes(t[1])).length;
    return [...byAddress.values()].sort((a, b) => overlap(b) - overlap(a)).slice(0, 6);
  });
}

/**
 * Other sellers' listings in the same categories — the "Similar" row under a
 * listing. The seller's own items are left out (the page has a row for
 * those); edits of one listing collapse to the newest; best category overlap
 * first, then newest. Case-insensitive on the tags, since marketplaces write
 * "Health & Beauty" and "health & beauty" for the same shelf.
 */
export function fetchSimilarListings(
  categories: string[],
  selfAddress: string,
  opts: { excludePubkey?: string; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const relay = searchRelay();
  if (!relay || categories.length === 0) return Promise.resolve([]);
  const wanted = new Set(categories.map((c) => c.toLowerCase()));
  const byAddress = new Map<string, NostrEvent>();
  return searchOnce(
    { kinds: [30402], "#t": categories, search: "include:spam", limit: 200 },
    {
      relay,
      onEvent: (ev) => {
        if (opts.excludePubkey && ev.pubkey === opts.excludePubkey) return;
        const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
        const addr = `${ev.kind}:${ev.pubkey}:${d}`;
        if (addr === selfAddress) return;
        const known = byAddress.get(addr);
        if (!known || ev.created_at > known.created_at) byAddress.set(addr, ev);
      },
      timeoutMs,
    },
  ).then(() => {
    const overlap = (e: NostrEvent) =>
      new Set(
        e.tags.filter((t) => t[0] === "t" && t[1] && wanted.has(t[1].toLowerCase())).map((t) => t[1].toLowerCase()),
      ).size;
    return [...byAddress.values()].sort((a, b) => overlap(b) - overlap(a) || b.created_at - a.created_at).slice(0, 12);
  });
}

/**
 * Comments on an event, from the relay that indexes them. NIP-22 comments
 * name their root by coordinate (#A / #a, for addressable things like
 * listings) or by id (#E / #e); a NIP-10 reply uses #e. Marketplace apps
 * publish to their own relays, so the profile relays often hold none of it —
 * the search relay does, but refuses any filter without a lens, hence
 * include:spam on every request. Never rejects; whatever arrived by the
 * deadline is the answer.
 */
export function fetchCommentsByAddress(
  address: string | null,
  eventId: string,
  timeoutMs = 6000,
): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay) return Promise.resolve([]);
  const filters: Record<string, unknown>[] = [
    ...(address
      ? [
          { kinds: [1111, 1244], "#A": [address] },
          { kinds: [1111, 1244], "#a": [address] },
        ]
      : []),
    // Comments (1111) and voice replies (1244, NIP-A0) thread by the same NIP-22 tags.
    { kinds: [1111, 1244], "#E": [eventId] },
    { kinds: [1, 1111, 1244], "#e": [eventId] },
  ];
  const byId = new Map<string, NostrEvent>();
  return Promise.all(
    filters.map((f) =>
      searchOnce({ ...f, search: "include:spam", limit: 150 }, { relay, onEvent: (e) => byId.set(e.id, e), timeoutMs }),
    ),
  ).then(() => [...byId.values()]);
}

/** What `fetchGitStatuses` needs of an item: whose it is and which repo it names. */
export type GitStatusItem = { id: string; pubkey: string; tags: string[][] };

/**
 * What became of a page of issues and patches: one request for all of them.
 * NIP-34 status events (1630–1633) name their item by the e-tag marked
 * `root`; the newest that counts wins. Under include:spam like every relay
 * request here.
 *
 * NIP-34 counts only a status from the item's author or a maintainer: the
 * announcement's author (named by the item's `a`, 30617:<owner>:<d>) and its
 * `maintainers` tag. The announcement is read from the store, else asked
 * beside the statuses. An item given by id alone is looked up in the store,
 * else asked for beside the statuses (then its repo's announcement); one
 * neither has can't be told whose it is, and no status counts for it: a
 * stranger's "closed" never stands in for the author's.
 */
export function fetchGitStatuses(
  items: readonly (string | GitStatusItem)[],
  timeoutMs = 5000,
): Promise<Map<string, { kind: number; at: number }>> {
  const out = new Map<string, { kind: number; at: number }>();
  const relay = searchRelay();
  if (!relay || items.length === 0) return Promise.resolve(out);
  const known = new Map<string, GitStatusItem | undefined>();
  for (const item of items) {
    if (typeof item !== "string") known.set(item.id, item);
    else if (!known.get(item)) known.set(item, eventStore.getEvent(item));
  }
  const ids = [...known.keys()];
  const unheld = ids.filter((id) => !known.get(id));
  // The repos the items name, and their announcements where the store holds them.
  const repos = new Map<string, GitStatusItem | undefined>();
  const noteRepos = (item: GitStatusItem | undefined) => {
    for (const coord of gitRepoCoords(item)) {
      if (repos.has(coord)) continue;
      const [, owner, ...d] = coord.split(":");
      repos.set(coord, eventStore.getReplaceable(30617, owner, d.join(":")));
    }
  };
  for (const item of known.values()) noteRepos(item);
  const asked = new Set<string>();
  const askRepos = (): Promise<unknown> => {
    const missing = [...repos.keys()].filter((c) => !repos.get(c) && !asked.has(c));
    if (!missing.length) return Promise.resolve();
    for (const c of missing) asked.add(c);
    const parts = missing.map((c) => c.split(":"));
    return searchOnce(
      {
        kinds: [30617],
        authors: [...new Set(parts.map((p) => p[1]))],
        "#d": [...new Set(parts.map((p) => p.slice(2).join(":")))],
        search: "include:spam",
        limit: missing.length * 2,
      },
      {
        relay,
        onEvent: (ev) => {
          if (ev.kind !== 30617) return;
          const coord = `30617:${ev.pubkey}:${ev.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
          if (!repos.has(coord)) return;
          const held = repos.get(coord);
          if (!held || beats(ev, held as NostrEvent)) repos.set(coord, ev);
        },
        timeoutMs,
      },
    );
  };
  const statuses: NostrEvent[] = [];
  const statusAsk = searchOnce(
    { kinds: [1630, 1631, 1632, 1633], "#e": ids, search: "include:spam", limit: Math.max(200, ids.length * 4) },
    {
      relay,
      onEvent: (ev) => {
        if (ev.kind >= 1630 && ev.kind <= 1633) statuses.push(ev);
      },
      timeoutMs,
    },
  );
  const repoAsk = askRepos();
  // The items the store doesn't hold, then the repos they name.
  const itemAsk = unheld.length
    ? searchOnce(
        { ids: unheld, search: "include:spam", limit: unheld.length },
        {
          relay,
          onEvent: (ev) => {
            if (known.has(ev.id) && !known.get(ev.id) && isGitItem(ev.kind)) known.set(ev.id, ev);
          },
          timeoutMs,
        },
      ).then(() => {
        for (const id of unheld) noteRepos(known.get(id));
        return askRepos();
      })
    : Promise.resolve();
  return Promise.all([statusAsk, repoAsk, itemAsk]).then(() => {
    for (const ev of statuses) {
      // NIP-34: the item is the `e` marked root; a 1631's `reply`-marked `e` is a revision it
      // accepted. Any other `e` names neither.
      const status = readGitStatus(ev);
      const named = [status.target, ...(ev.kind === 1631 ? status.revisions : [])];
      for (const ref of named) {
        if (!ref || !known.has(ref.id) || !statusCounts(ev.pubkey, known.get(ref.id), repos)) continue;
        const held = out.get(ref.id);
        if (!held || ev.created_at > held.at) out.set(ref.id, { kind: ev.kind, at: ev.created_at });
      }
    }
    return out;
  });
}

/**
 * Whether a status by `statusAuthor` counts for `item` (lib/gitEvents
 * statusFromAuthority). A repo with no announcement found still names its
 * owner, who announced it. An item not found: nobody's can be told to count.
 */
function statusCounts(
  statusAuthor: string,
  item: GitStatusItem | undefined,
  repos: ReadonlyMap<string, GitStatusItem | undefined>,
): boolean {
  if (!item) return false;
  if (statusAuthor === item.pubkey) return true;
  return gitRepoCoords(item).some((coord) => {
    const repo = repos.get(coord) ?? { pubkey: coord.split(":")[1], tags: [] };
    return statusFromAuthority(statusAuthor, item.pubkey, repo) === true;
  });
}

/** The repos a NIP-34 item names: its `a` tags at a repo announcement (30617:<owner>:<d>). */
function gitRepoCoords(item: GitStatusItem | undefined): string[] {
  if (!item) return [];
  return item.tags.filter((t) => t[0] === "a" && /^30617:[0-9a-f]{64}:/.test(t[1] ?? "")).map((t) => t[1]);
}

/**
 * How much conversation a page of issues has: NIP-22 comments name their
 * root in an uppercase E tag, so one request tallies them per issue. A
 * comment seen twice counts once.
 */
export function fetchGitCommentCounts(ids: string[], timeoutMs = 5000): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const relay = searchRelay();
  if (!relay || ids.length === 0) return Promise.resolve(out);
  const wanted = new Set(ids);
  const seen = new Set<string>();
  return searchOnce(
    { kinds: [1111], "#E": ids, search: "include:spam", limit: Math.max(500, ids.length * 10) },
    {
      relay,
      onEvent: (ev) => {
        if (seen.has(ev.id)) return;
        seen.add(ev.id);
        const root = ev.tags.find((t) => t[0] === "E" && wanted.has(t[1]))?.[1];
        if (root) out.set(root, (out.get(root) ?? 0) + 1);
      },
      timeoutMs,
    },
  ).then(() => out);
}

/**
 * The other announcements of one codebase: NIP-34 marks a repo by its
 * earliest unique commit, and the relay answers a #r filter on it. The repo
 * itself is left out; one announcement per maintainer, the newest.
 */
export function fetchRepoForks(euc: string, selfAddress: string, timeoutMs = 5000): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay || !euc) return Promise.resolve([]);
  const byMaintainer = new Map<string, NostrEvent>();
  return searchOnce(
    { kinds: [30617], "#r": [euc], search: "include:spam", limit: 50 },
    {
      relay,
      onEvent: (ev) => {
        const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
        if (`${ev.kind}:${ev.pubkey}:${d}` === selfAddress) return;
        const known = byMaintainer.get(ev.pubkey);
        if (!known || ev.created_at > known.created_at) byMaintainer.set(ev.pubkey, ev);
      },
      timeoutMs,
    },
  ).then(() => [...byMaintainer.values()]);
}

/**
 * The repo behind a NIP-34 coordinate ("30617:<pubkey>:<d>") — its newest
 * announcement, so an issue can link to its repo's page. Null when the
 * coordinate is malformed or nothing answers.
 */
export function fetchRepoByAddress(address: string, timeoutMs = 5000): Promise<NostrEvent | null> {
  const [kind, pubkey, ...rest] = address.split(":");
  const d = rest.join(":");
  const relay = searchRelay();
  if (!relay || kind !== "30617" || !/^[0-9a-f]{64}$/i.test(pubkey ?? "")) return Promise.resolve(null);
  let best: NostrEvent | null = null;
  return searchOnce(
    { kinds: [30617], authors: [pubkey], "#d": [d], search: "include:spam", limit: 3 },
    {
      relay,
      onEvent: (e) => {
        if (!best || e.created_at > best.created_at) best = e;
      },
      timeoutMs,
    },
  ).then(() => best);
}

export interface EventRsvps {
  /** People whose latest answer is "accepted". */
  going: number;
  /** Their pubkeys, newest answer first — the faces on the card. */
  faces: string[];
  /** Everyone going, newest answer first: what a lens counts ("K you trust"). */
  people: string[];
}

/** An RSVP dated further ahead than this is not counted: a future date would pin its answer. */
const RSVP_FUTURE_SLACK_S = 86_400;

/**
 * Who is going, for a page of calendar events: NIP-52 RSVPs (kind 31925)
 * name their event by coordinate and carry a status. One request per page;
 * a person's newest answer is the one that counts.
 */
export function fetchEventRsvps(addresses: string[], timeoutMs = 5000): Promise<Map<string, EventRsvps>> {
  const out = new Map<string, EventRsvps>();
  const relay = searchRelay();
  if (!relay || addresses.length === 0) return Promise.resolve(out);
  const wanted = new Set(addresses);
  const latest = new Map<string, Map<string, { status: string; at: number }>>();
  return searchOnce(
    { kinds: [31925], "#a": addresses, search: "include:spam", limit: Math.max(500, addresses.length * 20) },
    {
      relay,
      onEvent: (ev) => {
        const addr = ev.tags.find((t) => t[0] === "a" && wanted.has(t[1]))?.[1];
        if (!addr || ev.created_at > Date.now() / 1000 + RSVP_FUTURE_SLACK_S) return;
        const status = (ev.tags.find((t) => t[0] === "status")?.[1] ?? "").toLowerCase();
        const people = latest.get(addr) ?? new Map();
        const known = people.get(ev.pubkey);
        if (!known || ev.created_at > known.at) people.set(ev.pubkey, { status, at: ev.created_at });
        latest.set(addr, people);
      },
      timeoutMs,
    },
  ).then(() => {
    for (const [addr, people] of latest) {
      const going = [...people.entries()].filter(([, v]) => v.status === "accepted").sort((a, b) => b[1].at - a[1].at);
      if (going.length)
        out.set(addr, {
          going: going.length,
          faces: going.slice(0, 6).map(([pk]) => pk),
          people: going.map(([pk]) => pk),
        });
    }
    return out;
  });
}

/** What a NIP-75 zap goal has raised so far, and from whom. */
export interface GoalProgress {
  sats: number;
  /** Zappers, most recent first, once each. */
  zappers: string[];
}

/**
 * Progress for NIP-75 zap goals: the zap receipts (9735) that `e`-tag each
 * goal, one REQ on the search relay for a page of goals. A receipt counts
 * its invoice's amount (parseZapReceipt), never the amount its zap request
 * merely asked for; receipt signers are not checked against the goal
 * owner's LNURL server, so this is what the network reports, not an audit.
 * A goal's `closed_at` (in `closesAt`, by id) ends it: receipts after it
 * don't count (NIP-75).
 *
 * `complete` says whether the answer is the whole answer: the relay reached
 * EOSE before the deadline without filling the page. Only then does a goal
 * with no receipt mean "raised nothing"; otherwise its progress is unknown.
 * Never rejects.
 */
export function fetchGoalProgress(
  goalIds: string[],
  timeoutMs = 5000,
  closesAt?: ReadonlyMap<string, number>,
): Promise<{ byGoal: Map<string, GoalProgress>; complete: boolean }> {
  const byGoal = new Map<string, GoalProgress>();
  const relay = searchRelay();
  if (!relay || goalIds.length === 0) return Promise.resolve({ byGoal, complete: false });
  const wanted = new Set(goalIds);
  const seen = new Set<string>();
  const limit = Math.min(2000, goalIds.length * 200);
  const tally = new Map<string, { msats: number; zappers: { pk: string; at: number }[] }>();
  return searchOnce(
    { kinds: [9735], "#e": goalIds, search: "include:spam", limit },
    {
      relay,
      onEvent: (e) => {
        if (seen.has(e.id)) return;
        seen.add(e.id);
        const goal = e.tags.find((t) => t[0] === "e" && wanted.has(t[1]))?.[1];
        if (!goal) return;
        const closes = closesAt?.get(goal);
        if (closes !== undefined && e.created_at > closes) return;
        const receipt = parseZapReceipt(e);
        const row = tally.get(goal) ?? { msats: 0, zappers: [] };
        if (receipt.msats) row.msats += receipt.msats;
        if (receipt.pubkey) row.zappers.push({ pk: receipt.pubkey, at: e.created_at });
        tally.set(goal, row);
      },
      timeoutMs,
    },
  ).then(({ answered: eose }) => {
    for (const [goal, row] of tally) {
      const zappers = [...new Set(row.zappers.sort((a, b) => b.at - a.at).map((z) => z.pk))];
      byGoal.set(goal, { sats: Math.floor(row.msats / 1000), zappers });
    }
    return { byGoal, complete: eose && seen.size < limit };
  });
}

/**
 * The events an event page shows under a thing (a community's posts, a
 * calendar's events, a badge's awards…): the given filters in one socket,
 * under include:spam like every relay request here — the page is about one
 * thing its reader chose, and the author's own trust is on the page. De-duped,
 * newest first. EOSE on every filter or timeout resolves; never rejects.
 */
export function fetchFromSearch(
  filters: Record<string, unknown>[],
  { limit = 60, timeoutMs = 6000 }: { limit?: number; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay || filters.length === 0) return Promise.resolve([]);
  const byId = new Map<string, NostrEvent>();
  // A filter is settled by its EOSE, a CLOSED, or its stream failing — each on its own.
  return Promise.all(
    filters.map((f) =>
      searchOnce({ limit, ...f, search: "include:spam" }, { relay, onEvent: (e) => byId.set(e.id, e), timeoutMs }),
    ),
  ).then(() => [...byId.values()].sort((a, b) => b.created_at - a.created_at));
}

/**
 * Addressable events by coordinate (`kind:pubkey:d`) from the search relay —
 * a calendar's events, a playlist's tracks, a rating's subject. The filter is
 * a cross-product of the kinds, authors and d-tags asked, so it can match
 * coordinates nobody asked for; only the asked ones come back, newest version
 * of each, keyed by coordinate.
 */
export async function fetchByAddress(coords: string[], timeoutMs = 6000): Promise<Map<string, NostrEvent>> {
  const parsed = [...new Set(coords)]
    .map((c) => c.split(":"))
    .filter((p) => p.length >= 3 && /^\d+$/.test(p[0]) && /^[0-9a-f]{64}$/i.test(p[1]))
    .map((p) => ({ kind: Number(p[0]), pubkey: p[1].toLowerCase(), d: p.slice(2).join(":") }));
  const out = new Map<string, NostrEvent>();
  if (parsed.length === 0) return out;
  const wanted = new Set(parsed.map((p) => `${p.kind}:${p.pubkey}:${p.d}`));
  const events = await fetchFromSearch(
    [
      {
        kinds: [...new Set(parsed.map((p) => p.kind))],
        authors: [...new Set(parsed.map((p) => p.pubkey))],
        "#d": [...new Set(parsed.map((p) => p.d))],
      },
    ],
    { limit: Math.min(500, parsed.length * 3), timeoutMs },
  );
  for (const e of events) {
    const key = `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
    if (!wanted.has(key)) continue;
    const held = out.get(key);
    if (!held || e.created_at > held.created_at) out.set(key, e);
  }
  return out;
}
