/**
 * Publishing to, and reading from, the reader's Observer site (quartz
 * `plans/2026-11-11-observer-site.md`; the pure rules are `lib/frontPage/observerSite`).
 *
 * The site is public by design. Only a page the front page's validator passed is ever
 * handed here (`printFrontPage` returns no other page), and its pictures stay where
 * their authors published them: nothing is downloaded or re-uploaded but the site's
 * own files.
 */
import type { NostrEvent } from "nostr-tools";
import { activeAccount, signAs } from "@/accounts/signing";
import { eventStore } from "@/lib/eventStore";
import { PROFILE_RELAYS } from "@/lib/relays";
import { beats, requestNewestWithReach } from "@/lib/relayRequest";
import { loadRelayList, outboxRelays } from "@/lib/relayRouting";
import { relayLimits } from "@/lib/relayLimits";
import {
  BLOSSOM_SERVER_LIST_KIND,
  loadBlossomServers,
  normalizeServer,
  parseBlossomServers,
} from "@/lib/blossomServers";
import { readBlob, writeBlob } from "@/lib/blobCache";
import { nostrAuthHeader, serverScopeTags } from "@/services/blossom";
import { publishToRelays } from "@/services/nostr";
import { withPaperCsp } from "@/lib/frontPage/validate";
import {
  EDITIONS_PATH,
  OBSERVER_D,
  OBSERVER_SITE_KIND,
  aggregateHash,
  archiveHtml,
  eventBudget,
  editionPath,
  latestDay,
  manifestTemplate,
  mergeEntries,
  observerNaddr,
  observerUrl,
  parseEditions,
  rebuildFromPaths,
  rollOff,
  serializeEditions,
  sha256Text,
  siteDescription,
  siteTitle,
  tagBudget,
  upsertEdition,
  utcDay,
  type EditionEntry,
  type EditionsIndex,
} from "@/lib/frontPage/observerSite";

/** What `signAs` adds to a 35128 (`["client", "Brainstorm"]`) and the measure doesn't see. */
const SIGNER_TAG_SLACK = 64;
const SIGNER_TAGS = 1;

export interface ObserverSite {
  event: NostrEvent | null;
  index: EditionsIndex;
  /** Where its files are: the manifest's `server` hints, then the author's own list. */
  servers: string[];
  /** The author's own Blossom servers (kind 10063), in their order: where a publish uploads. */
  own: string[];
  relays: string[];
  /** At least one write relay answered the read to the end. Without that, nothing is known. */
  reached: boolean;
}

function serverHints(event: NostrEvent | null | undefined): string[] {
  return (event?.tags ?? [])
    .filter((t) => t[0] === "server" && t[1])
    .map((t) => normalizeServer(t[1]))
    .filter((s): s is string => !!s);
}

const dedupe = (list: string[]) => [...new Set(list)];

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** How long one Blossom server gets to serve a file before it counts as not having it. */
const BLOB_TIMEOUT_MS = 8_000;

/** The bytes as text, if they hash to `want`; null for any other bytes. */
async function verified(bytes: ArrayBuffer, want: string): Promise<string | null> {
  // Any server can answer; only the hash says it answered with the right file.
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== want) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * One blob by its sha256: this device's copy when it has one (a hash names one file
 * forever), else the first server to serve bytes with that hash. Every server is asked
 * at once, each for at most BLOB_TIMEOUT_MS, and the rest are cancelled once one
 * answers: a server that hangs costs its own deadline, not the whole read. The hash is
 * of the bytes as served, not of a decoded string (a decoder that repairs invalid UTF-8
 * would make two different files hash the same).
 */
export async function fetchBlob(
  sha256: string,
  servers: string[],
  { signal, timeoutMs = BLOB_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string | null> {
  const want = sha256.toLowerCase();
  const held = await readBlob(want);
  if (held !== null) return held;
  if (signal?.aborted || servers.length === 0) return null;

  const done = new AbortController();
  const stop = () => done.abort();
  signal?.addEventListener("abort", stop, { once: true });
  const one = async (server: string): Promise<string> => {
    // Its own deadline: a server that hangs gives up alone, not the ones still sending.
    const mine = new AbortController();
    const cancel = () => mine.abort();
    done.signal.addEventListener("abort", cancel, { once: true });
    const deadline = setTimeout(cancel, timeoutMs);
    try {
      const response = await fetch(`${server}/${want}`, { signal: mine.signal });
      if (!response.ok) throw new Error(`${response.status}`);
      const text = await verified(await response.arrayBuffer(), want);
      if (text === null) throw new Error("other bytes");
      return text;
    } finally {
      clearTimeout(deadline);
      done.signal.removeEventListener("abort", cancel);
    }
  };
  try {
    const text = await Promise.any(servers.map(one));
    void writeBlob(want, text);
    return text;
  } catch {
    return null;
  } finally {
    done.abort();
    signal?.removeEventListener("abort", stop);
  }
}

/** Where a site's files are: the manifest's `server` hints, then the author's own list. */
function siteServers(site: NostrEvent | null | undefined, own: string[]): string[] {
  return dedupe([...serverHints(site), ...own]);
}

/** The author's Blossom servers as the store holds them now, without asking a relay. */
function heldOwnServers(pubkey: string): string[] {
  return parseBlossomServers(eventStore.getReplaceable(BLOSSOM_SERVER_LIST_KIND, pubkey) as NostrEvent | undefined);
}

/** What the front page shows of a site: its editions and where to fetch them. */
export interface SiteView {
  editions: EditionEntry[];
  servers: string[];
  exists: boolean;
}

/**
 * What a manifest says on its own, with no network: one entry per dated path, and the
 * servers it and the store name. The day tabs draw from this on the first render; the
 * index's headlines and counts follow from `readObserverSite`.
 */
export function siteViewOf(site: NostrEvent, pubkey: string): SiteView {
  return {
    editions: rebuildFromPaths(site.tags),
    servers: siteServers(site, heldOwnServers(pubkey)),
    exists: true,
  };
}

/** The editions a manifest serves, described by its `editions.json` when that can be had. */
async function editionsOf(site: NostrEvent, servers: string[], signal?: AbortSignal): Promise<EditionsIndex> {
  const editionsHash = site.tags.find((t) => t[0] === "path" && t[1] === EDITIONS_PATH)?.[2];
  const json = editionsHash ? await fetchBlob(editionsHash, servers, { signal }) : null;
  const parsed = json ? parseEditions(json) : null;
  const title = site.tags.find((t) => t[0] === "title")?.[1] ?? "";
  // The path tags are what the site serves; the index only describes them.
  const fromPaths = rebuildFromPaths(site.tags);
  return {
    v: 1,
    title: parsed?.title || title,
    editions: parsed ? mergeEntries(parsed.editions, fromPaths) : fromPaths,
  };
}

/** `siteViewOf`, completed: the author's servers asked for if the store has none, and the index read. */
export async function readObserverSite(
  site: NostrEvent,
  pubkey: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<SiteView> {
  const own = await loadBlossomServers(pubkey).catch(() => ({ servers: [] as string[], found: false }));
  const servers = siteServers(site, own.servers);
  const index = await editionsOf(site, servers, signal);
  return { editions: index.editions, servers, exists: true };
}

/** When each author's site read last heard from one of their relays. */
const siteReachedAt = new Map<string, number>();

/** Whether a relay has answered a read of this author's site this session: "no site" is then an answer. */
export function observerSiteReached(pubkey: string): boolean {
  return siteReachedAt.has(pubkey);
}

/** The relays a read of this author's site asks: their write relays over the floor. */
function siteRelays(pubkey: string): Promise<string[]> {
  return outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: 2_500 }).catch(() => PROFILE_RELAYS);
}

/** The author's own write relays: whose answer settles a read of their site. */
async function writeRelays(pubkey: string): Promise<string[]> {
  const list = await loadRelayList(pubkey, { timeoutMs: 2_500 }).catch(() => null);
  return list?.write ?? [];
}

/**
 * The reader's site manifest into the store: the ask behind `useObserverSite`. The
 * hook renders whatever the store holds (the device keeps the signed-in reader's) and
 * every copy as it lands, so the slowest relay delays nothing on screen.
 */
export async function askObserverSite(pubkey: string, timeoutMs = 6_000): Promise<NostrEvent | undefined> {
  const [relays, write] = await Promise.all([siteRelays(pubkey), writeRelays(pubkey)]);
  // Settled by their own relays; the floor keeps looking in the background, and a copy
  // only it holds lands in the store — and so on the page — when it comes.
  const read = await requestNewestWithReach(
    relays,
    { kinds: [OBSERVER_SITE_KIND], authors: [pubkey], "#d": [OBSERVER_D] },
    timeoutMs,
    { settleOn: write },
  ).catch(() => ({ newest: undefined, reach: { asked: relays, answered: [] as string[] } }));
  if (read.reach.answered.length > 0) siteReachedAt.set(pubkey, Date.now());
  const held = eventStore.getReplaceable(OBSERVER_SITE_KIND, pubkey, OBSERVER_D) as NostrEvent | undefined;
  return held && beats(held, read.newest) ? held : read.newest;
}

/**
 * The reader's site as it stands, for a rewrite: the newest manifest any of their write
 * relays holds (each read to its end, and the store's copy if that is newer), and its
 * `editions.json` merged with the dated paths the manifest serves — or, when that file
 * can't be fetched, the entries those paths name. A reader with no site yet gets an
 * empty index; `reached` says whether "no site" was an answer or a silence.
 */
export async function loadObserverSite(
  pubkey: string,
  { timeoutMs = 6_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ObserverSite> {
  const relays = await siteRelays(pubkey);
  const [read, own] = await Promise.all([
    requestNewestWithReach(
      relays,
      { kinds: [OBSERVER_SITE_KIND], authors: [pubkey], "#d": [OBSERVER_D] },
      timeoutMs,
    ).catch(() => ({ newest: undefined, reach: { asked: relays, answered: [] as string[] } })),
    loadBlossomServers(pubkey, { timeoutMs }).catch(() => ({ servers: [] as string[], found: false })),
  ]);
  const held = eventStore.getReplaceable(OBSERVER_SITE_KIND, pubkey, OBSERVER_D) as NostrEvent | undefined;
  const site = held && beats(held, read.newest) ? held : read.newest;
  const reached = read.reach.answered.length > 0;
  if (reached) siteReachedAt.set(pubkey, Date.now());
  const servers = siteServers(site, own.servers);
  const base = { servers, own: own.servers, relays, reached };
  if (!site) return { ...base, event: null, index: { v: 1, title: "", editions: [] } };
  return { ...base, event: site, index: await editionsOf(site, servers, signal) };
}

export type PublishFailure = "no-servers" | "unreadable" | "upload" | "relays" | "account";

export class PublishError extends Error {
  constructor(
    message: string,
    readonly reason: PublishFailure = "upload",
  ) {
    super(message);
    this.name = "PublishError";
  }
}

interface Upload {
  text: string;
  type: string;
  sha256: string;
}

/**
 * Every file to every one of the author's servers, in parallel, each under its own
 * BUD-11 token (one `x` each: some servers refuse a token naming other blobs). A file
 * must land on at least one server, or nothing is published; the other servers are
 * mirrors, best effort. Returns the servers that took every file.
 */
async function uploadAll(uploads: Upload[], servers: string[]): Promise<string[]> {
  const expiration = String(Math.floor(Date.now() / 1000) + 600);
  // Signed one after another: a signer that prompts shows one prompt at a time.
  const tokens: string[] = [];
  for (const upload of uploads) {
    tokens.push(
      await nostrAuthHeader({
        kind: 24242,
        tags: [["t", "upload"], ["x", upload.sha256], ...serverScopeTags(servers), ["expiration", expiration]],
        content: "Publish my Observer",
      }),
    );
  }
  const put = async (upload: Upload, auth: string, server: string): Promise<boolean> => {
    try {
      const response = await fetch(`${server}/upload`, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": upload.type },
        body: new Blob([upload.text], { type: upload.type }),
      });
      if (!response.ok) return false;
      const descriptor = (await response.json().catch(() => null)) as { sha256?: string } | null;
      return !descriptor?.sha256 || descriptor.sha256.toLowerCase() === upload.sha256;
    } catch {
      return false;
    }
  };
  const results = await Promise.all(
    uploads.map((upload, i) => Promise.all(servers.map((server) => put(upload, tokens[i], server)))),
  );
  if (results.some((perServer) => !perServer.some(Boolean))) {
    throw new PublishError("None of your file servers took the page.", "upload");
  }
  return servers.filter((_, s) => results.every((perServer) => perServer[s]));
}

export interface PublishInput {
  pubkey: string;
  html: string;
  /** The reader's display name, for the site's title. */
  name: string;
  printedAt: number;
  headline?: string | null;
  code?: string;
  posts?: number;
  quotesVerified?: number;
  model?: string;
}

export interface Published {
  url: string;
  naddr: string;
  editions: EditionEntry[];
  /** Where the files are: the author's servers, the ones that took everything first. */
  servers: string[];
}

/**
 * Today's paper into the reader's Observer site: read, upload, upsert, roll off,
 * regenerate the archive and index, assemble, sign, publish (the spec's steps 1–7).
 * Throws `PublishError` (or a signer error) and publishes nothing when a step fails —
 * including when the author has no Blossom server list (nothing goes to a server they
 * didn't choose) and when none of their relays answered the read (a rewrite from
 * nothing would drop every earlier edition).
 */
export async function publishToObserver(input: PublishInput): Promise<Published> {
  const account = activeAccount();
  if (!account || account.pubkey !== input.pubkey) throw new PublishError("Sign in as yourself to publish.", "account");

  const site = await loadObserverSite(input.pubkey);
  if (site.own.length === 0) {
    throw new PublishError("Add a Blossom file server to publish your Observer.", "no-servers");
  }
  if (!site.reached) {
    throw new PublishError("None of your relays answered, so nothing was published. Try again.", "unreadable");
  }
  const servers = site.own;

  // The copy that leaves the app carries the app's CSP (idempotent: printFrontPage adds it).
  const html = withPaperCsp(input.html);
  const now = Date.now();
  const day = utcDay(input.printedAt);
  const sha256 = await sha256Text(html);
  const entry: EditionEntry = {
    day,
    path: editionPath(day),
    sha256,
    ...(input.headline ? { headline: input.headline } : {}),
    ...(input.code ? { code: input.code } : {}),
    printedAt: Math.floor(input.printedAt / 1000),
    ...(input.posts !== undefined ? { posts: input.posts } : {}),
    ...(input.quotesVerified !== undefined ? { quotesVerified: input.quotesVerified } : {}),
    ...(input.model ? { model: input.model } : {}),
  };

  const title = siteTitle(input.name);
  const description = siteDescription(input.name);
  const createdAt = Math.max(Math.floor(now / 1000), (site.event?.created_at ?? 0) + 1);
  const maxDay = latestDay(now);
  // The write relays' own NIP-11 limits; the spec's defaults where none publish them.
  const limits = await relayLimits(site.relays);
  const kept = rollOff(upsertEdition(site.index.editions, entry), {
    budget: eventBudget(limits.map((l) => l.maxMessageLength)) - SIGNER_TAG_SLACK,
    maxTags: tagBudget(limits.map((l) => l.maxEventTags)) - SIGNER_TAGS,
    servers,
    title,
    description,
    createdAt,
    protect: day,
    maxDay,
  });

  const index: EditionsIndex = { v: 1, title, editions: kept };
  const editionsJson = serializeEditions(index);
  const archive = archiveHtml(index);
  const files = { archive: await sha256Text(archive), editions: await sha256Text(editionsJson) };

  const stored = await uploadAll(
    [
      { text: html, type: "text/html", sha256 },
      { text: archive, type: "text/html", sha256: files.archive },
      { text: editionsJson, type: "application/json", sha256: files.editions },
    ],
    servers,
  );
  const listed = dedupe([...stored, ...servers]);
  // Kept here as well: the page reads the new edition and index back by hash, and the
  // bytes it just uploaded are those bytes.
  await Promise.all([
    writeBlob(sha256, html),
    writeBlob(files.archive, archive),
    writeBlob(files.editions, editionsJson),
  ]).catch(() => undefined);

  const manifest = (aggregate: string) =>
    manifestTemplate({ entries: kept, files, servers: listed, title, description, aggregate, maxDay });
  const template = manifest(await aggregateHash(manifest("").tags));

  const signed = await signAs(account, { ...template, created_at: createdAt });
  const outcome = await publishToRelays(signed, site.relays, { need: 1, timeoutMs: 8000 });
  if (!outcome.success) throw new PublishError("None of your relays took the site.", "relays");
  eventStore.add(signed);
  return {
    url: observerUrl(input.pubkey),
    naddr: observerNaddr(input.pubkey, site.relays),
    editions: kept,
    servers: listed,
  };
}

/**
 * The lead headline, as the brief defines it: the first `h2.lead-head` / `h2.main-head`,
 * else the first h2 or h1 outside the masthead (whose h1 is the paper's name, not news).
 */
export function leadHeadline(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const outsideMasthead = (el: Element) => !el.closest(".masthead");
    const lead =
      doc.querySelector("h2.lead-head, h2.main-head") ??
      Array.from(doc.querySelectorAll("h2")).find(outsideMasthead) ??
      Array.from(doc.querySelectorAll("h1")).find(outsideMasthead);
    const text = (lead?.textContent ?? "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 200) : null;
  } catch {
    return null;
  }
}
